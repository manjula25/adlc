import type { Brief } from "./brief.js";
import type { DoubtRunResult, RunSkillWithDoubtsArgs } from "./doubt-loop.js";
import { runSkillWithDoubts } from "./doubt-loop.js";
import { poAnswerOne } from "./po-agent.js";
import { ClaudeRunner } from "./runners/claude.js";
import { CodexRunner } from "./runners/codex.js";
import { OpencodeRunner } from "./runners/opencode.js";
import { StubRunner } from "./runners/stub.js";
import type { Runner } from "./runners/runner.js";

export interface RunnerConfig {
  skillsDir: string;
  priority: string[];
  runners: Record<
    string,
    {
      kind: "codex" | "opencode" | "claude" | "stub";
      model?: string;
      timeoutMs?: number;
      reasoningEffort?: string;
    }
  >;
  budgets?: Record<string, unknown>;
}

export function buildRunner(name: string, config: RunnerConfig): Runner {
  const runnerConfig = config.runners[name];
  if (!runnerConfig) {
    throw new Error(`Runner not configured: ${name}`);
  }

  if (runnerConfig.kind === "codex") {
    return new CodexRunner({
      model: runnerConfig.model,
      timeoutMs: runnerConfig.timeoutMs,
      reasoningEffort: runnerConfig.reasoningEffort,
    });
  }

  if (runnerConfig.kind === "opencode") {
    if (!runnerConfig.model) {
      throw new Error(`Opencode runner ${name} requires a model.`);
    }
    return new OpencodeRunner({
      model: runnerConfig.model,
      timeoutMs: runnerConfig.timeoutMs,
    });
  }

  if (runnerConfig.kind === "claude") {
    return new ClaudeRunner({
      model: runnerConfig.model,
      timeoutMs: runnerConfig.timeoutMs,
    });
  }

  if (runnerConfig.kind === "stub") {
    return new StubRunner();
  }

  throw new Error(`Unsupported runner kind for ${name}`);
}

export type PoAnswerFn = RunSkillWithDoubtsArgs["poAnswer"];

export async function runWithRunner(
  runnerName: string,
  task: string,
  skillName: string,
  config: RunnerConfig,
  brief: Brief,
  cwd: string,
  phase?: string,
  poAnswer: PoAnswerFn = poAnswerOne,
  allowEdits = false,
): Promise<DoubtRunResult> {
  const runner = buildRunner(runnerName, config);
  return runSkillWithDoubts({
    runner,
    skillName,
    skillsDir: config.skillsDir,
    task,
    brief,
    poAnswer,
    cwd,
    phase,
    allowEdits,
  });
}

export async function runWithFallback(
  task: string,
  skillName: string,
  config: RunnerConfig,
  brief: Brief,
  cwd: string,
): Promise<DoubtRunResult> {
  const failures: string[] = [];

  for (const name of config.priority) {
    try {
      const runner = buildRunner(name, config);
      const result = await runSkillWithDoubts({
        runner,
        skillName,
        skillsDir: config.skillsDir,
        task,
        brief,
        poAnswer: poAnswerOne,
        cwd,
      });

      if (result.ok) {
        return result;
      }

      failures.push(`${name}: returned ok=false`);
      console.warn(`Runner ${name} returned ok=false; trying next runner.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${name}: ${message}`);
      console.warn(`Runner ${name} failed: ${message}; trying next runner.`);
    }
  }

  throw new Error(`All runners failed: ${failures.join("; ")}`);
}
