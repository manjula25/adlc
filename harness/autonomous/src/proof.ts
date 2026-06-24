import { runConductor } from "./conductor.js";

const prompt = `Plan a small internal task-tracking feature for this project.
Use plan mode and ask any Product Owner clarification needed before writing the plan.
The plan has intentionally ambiguous choices around output format, database, and authentication.`;

function printReport(report: {
  asked: number;
  answered: number;
  lowConfidence: number;
  finalText: string;
}): void {
  console.log("PROOF REPORT");
  console.log(`asked: ${report.asked}`);
  console.log(`answered: ${report.answered}`);
  console.log(`lowConfidence: ${report.lowConfidence}`);
  console.log(`finalText: ${report.finalText.slice(0, 200)}`);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.log("SKIP: ANTHROPIC_API_KEY is not set; unit proof still covers the headless seam.");
  process.exit(0);
}

try {
  const report = await runConductor(prompt);
  printReport(report);

  const passed =
    report.answered + report.lowConfidence === report.asked &&
    report.asked >= 0;

  process.exit(passed ? 0 : 1);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
