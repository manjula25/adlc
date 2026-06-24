import { mkdtempSync, existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { Brief } from "./brief.js";
import { runGrill } from "./grill.js";
import type { Runner } from "./runners/runner.js";

function makeCwd(): string {
  const cwd = mkdtempSync(join(tmpdir(), "adlc-grill-"));
  // create a minimal grill-with-docs skill file
  mkdirSync(join(cwd, "grill-with-docs"), { recursive: true });
  writeFileSync(join(cwd, "grill-with-docs", "SKILL.md"), "# Grill With Docs\nGather requirements.");
  return cwd;
}

const brief: Brief = { project: "test", decisions: { storage: "Postgres" } };

describe("runGrill", () => {
  it("writes REQUIREMENTS.md and terminates when no unresolved items", async () => {
    const cwd = makeCwd();
    const fakeRunner: Runner = {
      name: "fake",
      runHeadless: async () => ({
        text: "Requirements gathered: use Postgres for storage.",
        ok: true,
        runner: "fake",
      }),
    };

    const result = await runGrill({
      runner: fakeRunner,
      skillsDir: cwd,
      intakeText: "Design: task manager with Postgres storage.",
      brief,
      cwd,
      iterCap: 3,
    });

    expect(existsSync(result.requirementsPath)).toBe(true);
    expect(readFileSync(result.requirementsPath, "utf8")).toContain("REQUIREMENTS");
    expect(result.iterations).toBe(1);
    expect(result.assumptions).toHaveLength(0);
  });

  it("logs an assumption and writes REQUIREMENTS.md when runner always returns UNRESOLVED", async () => {
    const cwd = makeCwd();
    const fakeRunner: Runner = {
      name: "fake",
      runHeadless: async (_prompt) => ({
        text: "Partial reqs.\n\n## UNRESOLVED\n- What retention policy should notes use?",
        ok: true,
        runner: "fake",
      }),
    };

    const result = await runGrill({
      runner: fakeRunner,
      skillsDir: cwd,
      intakeText: "Design: notes app.",
      brief: { project: "test", decisions: {} }, // no decision covers retention
      cwd,
      iterCap: 2,
    });

    // cap exhausted → REQUIREMENTS.md still written
    expect(existsSync(result.requirementsPath)).toBe(true);
    // assumptions logged (low-confidence answers + cap exhaustion entry)
    expect(result.assumptions.length).toBeGreaterThan(0);
    expect(result.iterations).toBe(2);
    // ASSUMPTIONS.md on disk
    expect(existsSync(join(cwd, "ASSUMPTIONS.md"))).toBe(true);
  });
});
