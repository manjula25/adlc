import type { Brief } from "./brief.js";
import type { Policy } from "./config.js";

export interface AskQuestion {
  question: string;
  header: string;
  options: { label: string; description: string }[];
  multiSelect?: boolean;
}

export interface PoAnswer {
  answers: Record<string, string | string[]>;
  confident: boolean;
}

export interface PoAnswerOne {
  answer: string;
  confident: boolean;
  grounding: string;
}

export function answerQuestions(questions: AskQuestion[], brief: Brief): PoAnswer {
  const answers: Record<string, string | string[]> = {};
  let confident = true;

  for (const question of questions) {
    const text = `${question.header} ${question.question}`.toLowerCase();
    const matchedHint = Object.entries(brief.decisions).find(([key]) =>
      text.includes(key.toLowerCase()),
    );
    const hintedAnswer = matchedHint?.[1];
    const selected = hintedAnswer
      ? question.options.find((option) => option.label.toLowerCase() === hintedAnswer.toLowerCase())
      : undefined;
    const selectedLabel = selected?.label ?? question.options[0]?.label ?? "";

    if (!selected) {
      confident = false;
    }

    answers[question.question] = question.multiSelect ? [selectedLabel] : selectedLabel;
  }

  return { answers, confident };
}

export function poAnswerOne(question: string, brief: Brief): PoAnswerOne {
  const normalizedQuestion = question.toLowerCase();
  const matchedDecision = Object.entries(brief.decisions).find(([key]) =>
    normalizedQuestion.includes(key.toLowerCase()),
  );

  if (!matchedDecision) {
    return {
      answer: "(no decision in brief — assumption logged)",
      confident: false,
      grounding: "no grounding — default",
    };
  }

  return {
    answer: matchedDecision[1],
    confident: true,
    grounding: `BRIEF.decisions.${matchedDecision[0]}`,
  };
}

export interface PoModel {
  ask: (prompt: string) => Promise<string>;
}

export function buildPoPrompt(question: string, brief: Brief, policy: Policy): string {
  const decisions = Object.entries(brief.decisions)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");
  const rules = policy.rules.map((r) => `- ${r}`).join("\n");
  return `You are the Product Owner decision oracle for project "${brief.project}".
Answer the question below using ONLY the BRIEF decisions and POLICY rules.
Do not ask the user anything. If grounding is weak, still give the best-effort answer
but lower your confidence accordingly.

## BRIEF decisions
${decisions || "(none)"}

## POLICY rules
${rules || "(none)"}

## QUESTION
${question}

Respond with a single JSON object and nothing else:
{"answer": "<your decision>", "confidence": <0..1>, "grounding": "<what you grounded it in>"}`;
}

function parsePoResponse(raw: string): { answer: string; confidence: number; grounding: string } | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    return null;
  }
  try {
    const parsed = JSON.parse(match[0]) as {
      answer?: unknown;
      confidence?: unknown;
      grounding?: unknown;
    };
    if (typeof parsed.answer !== "string" || typeof parsed.confidence !== "number") {
      return null;
    }
    return {
      answer: parsed.answer,
      confidence: parsed.confidence,
      grounding: typeof parsed.grounding === "string" ? parsed.grounding : "LLM — ungrounded",
    };
  } catch {
    return null;
  }
}

// LLM-backed oracle. Falls back to the deterministic rule-based matcher whenever the
// model is unavailable or returns unparseable output, so the loop never stalls.
export async function poAnswerLLM(
  question: string,
  brief: Brief,
  policy: Policy,
  model: PoModel,
): Promise<PoAnswerOne> {
  let raw: string;
  try {
    raw = await model.ask(buildPoPrompt(question, brief, policy));
  } catch {
    return poAnswerOne(question, brief);
  }

  const parsed = parsePoResponse(raw);
  if (!parsed) {
    return poAnswerOne(question, brief);
  }

  return {
    answer: parsed.answer,
    confident: parsed.confidence >= policy.confidenceThreshold,
    grounding: parsed.grounding,
  };
}
