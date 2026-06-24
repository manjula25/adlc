/**
 * Full dry-run proof: design link → deployed preview URL (all cloud calls stubbed).
 * Run: npx tsx src/proof-e2e.ts
 * Live: ADLC_LIVE=1 npx tsx src/proof-e2e.ts  (requires all env tokens)
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Brief } from "./brief.js";
import { intake } from "./intake.js";
import { runGrill } from "./grill.js";
import { runIssuePipeline } from "./issue-loop.js";
import { provisionRepo } from "./provision/repo.js";
import { provisionVercel } from "./provision/vercel.js";
import { provisionSupabase } from "./provision/supabase.js";
import { sendNotification } from "./notify.js";
import { summarizeAssumptions } from "./assumptions.js";
import { StubRunner } from "./runners/stub.js";
import type { RunnerConfig } from "./router.js";

const LIVE = process.env["ADLC_LIVE"] === "1";
const here = fileURLToPath(new URL(".", import.meta.url));
const SDIAS_HTML = resolve(here, "..", "..", "..", "SDIAS Operations Hub (standalone).html");

const brief: Brief = {
  project: "SDIAS-ops-hub",
  decisions: {
    storage: "Postgres",
    auth: "email + password",
    region: "US",
    recipient: process.env["ADLC_NOTIFY_EMAIL"] ?? "dev@example.com",
  },
};

const cwd = mkdtempSync(join(tmpdir(), "adlc-e2e-"));

const stubConfig: RunnerConfig = {
  skillsDir: resolve(here, "..", "fixtures"),
  priority: ["stub"],
  runners: {
    stub: { kind: "stub" },
    claude: { kind: "stub" }, // ponytail: stub both runner names lifecycle pins by name
    codex:  { kind: "stub" },
  },
};

const stubRunner = new StubRunner();

console.log("=== ADLC DRY-RUN PROOF ===");
console.log(`cwd: ${cwd}`);
console.log(`live: ${LIVE}`);
console.log("");

// ── INTAKE ──────────────────────────────────────────────────────────────────
console.log("[INTAKE] reading SDIAS standalone HTML...");
const intakeResult = await intake(SDIAS_HTML);
console.log(`[INTAKE] source=${intakeResult.source} normalized=${intakeResult.normalized.length}chars`);

// ── GRILL ────────────────────────────────────────────────────────────────────
console.log("[GRILL] requirement-gathering self-play (stub)...");
const grillResult = await runGrill({
  runner: stubRunner,
  skillsDir: resolve(here, "..", "fixtures"),
  intakeText: intakeResult.normalized,
  brief,
  cwd,
  iterCap: 2,
});
console.log(`[GRILL] iterations=${grillResult.iterations} assumptions=${grillResult.assumptions.length}`);
console.log(`[GRILL] REQUIREMENTS.md → ${grillResult.requirementsPath}`);

// ── LIFECYCLE ────────────────────────────────────────────────────────────────
console.log("[LIFECYCLE] running planning + per-issue cycle pipeline (stub runners)...");
const lifecycleResult = await runIssuePipeline({
  config: stubConfig,
  brief,
  cwd,
  task: `Build the SDIAS Operations Hub as described in:\n\n${grillResult.requirements.slice(0, 500)}`,
  retryCap: 1,
});
console.log("[LIFECYCLE] phases:");
for (const p of lifecycleResult.phases) {
  const icon = p.ok ? "✓" : "✗";
  console.log(`  ${icon} ${p.phase.padEnd(10)} runner=${p.runner} assumptions=${p.assumptions} retries=${p.retriesUsed}`);
}

// ── PROVISION ────────────────────────────────────────────────────────────────
const projectId = `proj_sdias_${Date.now().toString(36)}`;
console.log(`\n[PROVISION] project=${projectId} dryRun=${!LIVE}`);

const repoResult = await provisionRepo({
  org: "bitcot",
  name: projectId,
  repoDir: cwd,
  branch: `feat/${projectId}`,
  dryRun: !LIVE,
  ...(LIVE ? {} : {}),
});
console.log(`[PROVISION/REPO] url=${repoResult.url} existed=${repoResult.existed}`);

const supabaseResult = await provisionSupabase({
  projectId,
  dbUrl: process.env["SUPABASE_DB_URL"] ?? "postgresql://stub",
  dryRun: !LIVE,
});
console.log(`[PROVISION/SUPABASE] schema=${supabaseResult.schema} rlsVerified=${supabaseResult.rlsVerified}`);

const vercelResult = await provisionVercel({
  repoDir: cwd,
  projectName: projectId,
  branch: "feat/adlc-design-to-preview",
  repoUrl: repoResult.url,
  token: process.env["VERCEL_TOKEN"] ?? "stub-token",
  envVars: {
    SUPABASE_URL: process.env["SUPABASE_URL"] ?? "https://stub.supabase.co",
    SUPABASE_ANON_KEY: process.env["SUPABASE_ANON_KEY"] ?? "stub-anon",
    SUPABASE_SCHEMA: supabaseResult.schema,
  },
  dryRun: !LIVE,
});
console.log(`[PROVISION/VERCEL] previewUrl=${vercelResult.previewUrl}`);

// ── NOTIFY ───────────────────────────────────────────────────────────────────
const notifyResult = await sendNotification({
  previewUrl: vercelResult.previewUrl,
  repoDir: cwd,
  brief,
  apiKey: process.env["SENDGRID_API_KEY"] ?? "stub-key",
  dryRun: !LIVE,
});
console.log(`[NOTIFY] sent=${notifyResult.sent} recipient=${notifyResult.recipient}`);

// ── SUMMARY ──────────────────────────────────────────────────────────────────
console.log("\n=== ASSUMPTIONS ===");
console.log(summarizeAssumptions(cwd));

console.log("\n=== RESULT ===");
console.log(`previewUrl: ${vercelResult.previewUrl}`);
console.log(`allPhasesOk: ${lifecycleResult.ok}`);
console.log(`cwd: ${cwd}`);

if (!lifecycleResult.ok && !LIVE) {
  // stub runners always return ok — a failure here is unexpected
  console.error("UNEXPECTED: lifecycle not ok in dry-run");
  process.exit(1);
}

console.log("\nDRY-RUN PROOF PASSED");
