import { spawn } from "node:child_process";

import type { Runner, RunOpts, RunResult } from "./runner.js";

export interface ClaudeRunnerOptions {
  timeoutMs?: number;
  model?: string;
}

export class ClaudeRunner implements Runner {
  readonly name = "claude";

  constructor(private readonly options: ClaudeRunnerOptions = {}) {}

  async runHeadless(prompt: string, opts: RunOpts): Promise<RunResult> {
    const timeoutMs = this.options.timeoutMs ?? 300_000;

    const args = [
      "--print",
      "--dangerously-skip-permissions",
      "--output-format", "text",
    ];

    if (this.options.model) {
      args.push("--model", this.options.model);
    }

    // read-only: allow no file-writing tools
    if (opts.allowEdits === false) {
      args.push("--allowedTools", "Read,Glob,Grep,LS,WebFetch,WebSearch");
    }

    // `--` terminates option parsing: skill prompts start with `---` (YAML frontmatter),
    // which the CLI would otherwise reject as an unknown flag.
    args.push("--", prompt);

    const { stdout, code } = await spawnAndCollect("claude", args, opts.cwd, timeoutMs);
    const text = stdout.trim();

    return {
      text,
      ok: code === 0 && text.length > 0,
      runner: this.name,
    };
  }
}

async function spawnAndCollect(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ stdout: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    // stdin must be /dev/null: a piped, never-closed stdin makes the CLI block
    // waiting for input it will never get (the prompt is passed as an arg).
    const child = spawn(command, args, { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      chunks.push(Buffer.from("\n[claude runner timed out]"));
    }, timeoutMs);

    // Mirror live to the parent terminal so the phase is observable while it runs.
    // Captured stdout stays clean (it is the result text); progress goes to stderr.
    child.stdout.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      process.stderr.write(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => process.stderr.write(chunk));

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ stdout: Buffer.concat(chunks).toString("utf8"), code });
    });
  });
}
