import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Runner, RunOpts, RunResult } from "./runner.js";

let codexRunIndex = 0;

export interface CodexRunnerOptions {
  model?: string;
  timeoutMs?: number;
  reasoningEffort?: string;
}

/**
 * Headless auth for `codex exec`. codex's load_auth precedence is
 * `CODEX_API_KEY env > … > auth.json`, so mirroring OPENAI_API_KEY into
 * CODEX_API_KEY forces ApiKey mode deterministically — it wins even if the CI
 * image carries a stale ChatGPT auth.json. Only rewrites when a key is present
 * and CODEX_API_KEY isn't already set, so local dev (ChatGPT login, no key) is
 * left untouched.
 */
export function codexChildEnv(
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  if (base.OPENAI_API_KEY && !base.CODEX_API_KEY) {
    return { ...base, CODEX_API_KEY: base.OPENAI_API_KEY };
  }
  return base;
}

export class CodexRunner implements Runner {
  name = "codex";

  constructor(private readonly options: CodexRunnerOptions = {}) {}

  async runHeadless(prompt: string, opts: RunOpts): Promise<RunResult> {
    const model = this.options.model ?? "gpt-5.5";
    const timeoutMs = this.options.timeoutMs ?? 300_000;
    const index = codexRunIndex;
    codexRunIndex += 1;
    const tmpRoot = await mkdtemp(join(tmpdir(), `adlc-codex-${process.pid}-${index}-`));
    const outputFile = join(tmpRoot, "last-message.txt");
    const sandbox = opts.allowEdits === false ? "read-only" : "workspace-write";
    const args = [
      "exec",
      "-m",
      model,
      "-s",
      sandbox,
      "-C",
      opts.cwd,
      "--output-last-message",
      outputFile,
    ];
    if (this.options.reasoningEffort) {
      args.push("-c", `model_reasoning_effort=${this.options.reasoningEffort}`);
    }
    // `--` terminates option parsing: skill prompts start with `---` (YAML frontmatter),
    // which codex would otherwise reject as an unknown flag.
    args.push("--", prompt);

    const { code, stderr } = await spawnAndCollect("codex", args, opts.cwd, timeoutMs, codexChildEnv());
    let text = "";

    try {
      text = (await readFile(outputFile, "utf8")).trim();
    } catch {
      text = "";
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }

    if (code !== 0 && !text) {
      text = stderr.trim();
    }

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
  env: NodeJS.ProcessEnv,
): Promise<{ code: number | null; stderr: string }> {
  return await new Promise((resolve, reject) => {
    // stdin must be /dev/null: codex prints "Reading additional input from stdin..."
    // and blocks on EOF when spawned with a piped, never-closed stdin. The prompt
    // is already passed as an arg, so the child needs no stdin.
    const child = spawn(command, args, { cwd, env, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const stderrChunks: Buffer[] = [];
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      stderrChunks.push(Buffer.from("codex runner timed out before producing a result"));
    }, timeoutMs);

    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
      process.stderr.write(chunk);
    });
    // codex streams reasoning/tool activity on stdout; mirror it so the phase is observable.
    child.stdout.on("data", (chunk: Buffer) => process.stderr.write(chunk));
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ code, stderr: Buffer.concat(stderrChunks).toString("utf8") });
    });
  });
}
