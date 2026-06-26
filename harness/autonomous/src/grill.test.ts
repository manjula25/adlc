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

  it("throws when every iteration returns ok=false (e.g. 429 API error), preventing REQUIREMENTS.md clobber", async () => {
    const cwd = makeCwd();
    const fakeRunner: Runner = {
      name: "fake",
      runHeadless: async () => ({
        text: "Request rejected (429) · [1113][Insufficient balance or no resource package. Please recharge.]",
        ok: false,
        runner: "fake",
      }),
    };

    await expect(
      runGrill({
        runner: fakeRunner,
        skillsDir: cwd,
        intakeText: "Design: notes app.",
        brief,
        cwd,
        iterCap: 2,
      }),
    ).rejects.toThrow(/GRILL failed/);

    // REQUIREMENTS.md must NOT be written with the error string
    expect(existsSync(join(cwd, "REQUIREMENTS.md"))).toBe(false);
  });

  it("throws when runner returns ok=true but text is a 429 API error string (content sanity check)", async () => {
    const cwd = makeCwd();
    const fakeRunner: Runner = {
      name: "fake",
      runHeadless: async () => ({
        text: "Request rejected (429) · [1113][Insufficient balance or no resource package. Please recharge.]",
        ok: true,
        runner: "fake",
      }),
    };

    await expect(
      runGrill({
        runner: fakeRunner,
        skillsDir: cwd,
        intakeText: "Design: notes app.",
        brief,
        cwd,
        iterCap: 2,
      }),
    ).rejects.toThrow(/GRILL failed/);

    expect(existsSync(join(cwd, "REQUIREMENTS.md"))).toBe(false);
  });

  it("recovers when a failed iteration is followed by a successful one", async () => {
    const cwd = makeCwd();
    let call = 0;
    const fakeRunner: Runner = {
      name: "fake",
      runHeadless: async () => {
        call++;
        if (call === 1) {
          return {
            text: "Request rejected (429) · Insufficient balance.",
            ok: false,
            runner: "fake",
          };
        }
        return {
          text: "Requirements gathered: use Postgres for storage.",
          ok: true,
          runner: "fake",
        };
      },
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
    expect(readFileSync(result.requirementsPath, "utf8")).toContain("Postgres");
    expect(result.iterations).toBe(2);
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
