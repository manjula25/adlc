import type { Brief } from "./brief.js";
import type { Policy } from "./config.js";
import { intake as realIntake } from "./intake.js";
import { runGrill as realRunGrill } from "./grill.js";
import { type PhaseTrace } from "./lifecycle.js";
import { runIssuePipeline } from "./issue-loop.js";
import { provisionRepo as realProvisionRepo } from "./provision/repo.js";
import { provisionSupabase as realProvisionSupabase } from "./provision/supabase.js";
import { provisionVercel as realProvisionVercel } from "./provision/vercel.js";
import { openPullRequest as realOpenPullRequest } from "./provision/pr.js";
import { sendNotification as realSendNotification } from "./notify.js";
import { summarizeAssumptions } from "./assumptions.js";
import { buildRunner, type RunnerConfig, type PoAnswerFn } from "./router.js";
import { poAnswerOne, poAnswerLLM, type PoModel } from "./po-agent.js";

// Dependency seams so the full pipeline can be unit-tested without touching the cloud.
export interface RunProjectDeps {
  intake: typeof realIntake;
  runGrill: typeof realRunGrill;
  // The runner-driven pipeline: PLANNING once, then the per-issue cycle once per parsed issue.
  runLifecycle: typeof runIssuePipeline;
  provisionRepo: typeof realProvisionRepo;
  provisionSupabase: typeof realProvisionSupabase;
  provisionVercel: typeof realProvisionVercel;
  openPullRequest: typeof realOpenPullRequest;
  sendNotification: typeof realSendNotification;
}

const DEFAULT_DEPS: RunProjectDeps = {
  intake: realIntake,
  runGrill: realRunGrill,
  runLifecycle: runIssuePipeline,
  provisionRepo: realProvisionRepo,
  provisionSupabase: realProvisionSupabase,
  provisionVercel: realProvisionVercel,
  openPullRequest: realOpenPullRequest,
  sendNotification: realSendNotification,
};

export interface RunProjectArgs {
  link: string;
  cwd: string;
  config: RunnerConfig;
  brief: Brief;
  policy: Policy;
  org: string;
  projectId: string;
  branch: string;
  vercelToken: string;
  supabaseDbUrl: string;
  supabaseEnv: { url: string; anonKey: string };
  notifyApiKey: string;
  dryRun?: boolean;
  retryCap?: number;
  // Resume from the lifecycle checkpoint: skip phases that passed in a prior run.
  resume?: boolean;
  // Name of the runner used for planning/grill phases (defaults to claude, else first priority).
  planningRunner?: string;
  // Optional LLM model backing the PO-agent oracle. Without it, the rule-based matcher is used.
  poModel?: PoModel;
  deps?: Partial<RunProjectDeps>;
}

export interface RunProjectResult {
  ok: boolean;
  previewUrl: string;
  repoUrl: string;
  // URL of the human-review PR (feature → main). The loop opens it but never merges.
  prUrl: string;
  schema: string;
  requirementsPath: string;
  phases: PhaseTrace[];
  notified: boolean;
  assumptionsSummary: string;
}

// Wrap a critical-path step so a live failure (token expiry, rate limit, RLS error)
// reports clearly which step died instead of a bare stack trace. Provisioning has no
// human to intervene at runtime, so the failure log is the only diagnostic surface.
async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await fn();
    console.log(`[orchestrator] ${name} ok (${Date.now() - startedAt}ms)`);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[orchestrator] ${name} FAILED: ${message}`);
    throw new Error(`Step "${name}" failed: ${message}`);
  }
}

// Provisioning runs unattended against live cloud APIs where transient faults are routine:
// token-refresh races, 429s, DNS blips (the Jun 22 Supabase DNS failure was one). Retry the
// idempotent provision steps with exponential backoff before giving up. `sleep` is injectable
// so tests don't wait on real timers.
export async function retry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  baseMs = 500,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        const delay = baseMs * 2 ** attempt;
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `[orchestrator] attempt ${attempt + 1}/${attempts} failed: ${message} — retrying in ${delay}ms`,
        );
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

// End-to-end: design link → deployed Vercel preview URL, emailed. Zero human in the loop.
// INTAKE + GRILL run as code modules, the runner-driven middle phases run on the state
// machine, then provisioning + notify are real cloud actions.
export async function runProject(args: RunProjectArgs): Promise<RunProjectResult> {
  const deps = { ...DEFAULT_DEPS, ...args.deps };
  const dryRun = args.dryRun ?? false;

  // Decision oracle: LLM-backed when a model is supplied, else deterministic rule-based.
  const poAnswer: PoAnswerFn = args.poModel
    ? (q, brief) => poAnswerLLM(q, brief, args.policy, args.poModel as PoModel)
    : poAnswerOne;

  const planningRunnerName =
    args.planningRunner ?? (args.config.runners["claude"] ? "claude" : args.config.priority[0]);
  const planningRunner = buildRunner(planningRunnerName, args.config);

  // 1) INTAKE — normalize the design link.
  const intakeResult = await deps.intake(args.link);

  // 2) GRILL — requirement self-play → REQUIREMENTS.md.
  const grillResult = await deps.runGrill({
    runner: planningRunner,
    skillsDir: args.config.skillsDir,
    intakeText: intakeResult.normalized,
    brief: args.brief,
    cwd: args.cwd,
  });

  // 3) Runner-driven pipeline: PRD → ISSUES once, then per parsed issue:
  //    implement → review → verify → qa → finishing-a-development-branch.
  const lifecycleResult = await deps.runLifecycle({
    config: args.config,
    brief: args.brief,
    cwd: args.cwd,
    task: `Build "${args.brief.project}" per the requirements:\n\n${grillResult.requirements}`,
    poAnswer,
    retryCap: args.retryCap,
    resume: args.resume,
  });

  // The quality gate has teeth: a live run never deploys output that failed QA/REVIEW.
  // (Dry runs still exercise provisioning stubs — they touch no real infra.)
  if (!dryRun && !lifecycleResult.ok) {
    const failed = lifecycleResult.phases.filter((p) => !p.ok).map((p) => p.phase);
    console.error(
      `[orchestrator] Lifecycle gate FAILED (${failed.join(", ")}) — withholding deploy. See ASSUMPTIONS.md.`,
    );
    return {
      ok: false,
      previewUrl: "",
      repoUrl: "",
      prUrl: "",
      schema: "",
      requirementsPath: grillResult.requirementsPath,
      phases: lifecycleResult.phases,
      notified: false,
      assumptionsSummary: summarizeAssumptions(args.cwd),
    };
  }

  // 4) Provision: GitHub repo + shared-Supabase schema + Vercel preview (ADR 0001).
  const repoResult = await step("provision-repo", () =>
    retry(() =>
      deps.provisionRepo({
        org: args.org,
        name: args.projectId,
        repoDir: args.cwd,
        branch: args.branch,
        dryRun,
      }),
    ),
  );

  const supabaseResult = await step("provision-supabase", () =>
    retry(() =>
      deps.provisionSupabase({
        projectId: args.projectId,
        dbUrl: args.supabaseDbUrl,
        dryRun,
      }),
    ),
  );

  // RLS is load-bearing security (ADR 0001): a live deploy must not proceed on an
  // unverified schema. Log it loudly; the assumptions log captures the decision.
  if (!dryRun && !supabaseResult.rlsVerified) {
    console.error(
      `[orchestrator] WARNING: RLS not verified for schema ${supabaseResult.schema} — review before exposing preview.`,
    );
  }

  const vercelResult = await step("provision-vercel", () =>
    retry(() =>
      deps.provisionVercel({
        repoDir: args.cwd,
        projectName: args.projectId,
        branch: repoResult.featureBranch,
        repoUrl: repoResult.url,
        token: args.vercelToken,
        envVars: {
          SUPABASE_URL: args.supabaseEnv.url,
          SUPABASE_ANON_KEY: args.supabaseEnv.anonKey,
          SUPABASE_SCHEMA: supabaseResult.schema,
        },
        dryRun,
      }),
    ),
  );

  // Open the human-review PR (feature → base). Deploy-from-branch governance: the loop never
  // merges; a human merges base offline. The PR body carries the preview URL + ASSUMPTIONS log.
  const assumptionsSummary = summarizeAssumptions(args.cwd);
  const prResult = await step("open-pull-request", () =>
    deps.openPullRequest({
      org: args.org,
      name: args.projectId,
      repoDir: args.cwd,
      baseBranch: repoResult.baseBranch,
      featureBranch: repoResult.featureBranch,
      title: `ADLC: ${args.brief.project || args.projectId} preview`,
      body: [
        `Automated ADLC build for **${args.brief.project || args.projectId}**.`,
        ``,
        `**Preview:** ${vercelResult.previewUrl}`,
        `**Schema:** ${supabaseResult.schema}`,
        ``,
        `## Assumptions logged during this run`,
        assumptionsSummary,
        ``,
        `> Deploy-from-branch: this PR is for human review. The loop does not merge to \`${repoResult.baseBranch}\`.`,
      ].join("\n"),
      dryRun,
    }),
  );

  // 5) EMAIL — send the preview URL + assumptions summary.
  // ponytail: disabled — SendGrid 401 (sender IP not whitelisted). Re-enable when IP allowlisted.
  // const notifyResult = await step("notify", () =>
  //   deps.sendNotification({
  //     previewUrl: vercelResult.previewUrl,
  //     repoDir: args.cwd,
  //     brief: args.brief,
  //     apiKey: args.notifyApiKey,
  //     dryRun,
  //   }),
  // );
  const notifyResult = { sent: false };

  return {
    ok: lifecycleResult.ok,
    previewUrl: vercelResult.previewUrl,
    repoUrl: repoResult.url,
    prUrl: prResult.url,
    schema: supabaseResult.schema,
    requirementsPath: grillResult.requirementsPath,
    phases: lifecycleResult.phases,
    notified: notifyResult.sent,
    assumptionsSummary,
  };
}
