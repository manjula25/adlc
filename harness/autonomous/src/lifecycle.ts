import { execSync } from "node:child_process";

import type { Brief } from "./brief.js";
import { appendAssumption } from "./assumptions.js";
import { clearCheckpoint, loadCheckpoint, recordPhase } from "./checkpoint.js";
import { runWithRunner, type RunnerConfig, type PoAnswerFn } from "./router.js";
import type { DoubtRunResult } from "./doubt-loop.js";

export type Phase =
  | "INTAKE"
  | "GRILL"
  | "PRD"
  | "ISSUES"
  | "IMPLEMENT"
  | "REVIEW"
  | "VERIFY"
  | "QA"
  | "FINISH";

export interface PhaseConfig {
  name: Phase;
  runner: "claude" | "codex";
  skill: string;
  gate?: (result: DoubtRunResult) => boolean;
  // Phases that mutate the workspace need a writable sandbox. Analysis phases stay
  // read-only (default). Without this, IMPLEMENT runs codex `-s read-only` and writes
  // nothing — the cause of the empty target repo.
  allowEdits?: boolean;
  // Phases that MUST produce a workspace change to be considered done. Guards the
  // empty-target-repo failure (HANDOFF.md): a runner that no-ops but prints "PASS"
  // would otherwise sail through every gate and push an empty tree. When set, the
  // phase fails unless `git status` shows the working tree changed during the phase.
  requireMutation?: boolean;
}

// A gate verdict is the skill's own machine-readable signal, not the runner's exit code.
// `r.ok` only means "the CLI exited 0 with non-empty output" — a QA phase whose tests
// FAILED still exits 0 and prints a report. The gate must read that report's verdict.
//
// qa-run/verify/finish emit "verdict: **PASS**" or "**FAIL**"; review emits "APPROVE" or
// "REQUEST CHANGES". Negative verdicts win ties (fail-closed): if the text says both,
// treat it as not-passed.
export function qaGate(r: DoubtRunResult): boolean {
  if (!r.ok) return false;
  const t = r.text.toUpperCase();
  if (/\bFAIL\b/.test(t)) return false;
  return /\bPASS\b/.test(t);
}

export function reviewGate(r: DoubtRunResult): boolean {
  if (!r.ok) return false;
  const t = r.text.toUpperCase();
  if (t.includes("REQUEST CHANGES")) return false;
  return t.includes("APPROVE");
}

// verification-before-completion emits "Verification verdict: PASS/FAIL" — same PASS/FAIL
// shape as qa-run, fail-closed on a tie. Evidence-before-claims: a missing verdict is a FAIL.
export function verifyGate(r: DoubtRunResult): boolean {
  if (!r.ok) return false;
  const t = r.text.toUpperCase();
  if (/\bFAIL\b/.test(t)) return false;
  return /\bPASS\b/.test(t);
}

// finishing-a-development-branch emits "Finish verdict: PASS/FAIL" — it refuses to finish a
// branch whose tests are red. PASS/FAIL shape, fail-closed on a tie.
export function finishGate(r: DoubtRunResult): boolean {
  if (!r.ok) return false;
  const t = r.text.toUpperCase();
  if (/\bFAIL\b/.test(t)) return false;
  return /\bPASS\b/.test(t);
}

export const PHASES: PhaseConfig[] = [
  { name: "INTAKE",     runner: "claude", skill: "intake" },
  { name: "GRILL",      runner: "claude", skill: "grill-with-docs" }, // BA role (= ba-agent subagent in-session)
  { name: "PRD",        runner: "claude", skill: "to-prd" },          // Matt Pocock to-prd (was create-prd.md)
  { name: "ISSUES",     runner: "claude", skill: "to-issues" },       // Matt Pocock to-issues (was plan-feature)
  // ── per-issue cycle (repeated once per parsed issue from ISSUES) ──────────────
  { name: "IMPLEMENT",  runner: "codex",  skill: "implement", allowEdits: true, requireMutation: true },
  { name: "REVIEW",     runner: "codex",  skill: "review",      gate: reviewGate }, // Matt Pocock review (was code-review.md)
  { name: "VERIFY",     runner: "codex",  skill: "verification-before-completion", gate: verifyGate, allowEdits: true },
  { name: "QA",         runner: "codex",  skill: "qa-run",     gate: qaGate, allowEdits: true },
  { name: "FINISH",     runner: "codex",  skill: "finishing-a-development-branch", gate: finishGate, allowEdits: true },
  // The global tail (provision repo + feature branch, Supabase schema, Vercel preview, open the
  // PR for human review, email the URL) is NOT a runner phase — it runs as deterministic cloud
  // code modules in the orchestrator after every issue cycle is green. See orchestrator.ts.
];

// Runner-driven planning phases — run ONCE before the per-issue loop. INTAKE/GRILL are done
// by dedicated code modules before these; the deploy/PR/email tail is done by the orchestrator after.
export const PLANNING_PHASES: PhaseConfig[] = PHASES.filter((p) =>
  ["PRD", "ISSUES"].includes(p.name),
);

// The per-issue cycle body — run ONCE PER parsed issue (tracer-bullet slice) from ISSUES.
export const CYCLE_PHASES: PhaseConfig[] = PHASES.filter((p) =>
  ["IMPLEMENT", "REVIEW", "VERIFY", "QA", "FINISH"].includes(p.name),
);

export interface LifecycleContext {
  config: RunnerConfig;
  brief: Brief;
  cwd: string;
  task: string;
  retryCap?: number;
  // Subset/override of phases to run flat. The issue loop (runIssuePipeline) passes
  // PLANNING_PHASES once and CYCLE_PHASES once per issue; INTAKE/GRILL/DEPLOY/SHIP/EMAIL
  // are handled outside the runner state machine.
  phases?: PhaseConfig[];
  // Decision oracle used inside each skill's doubt loop. Defaults to the rule-based matcher.
  poAnswer?: PoAnswerFn;
  // Resume from the on-disk checkpoint: skip phases that already passed in a prior run.
  resume?: boolean;
  // Namespace suffix for checkpoint keys (e.g. "#2" for issue 2) so the same phase name run
  // once per issue gets a distinct resume key. Undefined for one-shot (planning/tail) phases.
  issueKey?: string;
  // When false, the caller (the issue loop) owns clearing the checkpoint across sub-runs; this
  // run only records per-phase wins and never wipes. Defaults true (self-managed one-shot run).
  manageCheckpoint?: boolean;
}

export interface PhaseTrace {
  phase: Phase;
  runner: string;
  // The 1-based issue index this trace belongs to (per-issue cycle phases only). Planning
  // and tail phases run once and leave this undefined.
  issue?: number;
  // Tail of the runner's output for this phase. The issue loop parses the ISSUES phase text
  // from here to enumerate the per-issue cycles.
  text?: string;
  ok: boolean;
  // True only if the phase's gate verdict passed (or the phase has no gate). A gate that
  // never passed within the retry cap leaves this false even though the run "proceeded".
  gatePassed: boolean;
  assumptions: number;
  retriesUsed: number;
}

export interface LifecycleResult {
  phases: PhaseTrace[];
  ok: boolean;
}

export async function runLifecycle(ctx: LifecycleContext): Promise<LifecycleResult> {
  const cap = ctx.retryCap ?? 2;
  const traces: PhaseTrace[] = [];
  const phases = ctx.phases ?? PHASES;

  // Resume: skip phases already passed in a prior run. A fresh (non-resume) self-managed run
  // wipes any stale checkpoint so it starts clean. When manageCheckpoint is false the issue
  // loop owns the clearing across its sub-runs, so this run never wipes.
  const resume = ctx.resume ?? false;
  const manage = ctx.manageCheckpoint ?? true;
  const keyFor = (name: Phase): string => (ctx.issueKey ? `${name}${ctx.issueKey}` : name);
  const done = new Set<string>(resume ? (loadCheckpoint(ctx.cwd)?.completed ?? []) : []);
  if (manage && !resume) clearCheckpoint(ctx.cwd);

  for (const phaseConfig of phases) {
    if (done.has(keyFor(phaseConfig.name))) {
      console.log(`[lifecycle] ${phaseConfig.name} skipped (resume — already passed)`);
      traces.push({
        phase: phaseConfig.name,
        runner: phaseConfig.runner,
        ok: true,
        gatePassed: true,
        assumptions: 0,
        retriesUsed: 0,
      });
      continue;
    }

    let lastResult: DoubtRunResult | null = null;
    let retriesUsed = 0;
    let gatePassed = false;

    // Snapshot the workspace before a mutation-required phase so we can prove it actually
    // wrote something (empty-diff guard). null when cwd isn't a git repo → guard disabled.
    const beforeSnapshot = phaseConfig.requireMutation ? gitPorcelain(ctx.cwd) : null;

    console.log(`[lifecycle] ${phaseConfig.name} start (runner=${phaseConfig.runner})`);

    for (let attempt = 0; attempt <= cap; attempt++) {
      lastResult = await runWithRunner(
        phaseConfig.runner,
        ctx.task,
        phaseConfig.skill,
        ctx.config,
        ctx.brief,
        ctx.cwd,
        phaseConfig.name,
        ctx.poAnswer,
        phaseConfig.allowEdits ?? false,
      );

      // A phase that must mutate the workspace (IMPLEMENT) but didn't is treated as a
      // gate failure: a no-op run that prints "PASS" must NOT pass. Skipped when the cwd
      // isn't a git repo (dry runs / unit tests) — we can't assert, so we don't block.
      const mutationOk =
        !phaseConfig.requireMutation || workspaceChanged(ctx.cwd, beforeSnapshot);
      if ((!phaseConfig.gate || phaseConfig.gate(lastResult)) && mutationOk) {
        gatePassed = true;
        retriesUsed = attempt;
        break;
      }

      if (!mutationOk) {
        console.error(
          `[lifecycle] ${phaseConfig.name} produced no workspace changes — treating as FAIL (empty-diff guard)`,
        );
      }

      retriesUsed = attempt + 1;

      if (attempt === cap) {
        // §8: zero-human, so never pause for input — but a failed quality gate is NOT a
        // doubt to assume away. Log it and let it fail the phase (ok=false below), so the
        // run reports failure honestly and the orchestrator withholds the deploy.
        appendAssumption(ctx.cwd, {
          phase: phaseConfig.name,
          question: `Gate failed after ${cap} retries`,
          decision: "Gate not satisfied — phase marked FAILED, deploy withheld",
          confidence: 0.0,
          grounding: "no grounding — default",
          at: new Date().toISOString(),
        });
      }
    }

    // A phase is ok only if the runner succeeded AND its gate verdict passed. A cleanly
    // exiting runner whose gate never passed is a FAILED phase, not a green one.
    const runnerOk = lastResult?.ok ?? false;
    const ok = runnerOk && gatePassed;
    console.log(
      `[lifecycle] ${phaseConfig.name} ${ok ? "ok" : "FAILED"} (retries=${retriesUsed}, gate=${gatePassed ? "pass" : "FAIL"}, assumptions=${lastResult?.assumptions.length ?? 0})`,
    );

    // On failure, say WHY inline so the issue is findable without scrolling the raw
    // runner dump: a runner error (bad prompt / crash / empty output) vs a quality gate
    // that the runner cleanly reported as not-passed. Then echo the tail of the runner's
    // own output — that is where the codex/claude error or the PASS/FAIL verdict lives.
    if (!ok) {
      const reason = !runnerOk
        ? `runner=${phaseConfig.runner} produced no usable result (nonzero exit or empty output) — likely a CLI/prompt error`
        : `gate verdict not satisfied after ${retriesUsed} retr${retriesUsed === 1 ? "y" : "ies"} — runner ran clean but the report did not say ${phaseConfig.name === "REVIEW" ? "APPROVE" : "PASS"}`;
      console.error(`[lifecycle] ${phaseConfig.name} reason: ${reason}`);
      const snippet = lastResultTail(lastResult?.text);
      if (snippet) console.error(`[lifecycle] ${phaseConfig.name} ↳ ${snippet}`);
    }

    traces.push({
      phase: phaseConfig.name,
      runner: phaseConfig.runner,
      text: lastResult?.text,
      ok,
      gatePassed,
      assumptions: lastResult?.assumptions.length ?? 0,
      retriesUsed,
    });

    // Persist the win immediately so a crash/abort mid-pipeline can resume from here.
    if (ok) recordPhase(ctx.cwd, keyFor(phaseConfig.name));

    // Gate has teeth: stop the pipeline at the first failed phase. No point reviewing or
    // deploying output that did not pass. The failure is already logged + in ASSUMPTIONS.md.
    if (!ok) {
      console.error(`[lifecycle] halting — ${phaseConfig.name} did not pass; downstream phases skipped.`);
      break;
    }
  }

  const ok = traces.every((t) => t.ok) && traces.length === phases.length;
  // Whole lifecycle passed — drop the checkpoint so the next run starts fresh. When the issue
  // loop manages the checkpoint, it clears once at the end of the whole pipeline instead.
  if (manage && ok) clearCheckpoint(ctx.cwd);
  return { phases: traces, ok };
}

// `git status --porcelain` for cwd, or null if cwd isn't a git repo (or git is missing).
// Includes untracked files (-u) so a phase that only adds brand-new files still counts.
function gitPorcelain(cwd: string): string | null {
  try {
    return execSync("git status --porcelain -u", {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

// True if the workspace changed during the phase. When we couldn't snapshot before (not a
// git repo) we return true: the guard can't assert, so it must not block (dry runs/tests).
function workspaceChanged(cwd: string, before: string | null): boolean {
  if (before === null) return true;
  const after = gitPorcelain(cwd);
  if (after === null) return true;
  return after !== before;
}

// Last ~280 chars of the runner output, whitespace-collapsed to one line — enough to show
// the codex/claude error or the gate verdict without flooding the milestone log.
function lastResultTail(text?: string): string {
  if (!text) return "";
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return "";
  const tail = flat.length > 280 ? `…${flat.slice(-280)}` : flat;
  return tail;
}
