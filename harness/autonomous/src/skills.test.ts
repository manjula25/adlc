import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { listSkills, loadSkill } from "./skills.js";
import { PHASES } from "./lifecycle.js";

const REAL_SKILLS_DIR = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
  "..",
  "adlc",
  "skills",
);

describe("skills loader", () => {
  it("loads a fixture skill markdown file", () => {
    const dir = mkdtempSync(join(tmpdir(), "adlc-skills-test-"));
    try {
      mkdirSync(join(dir, "mini-plan"), { recursive: true });
      writeFileSync(join(dir, "mini-plan", "SKILL.md"), "# Mini Plan\n");

      expect(loadSkill("mini-plan", dir)).toBe("# Mini Plan\n");
      expect(listSkills(dir)).toEqual(["mini-plan"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("throws when a requested skill is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "adlc-skills-test-"));
    try {
      expect(() => loadSkill("missing", dir)).toThrow(/Skill not found/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("falls back to a sibling commands/<name>.md when no SKILL.md exists", () => {
    const root = mkdtempSync(join(tmpdir(), "adlc-skills-root-"));
    try {
      mkdirSync(join(root, "skills"), { recursive: true });
      mkdirSync(join(root, "commands"), { recursive: true });
      writeFileSync(join(root, "commands", "qa-run.md"), "# QA Run command\n");

      expect(loadSkill("qa-run", join(root, "skills"))).toBe("# QA Run command\n");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("resolves a lifecycle alias to its underlying command file", () => {
    const root = mkdtempSync(join(tmpdir(), "adlc-skills-root-"));
    try {
      mkdirSync(join(root, "skills"), { recursive: true });
      mkdirSync(join(root, "commands"), { recursive: true });
      writeFileSync(join(root, "commands", "create-prd.md"), "# Create PRD\n");

      expect(loadSkill("to-prd", join(root, "skills"))).toBe("# Create PRD\n");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("lifecycle skills resolve against the real adlc directory", () => {
  for (const phase of PHASES) {
    it(`resolves "${phase.skill}" for phase ${phase.name}`, () => {
      const text = loadSkill(phase.skill, REAL_SKILLS_DIR);
      expect(text.length).toBeGreaterThan(0);
    });
  }
});
