#!/usr/bin/env -S node --import tsx
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { loadProjectConfig } from "./config.js";
import { runProject } from "./orchestrator.js";
import { plannedChecks, preflight } from "./preflight.js";
import type { RunnerConfig } from "./router.js";

export interface CliOptions {
  command: string;
  link: string;
  dryRun: boolean;
  org: string;
  projectId: string;
  branch: string;
  repoDir: string;
  resume: boolean;
}

const KNOWN_COMMANDS = new Set(["run"]);

export function parseArgs(argv: string[]): CliOptions {
  const [command, ...rest] = argv;
  if (!command || !KNOWN_COMMANDS.has(command)) {
    throw new Error(`Unknown command: ${command ?? "(none)"}. Expected: conductor run --link <url>`);
  }

  const flags: Record<string, string> = {};
  let live = false;
  let resume = false;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--live") {
      live = true;
      continue;
    }
    if (arg === "--resume") {
      resume = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = rest[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`Flag --${key} requires a value`);
      }
      flags[key] = value;
      i++;
    }
  }

  if (!flags.link) {
    throw new Error("Missing required flag: --link <url|path>");
  }

  const projectId = flags.project ?? `proj_${Date.now().toString(36)}`;
  return {
    command,
    link: flags.link,
    dryRun: !live,
    org: flags.org ?? "adlc",
    projectId,
    branch: flags.branch ?? `feat/${projectId}`,
    repoDir: flags["repo-dir"] ?? process.cwd(),
    resume,
  };
}

export interface ResolvedEnv {
  vercelToken: string;
  supabaseDbUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  notifyApiKey: string;
  notifyEmail: string;
}

const pick = (env: Record<string, string | undefined>, ...names: string[]): string =>
  names.map((n) => env[n]).find((v) => v) ?? "";

// First env name is canonical; the rest are accepted fallbacks. Supabase URL/anon-key fall back
// to the Next.js `NEXT_PUBLIC_*` names that every project's `.env.local` actually uses (the anon
// key is also surfaced as PUBLISHABLE_KEY in newer Supabase dashboards) — no manual aliasing.
// SENDGRID_API_KEY intentionally not required — email is best-effort (notify.ts skips when unset).
const FIELDS = {
  vercelToken: ["VERCEL_TOKEN"],
  supabaseDbUrl: ["SUPABASE_DB_URL"],
  supabaseUrl: ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"],
  supabaseAnonKey: [
    "SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ],
} as const;

export function resolveEnv(env: Record<string, string | undefined>, live: boolean): ResolvedEnv {
  const resolved = {
    vercelToken: pick(env, ...FIELDS.vercelToken),
    supabaseDbUrl: pick(env, ...FIELDS.supabaseDbUrl),
    supabaseUrl: pick(env, ...FIELDS.supabaseUrl),
    supabaseAnonKey: pick(env, ...FIELDS.supabaseAnonKey),
    notifyApiKey: env.SENDGRID_API_KEY ?? "",
    notifyEmail: env.ADLC_NOTIFY_EMAIL ?? "",
  };
  if (live) {
    const missing = (Object.keys(FIELDS) as (keyof typeof FIELDS)[])
      .filter((f) => !resolved[f])
      .map((f) => FIELDS[f].join("|"));
    if (missing.length > 0) {
      throw new Error(`Live run missing required env: ${missing.join(", ")}`);
    }
  }
  return resolved;
}

function loadRunnerConfig(): RunnerConfig {
  const path = fileURLToPath(new URL("../runners.config.json", import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as RunnerConfig;
}

export async function main(
  argv: string[],
  env: Record<string, string | undefined> = process.env,
): Promise<number> {
  const opts = parseArgs(argv);
  const resolved = resolveEnv(env, !opts.dryRun);
  const runnerConfig = loadRunnerConfig();
  const { brief, policy } = loadProjectConfig(opts.repoDir);

  // Live runs touch real cloud infra with no human at runtime — verify every CLI is
  // present and authed before the first phase, so failure is at second 0, not mid-flight.
  preflight(plannedChecks(runnerConfig, !opts.dryRun));

  console.log(`[conductor] run project=${opts.projectId} dryRun=${opts.dryRun} resume=${opts.resume}`);
  console.log(`[conductor] link=${opts.link}`);

  const result = await runProject({
    link: opts.link,
    cwd: opts.repoDir,
    config: runnerConfig,
    brief,
    policy,
    org: opts.org,
    projectId: opts.projectId,
    branch: opts.branch,
    vercelToken: resolved.vercelToken,
    supabaseDbUrl: resolved.supabaseDbUrl,
    supabaseEnv: { url: resolved.supabaseUrl, anonKey: resolved.supabaseAnonKey },
    notifyApiKey: resolved.notifyApiKey,
    dryRun: opts.dryRun,
    resume: opts.resume,
  });

  console.log("\n=== RESULT ===");
  console.log(`ok:         ${result.ok}`);
  console.log(`previewUrl: ${result.previewUrl}`);
  console.log(`repoUrl:    ${result.repoUrl}`);
  console.log(`prUrl:      ${result.prUrl}`);
  console.log(`schema:     ${result.schema}`);
  console.log(`notified:   ${result.notified}`);
  console.log(`\n=== ASSUMPTIONS ===\n${result.assumptionsSummary}`);

  return result.ok ? 0 : 1;
}

// Run only when invoked directly (not when imported by tests).
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(`[conductor] FAILED: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    });
}
