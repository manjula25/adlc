import { writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Brief } from "./brief.js";
import { appendAssumption, type AssumptionEntry } from "./assumptions.js";
import { runSkillWithDoubts, parseUnresolved } from "./doubt-loop.js";
import type { Runner } from "./runners/runner.js";

export interface GrillResult {
  requirementsPath: string;
  requirements: string;
  assumptions: AssumptionEntry[];
  iterations: number;
}

export interface GrillArgs {
  runner: Runner;
  skillsDir: string;
  intakeText: string;
  brief: Brief;
  cwd: string;
  iterCap?: number;
}

// Detects API error strings (429, rate limit, insufficient balance) that a runner
// may emit with exit code 0 — the codex runner sets ok=true whenever code===0 and
// text is non-empty, so a 429 error in the output file would slip through the ok
// check alone. This guard prevents an API error string from being accepted as
// valid requirements and clobbering REQUIREMENTS.md, starving downstream gates.
const API_ERROR_PATTERNS = [
  /\b429\b/,
  /rate[\s-]?limit/i,
  /insufficient\s+(balance|quota|resource)/i,
  /too\s+many\s+requests/i,
  /request\s+rejected/i,
  /\bquota\s+exceeded\b/i,
];

function looksLikeApiError(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  // Only probe the opening content: a rate-limit error appears at the start of the response,
  // while a mention of "429" or "rate limit" deep in a multi-paragraph requirements doc is
  // legitimate content and must not be flagged. The length of the overall text no longer gates
  // this check — a long JSON error body would previously slip through undetected.
  const probe = trimmed.slice(0, 500);
  return API_ERROR_PATTERNS.some((re) => re.test(probe));
}

export async function runGrill(args: GrillArgs): Promise<GrillResult> {
  const cap = args.iterCap ?? 3;
  const allAssumptions: AssumptionEntry[] = [];
  let requirements = "";
  let iterations = 0;

  let lastError = "";
  for (let i = 0; i < cap; i++) {
    iterations++;
    const task = `Gather requirements from the following design intake. Surface every ambiguity. For each ambiguity that is resolvable from the BRIEF, resolve it. List anything unresolvable under ## UNRESOLVED.\n\n${args.intakeText}`;

    const result = await runSkillWithDoubts({
      runner: args.runner,
      skillName: "grill-with-docs",
      skillsDir: args.skillsDir,
      task,
      brief: args.brief,
      poAnswer: (q, brief) => {
        const lower = q.toLowerCase();
        const hit = Object.entries(brief.decisions).find(([k]) => lower.includes(k.toLowerCase()));
        if (hit) {
          return { answer: hit[1], confident: true, grounding: `BRIEF.decisions.${hit[0]}` };
        }
        return { answer: "(no decision in brief — assumption logged)", confident: false, grounding: "no grounding — default" };
      },
      cwd: args.cwd,
      phase: "GRILL",
    });

    allAssumptions.push(...result.assumptions);

    // Reject runner failures (e.g. 429 rate-limit, CLI crash) so an API error string
    // never clobbers REQUIREMENTS.md and starves every downstream QA/REVIEW gate.
    // Also check the content: codex may exit 0 (ok=true) but still have an API error
    // string in the output file — the ok flag alone doesn't catch this.
    if (!result.ok || looksLikeApiError(result.text)) {
      lastError = result.text.slice(0, 200);
      console.warn(`[grill] iteration ${iterations} rejected (${!result.ok ? "ok=false" : "API error string"}) — skipping; ${lastError}`);
      continue;
    }
    lastError = "";
    requirements = result.text;

    // stop early when the final output has no unresolved items
    if (parseUnresolved(result.text).length === 0) {
      break;
    }
  }

  // Every iteration failed (runner never returned ok=true) → fail fast instead of
  // writing an error string to REQUIREMENTS.md and letting downstream phases grade garbage.
  if (!requirements) {
    throw new Error(
      `GRILL failed: runner never produced usable output after ${iterations} iteration(s)${lastError ? ` — last error: ${lastError}` : ""}`,
    );
  }

  // cap exhausted with outstanding ambiguities → log one final assumption
  if (iterations === cap) {
    const capEntry: AssumptionEntry = {
      phase: "GRILL",
      question: "Grill iteration cap exhausted",
      decision: "Proceeding with best-effort requirements",
      confidence: 0.0,
      grounding: "no grounding — default",
      at: new Date().toISOString(),
    };
    allAssumptions.push(capEntry);
    appendAssumption(args.cwd, capEntry);
  }

  const requirementsPath = join(args.cwd, "REQUIREMENTS.md");
  writeFileSync(requirementsPath, `# REQUIREMENTS\n\n${requirements}\n`);

  return { requirementsPath, requirements, assumptions: allAssumptions, iterations };
}
