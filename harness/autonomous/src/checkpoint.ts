import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// Lifecycle resume checkpoint. Records which phase KEYS have passed so a re-run with
// --resume skips completed work instead of redoing it from scratch. A key is the phase
// name for one-shot phases (PRD/ISSUES/...) and a per-issue key like "IMPLEMENT#2" for
// the per-issue cycle phases, so the same phase run once per issue resumes independently.
// Provisioning is idempotent, so only the runner-driven lifecycle needs this. Cleared on
// a full successful run.
export interface Checkpoint {
  completed: string[];
  updatedAt: string;
}

function checkpointPath(repoDir: string): string {
  return join(repoDir, ".adlc", "state.json");
}

export function loadCheckpoint(repoDir: string): Checkpoint | null {
  const path = checkpointPath(repoDir);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Checkpoint;
    if (!Array.isArray(parsed.completed)) {
      console.warn(`[checkpoint] ${path} is malformed (missing 'completed' array) — discarding, resuming from scratch. All prior phase progress is lost.`);
      return null;
    }
    return parsed;
  } catch {
    console.warn(`[checkpoint] ${path} could not be parsed — discarding, resuming from scratch. All prior phase progress is lost.`);
    return null;
  }
}

export function recordPhase(repoDir: string, phaseKey: string): void {
  const existing = loadCheckpoint(repoDir);
  const completed = existing ? [...existing.completed] : [];
  if (!completed.includes(phaseKey)) completed.push(phaseKey);
  const path = checkpointPath(repoDir);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ completed, updatedAt: new Date().toISOString() }, null, 2));
}

export function clearCheckpoint(repoDir: string): void {
  rmSync(checkpointPath(repoDir), { force: true });
}
