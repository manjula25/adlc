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

export async function runGrill(args: GrillArgs): Promise<GrillResult> {
  const cap = args.iterCap ?? 3;
  const allAssumptions: AssumptionEntry[] = [];
  let requirements = "";
  let iterations = 0;

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
    requirements = result.text;

    // stop early when the final output has no unresolved items
    if (parseUnresolved(result.text).length === 0) {
      break;
    }
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
