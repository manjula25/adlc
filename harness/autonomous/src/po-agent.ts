import type { Brief } from "./brief.js";

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
