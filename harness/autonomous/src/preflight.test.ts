import { describe, expect, it } from "vitest";

import { plannedChecks, preflight } from "./preflight.js";
import type { RunnerConfig } from "./router.js";

const config: RunnerConfig = {
  skillsDir: "adlc/skills",
  priority: ["codex", "claude"],
  runners: {
    codex: { kind: "codex" },
    claude: { kind: "claude" },
  },
};

describe("plannedChecks", () => {
  it("returns nothing for dry runs", () => {
    expect(plannedChecks(config, false)).toEqual([]);
  });

  it("includes cloud CLIs plus a probe per configured runner", () => {
    const names = plannedChecks(config, true).map((c) => c.name);
    expect(names).toEqual(["gh (auth)", "vercel", "psql", "codex", "claude"]);
  });
});

describe("preflight", () => {
  it("passes when every check succeeds", () => {
    expect(() => preflight(plannedChecks(config, true), () => {})).not.toThrow();
  });

  it("throws listing every failed check", () => {
    const run = (cmd: string) => {
      if (cmd.startsWith("vercel") || cmd.startsWith("psql")) throw new Error("not found");
    };
    expect(() => preflight(plannedChecks(config, true), run)).toThrow(/vercel, psql/);
  });
});
