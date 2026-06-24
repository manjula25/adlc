import type { Runner, RunOpts, RunResult } from "./runner.js";

export class StubRunner implements Runner {
  readonly name = "stub";

  async runHeadless(prompt: string, _opts: RunOpts): Promise<RunResult> {
    return {
      text: `[stub] ${prompt.slice(0, 120).replace(/\n/g, " ")}`,
      ok: true,
      runner: "stub",
    };
  }
}
