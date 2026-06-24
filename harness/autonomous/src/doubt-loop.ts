import type { Brief } from "./brief.js";
import { appendAssumption, type AssumptionEntry } from "./assumptions.js";
import { loadSkill } from "./skills.js";
import type { Runner } from "./runners/runner.js";

export interface ElicitResult {
  unresolved: string[];
  text: string;
}

export interface DoubtRunResult {
  ranOn: string;
  elicited: number;
  answered: number;
  assumptions: AssumptionEntry[];
  text: string;
  ok: boolean;
}

export interface RunSkillWithDoubtsArgs {
  runner: Runner;
  skillName: string;
  skillsDir: string;
  task: string;
  brief: Brief;
  poAnswer: (
    q: string,
    brief: Brief,
  ) =>
    | { answer: string; confident: boolean; grounding: string }
    | Promise<{ answer: string; confident: boolean; grounding: string }>;
  cwd: string;
  phase?: string;
  // Writing phases (IMPLEMENT, QA) need a writable sandbox; analysis phases stay read-only.
  allowEdits?: boolean;
}

export function buildProactivePrompt(skillText: string, task: string, brief: Brief): string {
  return `${skillText}

## TASK
${task}

## BRIEF
${JSON.stringify(brief, null, 2)}

Resolve every decision from the BRIEF above. Do NOT ask the user. If a decision is genuinely not answerable from the BRIEF, list it under a final \`## UNRESOLVED\` section; do not guess.`;
}

export function parseUnresolved(modelText: string): string[] {
  const lines = modelText.split(/\r?\n/);
  const unresolved: string[] = [];
  let inSection = false;

  for (const line of lines) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      inSection = heading[1].trim().toUpperCase() === "UNRESOLVED";
      continue;
    }

    if (!inSection) {
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.+?)\s*$/);
    if (bullet) {
      unresolved.push(bullet[1]);
    }
  }

  return unresolved;
}

export async function runSkillWithDoubts(
  args: RunSkillWithDoubtsArgs,
): Promise<DoubtRunResult> {
  const skillText = loadSkill(args.skillName, args.skillsDir);
  const allowEdits = args.allowEdits ?? false;
  const firstPrompt = buildProactivePrompt(skillText, args.task, args.brief);
  const firstRun = await args.runner.runHeadless(firstPrompt, {
    cwd: args.cwd,
    allowEdits,
  });
  const residuals = parseUnresolved(firstRun.text);
  const answers: string[] = [];
  const assumptions: AssumptionEntry[] = [];

  for (const question of residuals) {
    const result = await args.poAnswer(question, args.brief);
    answers.push(`${question}\nAnswer: ${result.answer}`);

    if (!result.confident) {
      const entry: AssumptionEntry = {
        phase: args.phase ?? "unknown",
        question,
        decision: result.answer,
        confidence: 0.0,
        grounding: result.grounding,
        at: new Date().toISOString(),
      };
      assumptions.push(entry);
      appendAssumption(args.cwd, entry);
    }
  }

  if (answers.length === 0) {
    return {
      ranOn: args.runner.name,
      elicited: residuals.length,
      answered: 0,
      assumptions,
      text: firstRun.text,
      ok: firstRun.ok,
    };
  }

  const injectedPrompt = `${firstPrompt}

## INJECTED PO ANSWERS
${answers.map((answer) => `- ${answer}`).join("\n")}

Use the injected PO answers above. Produce the final response without asking the user.`;
  const secondRun = await args.runner.runHeadless(injectedPrompt, {
    cwd: args.cwd,
    allowEdits,
  });

  return {
    ranOn: args.runner.name,
    elicited: residuals.length,
    answered: answers.length,
    assumptions,
    text: secondRun.text,
    ok: secondRun.ok,
  };
}
