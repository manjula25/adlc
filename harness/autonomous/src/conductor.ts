import { query, type CanUseTool, type PermissionResult } from "@anthropic-ai/claude-agent-sdk";

import { appendAssumption } from "./assumptions.js";
import { BRIEF } from "./brief.js";
import { answerQuestions, type AskQuestion } from "./po-agent.js";

export interface ConductorResult {
  asked: number;
  answered: number;
  lowConfidence: number;
  finalText: string;
}

type ToolInput = Record<string, unknown>;

function isAskUserQuestionInput(input: unknown): input is { questions: AskQuestion[] } {
  if (!input || typeof input !== "object" || !("questions" in input)) {
    return false;
  }

  const questions = (input as { questions: unknown }).questions;
  return Array.isArray(questions);
}

function textFromMessage(message: unknown): string {
  if (!message || typeof message !== "object") {
    return "";
  }

  const typed = message as {
    type?: string;
    result?: unknown;
    message?: { content?: unknown };
  };

  if (typed.type === "result" && typeof typed.result === "string") {
    return typed.result;
  }

  const content = typed.message?.content;
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((block) => {
      if (block && typeof block === "object" && "text" in block) {
        const text = (block as { text: unknown }).text;
        return typeof text === "string" ? text : "";
      }
      return "";
    })
    .join("");
}

export async function runConductor(prompt: string, repoDir?: string): Promise<ConductorResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Set ANTHROPIC_API_KEY to run the headless conductor integration proof.");
  }

  const result: ConductorResult = {
    asked: 0,
    answered: 0,
    lowConfidence: 0,
    finalText: "",
  };

  const canUseTool: CanUseTool = async (
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<PermissionResult> => {
    if (toolName !== "AskUserQuestion") {
      return { behavior: "allow", updatedInput: input as ToolInput };
    }

    if (!isAskUserQuestionInput(input)) {
      // ponytail: malformed input — deny without interrupt so the model retries
      return {
        behavior: "deny",
        message: "AskUserQuestion input did not include a questions array.",
        interrupt: false,
      };
    }

    result.asked += input.questions.length;
    const { answers, confident } = answerQuestions(input.questions, BRIEF);

    if (!confident) {
      result.lowConfidence += input.questions.length;
      if (repoDir) {
        for (const q of input.questions) {
          appendAssumption(repoDir, {
            phase: "conductor",
            question: q.question,
            decision: String(answers[q.question] ?? q.options[0]?.label ?? "unknown"),
            confidence: 0.0,
            grounding: "no grounding — default",
            at: new Date().toISOString(),
          });
        }
      }
    }

    result.answered += input.questions.length;
    return {
      behavior: "allow",
      updatedInput: { questions: input.questions, answers },
    };
  };

  const messages = query({
    prompt,
    options: {
      permissionMode: "bypassPermissions",
      canUseTool,
    },
  });

  for await (const message of messages) {
    const text = textFromMessage(message);
    if (text) {
      result.finalText = text;
    }
  }

  return result;
}
