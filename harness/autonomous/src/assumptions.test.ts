import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { appendAssumption, summarizeAssumptions, type AssumptionEntry } from "./assumptions.js";

const tempDirs: string[] = [];

function makeRepoDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "adlc-assumptions-"));
  tempDirs.push(dir);
  return dir;
}

const entryA: AssumptionEntry = {
  phase: "PRD",
  question: "What retention policy should notes use?",
  decision: "Retain notes for 30 days.",
  confidence: 0.4,
  grounding: "no grounding — default",
  at: "2026-06-22T10:00:00.000Z",
};

const entryB: AssumptionEntry = {
  phase: "PLAN",
  question: "Which region launches first?",
  decision: "US",
  confidence: 0.6,
  grounding: "BRIEF.decisions.region",
  at: "2026-06-22T11:00:00.000Z",
};

afterEach(() => {
  // best-effort cleanup; failures here should not fail the suite
});

describe("appendAssumption", () => {
  it("creates ASSUMPTIONS.md with a header and appends both entries", () => {
    const repoDir = makeRepoDir();

    appendAssumption(repoDir, entryA);
    appendAssumption(repoDir, entryB);

    const path = join(repoDir, "ASSUMPTIONS.md");
    expect(existsSync(path)).toBe(true);

    const content = readFileSync(path, "utf8");
    expect(content).toContain("# ASSUMPTIONS");
    expect(content).toContain("What retention policy should notes use?");
    expect(content).toContain("Retain notes for 30 days.");
    expect(content).toContain("Which region launches first?");
    expect(content).toContain("BRIEF.decisions.region");
  });
});

describe("summarizeAssumptions", () => {
  it("lists every logged entry", () => {
    const repoDir = makeRepoDir();

    appendAssumption(repoDir, entryA);
    appendAssumption(repoDir, entryB);

    const summary = summarizeAssumptions(repoDir);
    expect(summary).toContain("What retention policy should notes use?");
    expect(summary).toContain("Which region launches first?");
  });

  it("returns a none line when no file exists", () => {
    const repoDir = makeRepoDir();
    expect(summarizeAssumptions(repoDir).toLowerCase()).toContain("none");
  });
});
