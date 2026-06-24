import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface AssumptionEntry {
  phase: string;
  question: string;
  decision: string;
  confidence: number;
  grounding: string;
  at: string;
}

const HEADER = "# ASSUMPTIONS\n\nAuto-decided during autonomous run. Review before merge.\n\n";

export function appendAssumption(repoDir: string, entry: AssumptionEntry): void {
  const path = join(repoDir, "ASSUMPTIONS.md");
  if (!existsSync(path)) {
    appendFileSync(path, HEADER);
  }
  const row = `## [${entry.at}] ${entry.phase}: ${entry.question}\n- **Decision:** ${entry.decision}\n- **Confidence:** ${entry.confidence}\n- **Grounding:** ${entry.grounding}\n\n`;
  appendFileSync(path, row);
}

export function summarizeAssumptions(repoDir: string): string {
  const path = join(repoDir, "ASSUMPTIONS.md");
  if (!existsSync(path)) {
    return "Assumptions: none";
  }
  const content = readFileSync(path, "utf8");
  const entries = [...content.matchAll(/^## \[.+?\] (.+?): (.+?)$/gm)];
  if (entries.length === 0) {
    return "Assumptions: none";
  }
  return entries.map((m) => `- [${m[1]}] ${m[2]}`).join("\n");
}
