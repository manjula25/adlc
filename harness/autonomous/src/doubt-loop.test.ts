import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { Brief } from "./brief.js";
import { parseUnresolved, runSkillWithDoubts } from "./doubt-loop.js";
import type { Runner } from "./runners/runner.js";

describe("parseUnresolved", () => {
  it("extracts bullet lines under the unresolved heading", () => {
    const text = `Plan complete.

## UNRESOLVED
- What retention policy should notes use?
* Which region launches first?

## Next Steps
- Ignore this item`;

    expect(parseUnresolved(text)).toEqual([
      "What retention policy should notes use?",
      "Which region launches first?",
    ]);
  });

  it("returns an empty array when the unresolved heading is absent", () => {
    expect(parseUnresolved("No open questions remain.")).toEqual([]);
  });
});

describe("runSkillWithDoubts — low confidence auto-decide", () => {
  it("logs an assumption and returns ok=true when poAnswer is not confident", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "adlc-doubt-"));
    // create a minimal skill file so loadSkill doesn't throw
    mkdirSync(join(cwd, "fake-skill"), { recursive: true });
    writeFileSync(join(cwd, "fake-skill", "SKILL.md"), "# Fake skill");

    const fakeRunner: Runner = {
      name: "fake",
      runHeadless: async (_prompt) => ({
        text: "Done.\n\n## UNRESOLVED\n- What retention policy should notes use?",
        ok: true,
        runner: "fake",
      }),
    };

    const brief: Brief = { project: "test", decisions: {} };

    const result = await runSkillWithDoubts({
      runner: fakeRunner,
      skillName: "fake-skill",
      skillsDir: cwd,
      task: "build a thing",
      brief,
      poAnswer: (_q, _b) => ({
        answer: "retain for 30 days",
        confident: false,
        grounding: "no grounding — default",
      }),
      cwd,
      phase: "PRD",
    });

    expect(result.ok).toBe(true);
    expect(result.assumptions).toHaveLength(1);
    expect(result.assumptions[0].question).toContain("retention policy");
    expect(result.assumptions[0].phase).toBe("PRD");

    const assumptionsPath = join(cwd, "ASSUMPTIONS.md");
    expect(existsSync(assumptionsPath)).toBe(true);
    expect(readFileSync(assumptionsPath, "utf8")).toContain("retention policy");
  });
});
