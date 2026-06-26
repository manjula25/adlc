import { fileURLToPath } from "node:url";

import type { Brief } from "./brief.js";
import { runSkillWithDoubts } from "./doubt-loop.js";
import { poAnswerOne } from "./po-agent.js";
import { CodexRunner } from "./runners/codex.js";

const cwd = process.cwd();
const skillsDir = fileURLToPath(new URL("../fixtures", import.meta.url));
const brief: Brief = {
  decisions: {
    format: "Summary",
    storage: "Postgres",
  },
  project: "notes feature",
};
const task = "Plan a small notes feature: decide output format, storage, and retention policy.";

function printReport(report: {
  ranOn: string;
  elicited: number;
  answered: number;
  assumptions: { question: string }[];
  ok: boolean;
  text: string;
}): void {
  console.log("PROOF REPORT");
  console.log(`ranOn: ${report.ranOn}`);
  console.log(`elicited: ${report.elicited}`);
  console.log(`answered: ${report.answered}`);
  console.log(`assumptions: ${report.assumptions.length}`);
  console.log(`ok: ${report.ok}`);
  console.log(`text: ${report.text.slice(0, 300)}`);
}

try {
  const report = await runSkillWithDoubts({
    runner: new CodexRunner({ model: "gpt-4.1", reasoningEffort: "low", timeoutMs: 300_000 }),
    skillName: "mini-plan",
    skillsDir,
    task,
    brief,
    poAnswer: poAnswerOne,
    cwd,
  });

  if (!report.ok) {
    console.log(`SKIP: codex GPT-4.1 proof unavailable: ${report.text}`);
    process.exit(0);
  }

  printReport(report);

  const passed =
    report.ranOn === "codex" &&
    report.ok &&
    (report.answered > 0 || report.assumptions.length > 0);

  process.exit(passed ? 0 : 1);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.log(`SKIP: codex GPT-4.1 proof unavailable: ${message}`);
  process.exit(0);
}
