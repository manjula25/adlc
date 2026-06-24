// Live-run preflight: fail at second 0, not five phases deep.
// A real autonomous run has no human to intervene mid-flight, so a missing CLI or
// stale auth must surface before any cloud action. Dry runs use stubs → no checks.
import { execSync } from "node:child_process";

import type { RunnerConfig } from "./router.js";

export interface Check {
  name: string;
  cmd: string;
}

// CLI + auth probe per runner kind. `gh auth status` also covers auth, not just presence.
const RUNNER_PROBE: Record<string, string> = {
  codex: "codex --version",
  claude: "claude --version",
  opencode: "opencode --version",
  stub: "true",
};

// Pure: derive the checks from config + live flag. Testable without spawning anything.
export function plannedChecks(config: RunnerConfig, live: boolean): Check[] {
  if (!live) return [];
  const checks: Check[] = [
    { name: "gh (auth)", cmd: "gh auth status" },
    { name: "vercel", cmd: "vercel --version" },
    { name: "psql", cmd: "psql --version" },
  ];
  for (const name of config.priority) {
    const kind = config.runners[name]?.kind;
    const cmd = kind && RUNNER_PROBE[kind];
    if (cmd) checks.push({ name, cmd });
  }
  return checks;
}

function defaultRun(cmd: string): void {
  execSync(cmd, { stdio: "ignore" });
}

// Run the checks, collect every failure, throw once with the full list.
export function preflight(checks: Check[], run: (cmd: string) => void = defaultRun): void {
  const failed: string[] = [];
  for (const c of checks) {
    try {
      run(c.cmd);
    } catch {
      failed.push(c.name);
    }
  }
  if (failed.length > 0) {
    throw new Error(
      `Preflight failed — missing CLI or stale auth: ${failed.join(", ")}. ` +
        `Install/authenticate these before a live run.`,
    );
  }
}
