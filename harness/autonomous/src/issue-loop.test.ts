import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { parseIssues, runIssuePipeline } from "./issue-loop.js";
import {
  PLANNING_PHASES,
  CYCLE_PHASES,
  type LifecycleContext,
  type LifecycleResult,
  type PhaseConfig,
  type PhaseTrace,
} from "./lifecycle.js";
import type { Brief } from "./brief.js";
import type { RunnerConfig } from "./router.js";

const brief: Brief = { project: "test", decisions: {} };
const config: RunnerConfig = {
  skillsDir: "/nonexistent/skills",
  priority: ["claude", "codex"],
  runners: { claude: { kind: "claude" }, codex: { kind: "codex" } },
};
function tmpCtx(extra: Partial<LifecycleContext> = {}): LifecycleContext {
  return { config, brief, cwd: mkdtempSync(join(tmpdir(), "adlc-issue-loop-")), task: "build the thing", ...extra };
}

// Build a LifecycleResult for a phase list, stamping the ISSUES phase with the supplied text.
function result(phases: PhaseConfig[], ok: boolean, issuesText = ""): LifecycleResult {
  const traces: PhaseTrace[] = phases.map((p) => ({
    phase: p.name,
    runner: p.runner,
    text: p.name === "ISSUES" ? issuesText : "",
    ok,
    gatePassed: ok,
    assumptions: 0,
    retriesUsed: 0,
  }));
  return { phases: traces, ok };
}

describe("parseIssues", () => {
  it("splits 'What to build' headed slices into one block each", () => {
    const text = [
      "Here are the slices:",
      "## What to build",
      "Slice A end-to-end.",
      "## What to build",
      "Slice B end-to-end.",
    ].join("\n");
    const issues = parseIssues(text);
    expect(issues).toHaveLength(2);
    expect(issues[0]).toContain("Slice A");
    expect(issues[1]).toContain("Slice B");
  });

  it("falls back to a top-level numbered list", () => {
    const text = "1. First slice\n   more detail\n2. Second slice\n3. Third slice";
    const issues = parseIssues(text);
    expect(issues).toHaveLength(3);
    expect(issues[0]).toContain("First slice");
  });

  it("returns [] for empty/blank text", () => {
    expect(parseIssues("")).toEqual([]);
    expect(parseIssues("   \n  ")).toEqual([]);
  });
});

describe("runIssuePipeline", () => {
  it("runs planning once, then one cycle per parsed issue", async () => {
    const issuesText = "## What to build\nSlice A\n## What to build\nSlice B";
    const runLifecycle = vi.fn(async (ctx: LifecycleContext) => {
      const names = (ctx.phases ?? []).map((p) => p.name);
      return names.includes("ISSUES")
        ? result(PLANNING_PHASES, true, issuesText)
        : result(CYCLE_PHASES, true);
    });

    const res = await runIssuePipeline(tmpCtx(), { runLifecycle });
    expect(res.ok).toBe(true);
    // 1 planning call + 2 cycle calls (one per issue).
    expect(runLifecycle).toHaveBeenCalledTimes(3);
    // traces = PLANNING (2) + CYCLE (5) * 2 issues.
    expect(res.phases).toHaveLength(PLANNING_PHASES.length + CYCLE_PHASES.length * 2);
    // cycle traces are tagged with their 1-based issue index.
    const finishTraces = res.phases.filter((p) => p.phase === "FINISH");
    expect(finishTraces.map((t) => t.issue)).toEqual([1, 2]);

    // sub-runs are checkpoint-keyed per issue and let the loop own the checkpoint.
    const cycleCalls = runLifecycle.mock.calls.filter((c) => !(c[0].phases ?? []).some((p) => p.name === "ISSUES"));
    expect(cycleCalls.map((c) => c[0].issueKey)).toEqual(["#1", "#2"]);
    expect(cycleCalls.every((c) => c[0].manageCheckpoint === false)).toBe(true);
  });

  it("stops and returns failure if planning fails (no cycles run)", async () => {
    const runLifecycle = vi.fn(async () => result(PLANNING_PHASES, false));
    const res = await runIssuePipeline(tmpCtx(), { runLifecycle });
    expect(res.ok).toBe(false);
    expect(runLifecycle).toHaveBeenCalledTimes(1); // planning only
  });

  it("halts at the first failing issue cycle", async () => {
    const issuesText = "## What to build\nSlice A\n## What to build\nSlice B";
    let call = 0;
    const runLifecycle = vi.fn(async (ctx: LifecycleContext) => {
      const names = (ctx.phases ?? []).map((p) => p.name);
      if (names.includes("ISSUES")) return result(PLANNING_PHASES, true, issuesText);
      call += 1;
      return result(CYCLE_PHASES, call !== 1 ? true : false); // first cycle fails
    });
    const res = await runIssuePipeline(tmpCtx(), { runLifecycle });
    expect(res.ok).toBe(false);
    // planning + only the first (failing) cycle; second issue never runs.
    expect(runLifecycle).toHaveBeenCalledTimes(2);
  });

  it("falls back to a single whole-build cycle when no issues parse", async () => {
    const runLifecycle = vi.fn(async (ctx: LifecycleContext) => {
      const names = (ctx.phases ?? []).map((p) => p.name);
      return names.includes("ISSUES")
        ? result(PLANNING_PHASES, true, "no slices here")
        : result(CYCLE_PHASES, true);
    });
    const res = await runIssuePipeline(tmpCtx(), { runLifecycle });
    expect(res.ok).toBe(true);
    expect(runLifecycle).toHaveBeenCalledTimes(2); // planning + 1 fallback cycle
  });

  it("on resume, reloads persisted issues when ISSUES is skipped (no collapse to one cycle)", async () => {
    const ctx = tmpCtx();
    const issuesText = "## What to build\nSlice A\n## What to build\nSlice B\n## What to build\nSlice C";

    // First run CRASHES mid-loop (issue 2 cycle fails) so it does NOT clear the persisted
    // issues — exactly the state a real crash leaves on disk before a --resume.
    let cycle = 0;
    const firstRun = vi.fn(async (c: LifecycleContext) => {
      const names = (c.phases ?? []).map((p) => p.name);
      if (names.includes("ISSUES")) return result(PLANNING_PHASES, true, issuesText);
      cycle += 1;
      return result(CYCLE_PHASES, cycle !== 2); // issue 2 cycle fails
    });
    const first = await runIssuePipeline(ctx, { runLifecycle: firstRun });
    expect(first.ok).toBe(false); // crashed → .adlc/issues.json (3 issues) survives

    // Resume run: ISSUES is "skipped" → its trace carries NO text. The loop must reload the 3
    // persisted issues rather than fall back to a single whole-build cycle.
    const resumeRun = vi.fn(async (c: LifecycleContext) => {
      const names = (c.phases ?? []).map((p) => p.name);
      return names.includes("ISSUES") ? result(PLANNING_PHASES, true, "") : result(CYCLE_PHASES, true);
    });
    const res = await runIssuePipeline({ ...ctx, resume: true }, { runLifecycle: resumeRun });
    expect(res.ok).toBe(true);
    // 1 planning + 3 issue cycles (reloaded), NOT 1 fallback cycle.
    expect(resumeRun).toHaveBeenCalledTimes(4);
  });
});
