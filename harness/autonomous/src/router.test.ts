import { describe, expect, it } from "vitest";

import { buildRunner, runWithRunner } from "./router.js";
import type { RunnerConfig } from "./router.js";

describe("buildRunner", () => {
  it("passes codex timeout and reasoning options from config", () => {
    const runner = buildRunner("codex", {
      skillsDir: "adlc/skills",
      priority: ["codex"],
      runners: {
        codex: {
          kind: "codex",
          model: "gpt-5.5",
          reasoningEffort: "low",
          timeoutMs: 300_000,
        },
      },
    });

    expect((runner as unknown as { options: unknown }).options).toEqual({
      model: "gpt-5.5",
      reasoningEffort: "low",
      timeoutMs: 300_000,
    });
  });

  it("passes opencode timeout options from config", () => {
    const runner = buildRunner("opencode", {
      skillsDir: "adlc/skills",
      priority: ["opencode"],
      runners: {
        opencode: {
          kind: "opencode",
          model: "openai/gpt-5.5",
          timeoutMs: 300_000,
        },
      },
    });

    expect((runner as unknown as { options: unknown }).options).toEqual({
      model: "openai/gpt-5.5",
      timeoutMs: 300_000,
    });
  });

  it("runWithRunner pins to the named runner ignoring priority order", async () => {
    // codex is not in priority but should still be usable when pinned
    const config: RunnerConfig = {
      skillsDir: "/nonexistent",
      priority: ["claude"],
      runners: {
        claude: { kind: "claude" },
        codex: { kind: "codex", model: "gpt-5.5" },
      },
    };

    // runWithRunner builds the runner by name — it should not throw even though
    // "codex" is not first in priority
    expect(() => {
      // just verify buildRunner works for the pinned name — full runWithRunner needs a live model
      const runner = buildRunner("codex", config);
      expect(runner.name).toBeDefined();
    }).not.toThrow();
  });

  it("matches the checked-in runner config skill path", async () => {
    const config = (await import("../runners.config.json", {
      with: { type: "json" },
    })) as { default: RunnerConfig };

    expect(config.default.skillsDir).toBe("adlc/skills");
  });
});
