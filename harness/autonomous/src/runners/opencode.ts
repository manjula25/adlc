import { spawn } from "node:child_process";

import type { Runner, RunOpts, RunResult } from "./runner.js";

export interface OpencodeRunnerOptions {
  model: string;
  timeoutMs?: number;
}

export class OpencodeRunner implements Runner {
  name = "opencode";

  constructor(private readonly options: OpencodeRunnerOptions) {}

  async runHeadless(prompt: string, opts: RunOpts): Promise<RunResult> {
    const timeoutMs = this.options.timeoutMs ?? 300_000;
    const args = [
      "run",
      "-m",
      this.options.model,
      "--dangerously-skip-permissions",
      "--format",
      "json",
      "--dir",
      opts.cwd,
      prompt,
    ];

    const { code, stdout, stderr } = await spawnAndCollect(
      "opencode",
      args,
      opts.cwd,
      timeoutMs,
    );
    const text = extractAssistantText(stdout).trim();

    return {
      text: text || stderr.trim(),
      ok: code === 0 && text.length > 0,
      runner: this.name,
    };
  }
}

function extractAssistantText(stdout: string): string {
  const parts: string[] = [];

  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      const event = JSON.parse(trimmed) as Record<string, unknown>;
      const text = textFromEvent(event);
      if (text) {
        parts.push(text);
      }
    } catch {
      continue;
    }
  }

  return parts.join("");
}

function textFromEvent(event: Record<string, unknown>): string {
  for (const key of ["text", "content", "message"]) {
    const value = event[key];
    if (typeof value === "string") {
      return value;
    }
  }

  const data = event.data;
  if (data && typeof data === "object") {
    return textFromEvent(data as Record<string, unknown>);
  }

  const message = event.message;
  if (message && typeof message === "object") {
    const content = (message as { content?: unknown }).content;
    if (typeof content === "string") {
      return content;
    }
    if (Array.isArray(content)) {
      return content
        .map((block) => {
          if (block && typeof block === "object" && "text" in block) {
            const text = (block as { text?: unknown }).text;
            return typeof text === "string" ? text : "";
          }
          return "";
        })
        .join("");
    }
  }

  return "";
}

async function spawnAndCollect(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: false });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      stderrChunks.push(Buffer.from("opencode runner timed out before producing a result"));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
      process.stderr.write(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
      process.stderr.write(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({
        code,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
      });
    });
  });
}
