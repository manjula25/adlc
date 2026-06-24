import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import type { Brief } from "./brief.js";
import type { RunnerConfig } from "./router.js";
import { PHASES } from "./lifecycle.js";
import type { DoubtRunResult } from "./doubt-loop.js";

// top-level mock so hoisting works correctly
vi.mock("./router.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("./router.js")>();
  return {
    ...original,
    runWithRunner: vi.fn(),
  };
});

const brief: Brief = { project: "test", decisions: {} };

const stubConfig: RunnerConfig = {
  skillsDir: "/nonexistent/skills",
  priority: ["claude", "codex"],
  runners: {
    claude: { kind: "claude" },
    codex: { kind: "codex" },
  },
};

// Real runs emit a gate verdict; the QA/REVIEW gates parse it. Include PASS + APPROVE so
// gated phases pass on the happy path. Non-gated phases ignore the text.
function okResult(runnerName: string): DoubtRunResult {
  return {
    ranOn: runnerName,
    elicited: 0,
    answered: 0,
    assumptions: [],
    text: "Gate verdict: PASS. APPROVE.",
    ok: true,
  };
}

function failResult(runnerName: string): DoubtRunResult {
  return { ranOn: runnerName, elicited: 0, answered: 0, assumptions: [], text: "", ok: false };
}

describe("PHASES", () => {
  it("has exactly 9 phases in the correct order (deploy/ship/email tail moved to orchestrator)", () => {
    expect(PHASES.map((p) => p.name)).toEqual([
      "INTAKE", "GRILL", "PRD", "ISSUES",
      "IMPLEMENT", "REVIEW", "VERIFY", "QA", "FINISH",
    ]);
  });

  it("pins planning phases to claude", () => {
    const planning = PHASES.filter((p) => ["INTAKE", "GRILL", "PRD", "ISSUES"].includes(p.name));
    expect(planning.every((p) => p.runner === "claude")).toBe(true);
  });

  it("pins execution phases to codex", () => {
    const execution = PHASES.filter((p) =>
      ["IMPLEMENT", "REVIEW", "VERIFY", "QA", "FINISH"].includes(p.name),
    );
    expect(execution.every((p) => p.runner === "codex")).toBe(true);
  });
});

describe("runLifecycle", () => {
  afterEach(() => vi.clearAllMocks());

  it("walks all 9 phases in order with correct runner per phase", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "adlc-lifecycle-"));
    const { runWithRunner } = await import("./router.js");
    const mockedRun = vi.mocked(runWithRunner);
    mockedRun.mockImplementation(async (runnerName) => okResult(runnerName));

    const { runLifecycle } = await import("./lifecycle.js");
    const result = await runLifecycle({ config: stubConfig, brief, cwd, task: "build it" });

    expect(result.phases).toHaveLength(9);
    expect(result.phases.map((p) => p.phase)).toEqual([
      "INTAKE", "GRILL", "PRD", "ISSUES",
      "IMPLEMENT", "REVIEW", "VERIFY", "QA", "FINISH",
    ]);

    const calls = mockedRun.mock.calls;
    expect(calls[0][0]).toBe("claude");  // INTAKE
    expect(calls[4][0]).toBe("codex");   // IMPLEMENT
    expect(calls[8][0]).toBe("codex");   // FINISH
  });

  it("on resume, skips checkpointed phases and only runs the rest", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "adlc-lifecycle-resume-"));
    const { recordPhase } = await import("./checkpoint.js");
    recordPhase(cwd, "PRD");
    recordPhase(cwd, "ISSUES"); // pretend these passed in a prior run

    const { runWithRunner } = await import("./router.js");
    const mockedRun = vi.mocked(runWithRunner);
    mockedRun.mockImplementation(async (runnerName) => okResult(runnerName));

    const { runLifecycle, PLANNING_PHASES, CYCLE_PHASES } = await import("./lifecycle.js");
    const flat = [...PLANNING_PHASES, ...CYCLE_PHASES];
    const result = await runLifecycle({
      config: stubConfig, brief, cwd, task: "build it", phases: flat, resume: true,
    });

    // All 7 phases reported, but only the un-checkpointed ones actually invoked the runner.
    expect(result.phases.map((p) => p.phase)).toEqual([
      "PRD", "ISSUES", "IMPLEMENT", "REVIEW", "VERIFY", "QA", "FINISH",
    ]);
    expect(mockedRun.mock.calls.map((c) => c[6])).toEqual([
      "IMPLEMENT", "REVIEW", "VERIFY", "QA", "FINISH",
    ]);
    expect(result.ok).toBe(true);
    // Full success wipes the checkpoint for the next run.
    expect(existsSync(join(cwd, ".adlc", "state.json"))).toBe(false);
  });

  it("retries a failing gate to cap, logs assumption, and fails the run (gate has teeth)", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "adlc-lifecycle-gate-"));
    const { runWithRunner } = await import("./router.js");
    const mockedRun = vi.mocked(runWithRunner);

    mockedRun.mockImplementation(async (runnerName, _task, skill) => {
      if (skill === "qa-run") return failResult(runnerName);
      return okResult(runnerName);
    });

    const { runLifecycle } = await import("./lifecycle.js");
    const result = await runLifecycle({ config: stubConfig, brief, cwd, task: "build it", retryCap: 1 });

    // QA called: attempt 0 + retry 1 = 2 calls
    const qaCalls = mockedRun.mock.calls.filter((c) => c[2] === "qa-run");
    expect(qaCalls).toHaveLength(2);

    // Gate has teeth AND halts: pipeline stops at the failed QA phase — FINISH never runs.
    // QA is the last trace.
    expect(result.phases.map((p) => p.phase)).toEqual([
      "INTAKE", "GRILL", "PRD", "ISSUES", "IMPLEMENT", "REVIEW", "VERIFY", "QA",
    ]);
    expect(result.phases.some((p) => p.phase === "FINISH")).toBe(false);
    const qa = result.phases.find((p) => p.phase === "QA")!;
    expect(qa.ok).toBe(false);
    expect(qa.gatePassed).toBe(false);
    expect(result.ok).toBe(false);
    expect(existsSync(join(cwd, "ASSUMPTIONS.md"))).toBe(true);
  });

  it("empty-diff guard: fails IMPLEMENT when the runner writes nothing in a git repo", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "adlc-lifecycle-nodiff-"));
    execSync("git init -q && git commit -q --allow-empty -m init", { cwd });

    const { runWithRunner } = await import("./router.js");
    const mockedRun = vi.mocked(runWithRunner);
    // Every phase exits clean and says PASS, but NONE write any files. The empty-diff guard
    // must catch IMPLEMENT (requireMutation) even though its gate text would otherwise pass.
    mockedRun.mockImplementation(async (runnerName) => okResult(runnerName));

    const { runLifecycle } = await import("./lifecycle.js");
    const result = await runLifecycle({ config: stubConfig, brief, cwd, task: "build it", retryCap: 0 });

    const impl = result.phases.find((p) => p.phase === "IMPLEMENT")!;
    expect(impl.gatePassed).toBe(false);
    expect(impl.ok).toBe(false);
    expect(result.ok).toBe(false);
    // Pipeline halts at IMPLEMENT — nothing downstream runs.
    expect(result.phases.some((p) => p.phase === "REVIEW")).toBe(false);
  });

  it("empty-diff guard: passes IMPLEMENT when the runner writes a file", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "adlc-lifecycle-diff-"));
    execSync("git init -q && git commit -q --allow-empty -m init", { cwd });

    const { runWithRunner } = await import("./router.js");
    const mockedRun = vi.mocked(runWithRunner);
    mockedRun.mockImplementation(async (runnerName, _task, skill) => {
      // Simulate codex writing app code during IMPLEMENT so the working tree changes.
      if (skill === "implement") writeFileSync(join(cwd, "app.ts"), "export const x = 1;\n");
      return okResult(runnerName);
    });

    const { runLifecycle, PLANNING_PHASES, CYCLE_PHASES } = await import("./lifecycle.js");
    const result = await runLifecycle({
      config: stubConfig, brief, cwd, task: "build it",
      phases: [...PLANNING_PHASES, ...CYCLE_PHASES],
    });

    expect(result.phases.find((p) => p.phase === "IMPLEMENT")!.ok).toBe(true);
    expect(result.ok).toBe(true);
  });

  it("fails the QA gate when the runner exits 0 but the report says FAIL", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "adlc-lifecycle-verdict-"));
    const { runWithRunner } = await import("./router.js");
    const mockedRun = vi.mocked(runWithRunner);

    mockedRun.mockImplementation(async (runnerName, _task, skill) => {
      // Clean exit (ok:true) but the QA report is a FAIL verdict — the old r.ok gate
      // would have passed this; the verdict gate must not.
      if (skill === "qa-run") {
        return { ranOn: runnerName, elicited: 0, answered: 0, assumptions: [], text: "Gate verdict: **FAIL** — 2 tests red", ok: true };
      }
      return okResult(runnerName);
    });

    const { runLifecycle } = await import("./lifecycle.js");
    const result = await runLifecycle({ config: stubConfig, brief, cwd, task: "build it", retryCap: 0 });

    expect(result.phases.find((p) => p.phase === "QA")!.gatePassed).toBe(false);
    expect(result.ok).toBe(false);
  });
});

describe("gate verdict parsers", () => {
  const r = (text: string, ok = true): DoubtRunResult => ({
    ranOn: "codex", elicited: 0, answered: 0, assumptions: [], text, ok,
  });

  it("qaGate: PASS verdict passes, FAIL or runner-fail does not", async () => {
    const { qaGate } = await import("./lifecycle.js");
    expect(qaGate(r("Gate verdict: **PASS**"))).toBe(true);
    expect(qaGate(r("Gate verdict: **FAIL**"))).toBe(false);
    expect(qaGate(r("PASS but also FAIL noted"))).toBe(false); // fail-closed on tie
    expect(qaGate(r("PASS", false))).toBe(false); // runner failed
    expect(qaGate(r("ran the suite"))).toBe(false); // no verdict
  });

  it("reviewGate: APPROVE passes, REQUEST CHANGES does not", async () => {
    const { reviewGate } = await import("./lifecycle.js");
    expect(reviewGate(r("Final verdict: APPROVE"))).toBe(true);
    expect(reviewGate(r("REQUEST CHANGES: blocker at x.ts:10"))).toBe(false);
    expect(reviewGate(r("APPROVE, but REQUEST CHANGES on tests"))).toBe(false);
    expect(reviewGate(r("looks fine"))).toBe(false); // no explicit approval
  });

  it("verifyGate + finishGate: PASS verdict passes, FAIL or missing does not", async () => {
    const { verifyGate, finishGate } = await import("./lifecycle.js");
    expect(verifyGate(r("Verification verdict: PASS"))).toBe(true);
    expect(verifyGate(r("Verification verdict: FAIL — build red"))).toBe(false);
    expect(verifyGate(r("no verdict"))).toBe(false);
    expect(finishGate(r("Finish verdict: PASS"))).toBe(true);
    expect(finishGate(r("Finish verdict: FAIL — tests red"))).toBe(false);
    expect(finishGate(r("PASS but FAIL noted"))).toBe(false); // fail-closed on tie
  });
});
