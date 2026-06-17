import { describe, expect, it } from "vitest";

import type { Brief } from "./brief.js";
import { answerQuestions } from "./po-agent.js";

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
