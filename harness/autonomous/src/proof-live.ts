/**
 * Staged LIVE provisioning smoke test — de-risks the critical cloud path WITHOUT the LLM phases.
 *
 * It deploys a tiny static app through the real provisioning stack:
 *   GitHub repo  →  Supabase schema + RLS  →  Vercel preview  →  SendGrid email.
 *
 * Run: npm run proof:live
 * SKIPs with exit 0 if required tokens are absent, so it never mutates anything by accident.
 *
 * Required env: VERCEL_TOKEN, SUPABASE_DB_URL, SUPABASE_URL, SUPABASE_ANON_KEY
 * Optional env: SENDGRID_API_KEY (email is best-effort — skipped if absent, see gap #2),
 *               ADLC_NOTIFY_EMAIL (else falls back to the BRIEF recipient below),
 *               ADLC_GH_ORG (GitHub org/user, default from `gh`), ADLC_PROJECT_ID.
 * Also requires: `gh auth login` (repo create/push).
 */
import { cpSync, mkdtempSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Brief } from "./brief.js";
import { provisionRepo } from "./provision/repo.js";
import { provisionSupabase } from "./provision/supabase.js";
import { provisionVercel } from "./provision/vercel.js";
import { sendNotification } from "./notify.js";

// Backfill the canonical names from the Next.js `NEXT_PUBLIC_*` names a real .env.local uses,
// so sourcing .env.local needs no manual aliasing (mirrors cli.ts resolveEnv fallbacks).
process.env["SUPABASE_URL"] ??= process.env["NEXT_PUBLIC_SUPABASE_URL"];
process.env["SUPABASE_ANON_KEY"] ??=
  process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] ?? process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];

const REQUIRED = ["VERCEL_TOKEN", "SUPABASE_DB_URL", "SUPABASE_URL", "SUPABASE_ANON_KEY"]
  .filter((k) => !(process.env["SKIP_SUPABASE"] === "1" && k === "SUPABASE_DB_URL"));
const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.log(`SKIP proof:live — missing env: ${missing.join(", ")}`);
  console.log("Set the tokens (and run `gh auth login`) then re-run: npm run proof:live");
  process.exit(0);
}

const here = fileURLToPath(new URL(".", import.meta.url));
const miniApp = resolve(here, "..", "fixtures", "mini-app");
const org = process.env["ADLC_GH_ORG"] ?? execSync("gh api user --jq .login", { encoding: "utf8" }).trim();
const projectId = process.env["ADLC_PROJECT_ID"] ?? `proj_stage_${Date.now().toString(36)}`;
const branch = `feat/${projectId}`;

const brief: Brief = {
  project: "ADLC staged live test",
  decisions: { recipient: process.env["ADLC_NOTIFY_EMAIL"] ?? "dev@example.com" },
};

const cwd = mkdtempSync(join(tmpdir(), "adlc-live-"));
cpSync(miniApp, cwd, { recursive: true });

// gh repo create --source needs a git repo with at least one commit.
execSync("git init -q", { cwd });
execSync(`git checkout -q -b ${branch}`, { cwd });
execSync("git add -A", { cwd });
execSync('git -c user.email=adlc@bitcot.com -c user.name=ADLC commit -q -m "staged live app"', { cwd });

console.log("=== ADLC STAGED LIVE PROOF ===");
console.log(`org=${org} project=${projectId} cwd=${cwd}`);

try {
  const repo = await provisionRepo({ org, name: projectId, repoDir: cwd, branch, dryRun: false });
  console.log(`[REPO] ${repo.url} existed=${repo.existed}`);

  // ponytail: SKIP_SUPABASE=1 validates repo/vercel/email when you lack DB access; never in real runs
  let schema = `proj_${projectId}`;
  if (process.env["SKIP_SUPABASE"] === "1") {
    console.log("[SUPABASE] SKIPPED (SKIP_SUPABASE=1) — DB stage not validated");
  } else {
    const supa = await provisionSupabase({
      projectId,
      dbUrl: process.env["SUPABASE_DB_URL"] as string,
      dryRun: false,
    });
    schema = supa.schema;
    console.log(`[SUPABASE] schema=${supa.schema} rlsVerified=${supa.rlsVerified}`);
    if (!supa.rlsVerified) {
      console.error("[SUPABASE] WARNING: RLS not verified — investigate before trusting isolation.");
    }
  }

  const vercel = await provisionVercel({
    repoDir: cwd,
    projectName: projectId,
    branch,
    repoUrl: repo.url,
    token: process.env["VERCEL_TOKEN"] as string,
    envVars: {
      SUPABASE_URL: process.env["SUPABASE_URL"] as string,
      SUPABASE_ANON_KEY: process.env["SUPABASE_ANON_KEY"] as string,
      SUPABASE_SCHEMA: schema,
    },
    dryRun: false,
  });
  console.log(`[VERCEL] previewUrl=${vercel.previewUrl}`);

  const notify = await sendNotification({
    previewUrl: vercel.previewUrl,
    repoDir: cwd,
    brief,
    apiKey: process.env["SENDGRID_API_KEY"] ?? "",
    dryRun: false,
  });
  console.log(`[NOTIFY] sent=${notify.sent} recipient=${notify.recipient}`);

  console.log("\nSTAGED LIVE PROOF PASSED");
  console.log(`Preview: ${vercel.previewUrl}`);
} catch (error) {
  console.error(`\nSTAGED LIVE PROOF FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
