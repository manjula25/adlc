import { describe, expect, it } from "vitest";

import { codexChildEnv } from "./codex.js";

describe("codexChildEnv", () => {
  it("mirrors OPENAI_API_KEY into CODEX_API_KEY for deterministic headless auth", () => {
    const env = codexChildEnv({ OPENAI_API_KEY: "sk-live", PATH: "/usr/bin" });
    expect(env.CODEX_API_KEY).toBe("sk-live");
    expect(env.OPENAI_API_KEY).toBe("sk-live");
  });

  it("leaves an explicit CODEX_API_KEY untouched", () => {
    const env = codexChildEnv({ OPENAI_API_KEY: "sk-live", CODEX_API_KEY: "sk-explicit" });
    expect(env.CODEX_API_KEY).toBe("sk-explicit");
  });

  it("does not inject a key when none is set (local ChatGPT-login dev path)", () => {
    const env = codexChildEnv({ PATH: "/usr/bin" });
    expect(env.CODEX_API_KEY).toBeUndefined();
  });
});
