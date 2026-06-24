import { describe, expect, it } from "vitest";

import type { Brief } from "./brief.js";
import type { Policy } from "./config.js";
import { answerQuestions, poAnswerOne, poAnswerLLM } from "./po-agent.js";

const brief: Brief = {
  project: "Test project",
  decisions: {
    format: "Summary",
    database: "Postgres",
    auth: "email + password",
  },
};

describe("answerQuestions", () => {
  it("answers a single-select question from a matching brief hint", () => {
    const result = answerQuestions(
      [
        {
          header: "Format",
          question: "Which output should the plan use?",
          options: [
            { label: "Bullets", description: "Use a bullet list." },
            { label: "Summary", description: "Use a short summary." },
          ],
        },
      ],
      brief,
    );

    expect(result.confident).toBe(true);
    expect(result.answers).toEqual({
      "Which output should the plan use?": "Summary",
    });
  });

  it("falls back to the first option and marks confidence false without a matching hint", () => {
    const result = answerQuestions(
      [
        {
          header: "Region",
          question: "Which region should launch first?",
          options: [
            { label: "US", description: "Launch in the United States." },
            { label: "EU", description: "Launch in Europe." },
          ],
        },
      ],
      brief,
    );

    expect(result.confident).toBe(false);
    expect(result.answers).toEqual({
      "Which region should launch first?": "US",
    });
  });

  it("returns an array answer for multiSelect questions keyed by question text", () => {
    const result = answerQuestions(
      [
        {
          header: "Auth",
          question: "Which authentication methods should be included?",
          multiSelect: true,
          options: [
            { label: "SSO", description: "Use enterprise SSO." },
            { label: "email + password", description: "Use email and password login." },
          ],
        },
      ],
      brief,
    );

    expect(result.confident).toBe(true);
    expect(result.answers["Which authentication methods should be included?"]).toEqual([
      "email + password",
    ]);
  });
});

describe("poAnswerOne", () => {
  it("returns a confident answer with grounding when the question matches a brief decision key", () => {
    const result = poAnswerOne("What database should the feature use?", brief);
    expect(result).toEqual({
      answer: "Postgres",
      confident: true,
      grounding: "BRIEF.decisions.database",
    });
  });

  it("returns low confidence with a best-effort answer and grounding when no brief key matches", () => {
    const result = poAnswerOne("What retention policy should the feature use?", brief);
    expect(result.confident).toBe(false);
    expect(typeof result.answer).toBe("string");
    expect(result.answer.length).toBeGreaterThan(0);
    expect(result.grounding).toBe("no grounding — default");
  });
});

describe("poAnswerLLM", () => {
  const policy: Policy = { rules: ["prefer managed services"], confidenceThreshold: 0.7 };

  it("returns confident=true when model confidence meets the policy threshold", async () => {
    const model = {
      ask: async () =>
        JSON.stringify({ answer: "Use Postgres", confidence: 0.92, grounding: "BRIEF + rule" }),
    };
    const result = await poAnswerLLM("What database?", brief, policy, model);
    expect(result.answer).toBe("Use Postgres");
    expect(result.confident).toBe(true);
    expect(result.grounding).toBe("BRIEF + rule");
  });

  it("returns confident=false but keeps the best-effort answer below threshold", async () => {
    const model = {
      ask: async () =>
        JSON.stringify({ answer: "Guessing weekly", confidence: 0.4, grounding: "weak" }),
    };
    const result = await poAnswerLLM("What backup cadence?", brief, policy, model);
    expect(result.answer).toBe("Guessing weekly");
    expect(result.confident).toBe(false);
  });

  it("falls back to the rule-based matcher when the model output is unparseable", async () => {
    const model = { ask: async () => "not json at all" };
    const result = await poAnswerLLM("What database should we use?", brief, policy, model);
    expect(result.answer).toBe("Postgres");
    expect(result.confident).toBe(true);
    expect(result.grounding).toBe("BRIEF.decisions.database");
  });

  it("falls back to the rule-based matcher when the model call throws", async () => {
    const model = {
      ask: async () => {
        throw new Error("model unavailable");
      },
    };
    const result = await poAnswerLLM("What database should we use?", brief, policy, model);
    expect(result.answer).toBe("Postgres");
    expect(result.confident).toBe(true);
  });
});
