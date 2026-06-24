import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  runLifecycle,
  PLANNING_PHASES,
  CYCLE_PHASES,
  type LifecycleContext,
  type LifecycleResult,
  type PhaseTrace,
} from "./lifecycle.js";
import { clearCheckpoint } from "./checkpoint.js";

// Dependency seam so the loop can be unit-tested against a stub lifecycle runner.
export interface IssueLoopDeps {
  runLifecycle: typeof runLifecycle;
}

const DEFAULT_DEPS: IssueLoopDeps = { runLifecycle };

// The parsed issue list, persisted next to the checkpoint. On --resume the ISSUES phase is
// skipped (no fresh output to re-parse), so the loop reloads the slice list from here instead
// of collapsing to a single whole-build cycle. Cleared with the checkpoint on a fresh/finished run.
function issuesFile(cwd: string): string {
  return join(cwd, ".adlc", "issues.json");
}

function persistIssues(cwd: string, issues: string[]): void {
  const path = issuesFile(cwd);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(issues, null, 2));
}

function loadPersistedIssues(cwd: string): string[] | null {
  const path = issuesFile(cwd);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return Array.isArray(parsed) && parsed.every((x) => typeof x === "string") ? (parsed as string[]) : null;
  } catch {
    return null;
  }
}

function clearIssues(cwd: string): void {
  rmSync(issuesFile(cwd), { force: true });
}

// Parse the issues (tracer-bullet vertical slices) emitted by the to-issues phase into a list
// of issue blocks. to-issues writes each slice under a "## What to build" heading; we also
// accept "## Issue"/"## Slice" headings and a top-level numbered list as fallbacks. Returns the
// text block per issue (used as the task for that issue's cycle). Empty array => no parse.
export function parseIssues(text: string): string[] {
  if (!text || !text.trim()) return [];

  // 1) Heading-delimited issues: "## What to build", "## Issue 2", "### Slice: …", etc.
  const headerRe = /^[ \t]*#{1,4}[ \t]+(?:issue|slice|what to build)\b.*$/gim;
  const headers = [...text.matchAll(headerRe)];
  if (headers.length > 0) {
    const blocks: string[] = [];
    for (let i = 0; i < headers.length; i++) {
      const start = headers[i].index ?? 0;
      const end = i + 1 < headers.length ? (headers[i + 1].index ?? text.length) : text.length;
      const block = text.slice(start, end).trim();
      if (block) blocks.push(block);
    }
    if (blocks.length > 0) return blocks;
  }

  // 2) Fallback: top-level numbered list ("1. …", "2) …") — each item is an issue.
  const numberedRe = /^[ \t]*\d+[.)][ \t]+/;
  const lines = text.split("\n");
  const items: string[] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (numberedRe.test(line)) {
      if (current) items.push(current.join("\n").trim());
      current = [line];
    } else if (current) {
      current.push(line);
    }
  }
  if (current) items.push(current.join("\n").trim());
  return items.filter((b) => b.length > 0);
}

// Build the per-issue cycle task: the overall build task plus this specific slice.
function issueTask(baseTask: string, issue: string, index: number, total: number): string {
  return [
    `Work issue ${index}/${total} of the build.`,
    `Implement ONLY this vertical slice end-to-end, then review, verify, QA, and finish its branch.`,
    ``,
    `=== ISSUE ${index} ===`,
    issue,
    ``,
    `=== OVERALL BUILD CONTEXT ===`,
    baseTask,
  ].join("\n");
}

// Runs the runner-driven pipeline as: PLANNING_PHASES once, then CYCLE_PHASES once per parsed
// issue, halting at the first failed cycle (the gate has teeth). Conforms to the runLifecycle
// signature so it can be dropped in as the orchestrator's runLifecycle dependency. The global
// tail (DEPLOY/SHIP/EMAIL) is handled by the orchestrator after this returns ok.
export async function runIssuePipeline(
  ctx: LifecycleContext,
  deps: IssueLoopDeps = DEFAULT_DEPS,
): Promise<LifecycleResult> {
  const resume = ctx.resume ?? false;
  // This loop owns the checkpoint across all its sub-runs (sub-runs pass manageCheckpoint:false),
  // so a fresh (non-resume) run wipes the slate exactly once here. A resume run keeps the prior
  // checkpoint + persisted issues so completed planning/issue cycles are skipped.
  if (!resume) {
    clearCheckpoint(ctx.cwd);
    clearIssues(ctx.cwd);
  }

  // 1) Planning once: PRD → ISSUES.
  const planning = await deps.runLifecycle({
    ...ctx,
    phases: PLANNING_PHASES,
    manageCheckpoint: false,
  });
  const traces: PhaseTrace[] = [...planning.phases];
  if (!planning.ok) {
    return { phases: traces, ok: false };
  }

  // 2) Determine the issue list. Prefer freshly-parsed ISSUES output; on resume the ISSUES phase
  //    is skipped (its trace carries no text), so fall back to the persisted list. Only if both
  //    are empty do we run a single whole-build cycle — never skip implementation entirely.
  const issuesTrace = planning.phases.find((p) => p.phase === "ISSUES");
  let issues = parseIssues(issuesTrace?.text ?? "");
  if (issues.length === 0) {
    const persisted = loadPersistedIssues(ctx.cwd);
    if (persisted && persisted.length > 0) {
      issues = persisted;
      console.log(`[issue-loop] reloaded ${issues.length} persisted issue(s) (resume)`);
    }
  }
  if (issues.length === 0) {
    console.log("[issue-loop] no issues parsed from ISSUES output — running a single whole-build cycle");
    issues = [ctx.task];
  } else {
    persistIssues(ctx.cwd, issues);
    console.log(`[issue-loop] ${issues.length} issue(s) — running one cycle per issue`);
  }

  // 3) One implement→review→verify→qa→finish cycle per issue, in the order emitted (deps order).
  //    Each cycle is checkpoint-keyed by issue ("#<index>") so a resume skips finished issues.
  for (let i = 0; i < issues.length; i++) {
    const index = i + 1;
    console.log(`[issue-loop] issue ${index}/${issues.length} cycle start`);
    const cycle = await deps.runLifecycle({
      ...ctx,
      phases: CYCLE_PHASES,
      task: issueTask(ctx.task, issues[i], index, issues.length),
      issueKey: `#${index}`,
      manageCheckpoint: false,
    });
    for (const t of cycle.phases) traces.push({ ...t, issue: index });
    if (!cycle.ok) {
      console.error(`[issue-loop] issue ${index}/${issues.length} cycle FAILED — halting; tail withheld.`);
      return { phases: traces, ok: false };
    }
  }

  // Whole runner-driven pipeline passed — drop the checkpoint + persisted issues so the next
  // run starts fresh (the orchestrator's tail provisioning is idempotent and not checkpointed).
  clearCheckpoint(ctx.cwd);
  clearIssues(ctx.cwd);
  return { phases: traces, ok: true };
}
