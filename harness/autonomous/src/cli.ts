#!/usr/bin/env -S node --import tsx
import { createWriteStream, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadProjectConfig } from "./config.js";
import { runProject } from "./orchestrator.js";
import { plannedChecks, preflight } from "./preflight.js";
import type { RunnerConfig } from "./router.js";

/**
 * Tee all stdout/stderr output to a timestamped log file so the full conductor
 * run is preserved for debugging. Returns a flush function to call at the end.
 *
 * Wraps process.stdout.write / process.stderr.write so it captures everything:
 * console.log, console.error, and direct process.stderr.write calls from runners.
 */
function setupFileLogging(repoDir: string): { flush: () => void; logPath: string } {
  const logsDir = join(repoDir, "logs");
  mkdirSync(logsDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const logPath = join(logsDir, `conductor-${ts}.log`);
  const stream = createWriteStream(logPath, { flags: "a" });

  stream.write(`=== Conductor run started at ${new Date().toISOString()} ===\n`);

  const origStdoutWrite = process.stdout.write.bind(process.stdout);
  const origStderrWrite = process.stderr.write.bind(process.stderr);

  process.stdout.write = ((data: unknown, ...rest: unknown[]) => {
    stream.write(typeof data === "string" ? data : String(data));
    return origStdoutWrite(data as string, ...rest as []);
  }) as typeof process.stdout.write;

  process.stderr.write = ((data: unknown, ...rest: unknown[]) => {
    stream.write(typeof data === "string" ? data : String(data));
    return origStderrWrite(data as string, ...rest as []);
  }) as typeof process.stderr.write;

  return {
    logPath,
    flush: () => {
      stream.write(`\n=== Conductor run ended at ${new Date().toISOString()} ===\n`);
      stream.end();
      process.stdout.write = origStdoutWrite;
      process.stderr.write = origStderrWrite;
    },
  };
}

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

// Env-var fallbacks so `npm run conductor` works with no flags.
// Set these in your shell profile or a .env loaded before the script:
//   ADLC_LINK     — design file path or URL (required unless --link is passed)
//   ADLC_REPO_DIR — target repo directory (default: cwd)
//   ADLC_DRY_RUN  — set to "true" to skip real cloud calls (default: false — live)
//   ADLC_RESUME   — set to "true" to resume from the last checkpoint
//   ADLC_ORG      — GitHub org/user (default: "adlc")
//   ADLC_PROJECT  — stable project ID (default: auto-generated)
//   ADLC_BRANCH   — feature branch name (default: feat/<projectId>)
export function parseArgs(
  argv: string[],
  env: Record<string, string | undefined> = process.env,
): CliOptions {
  // "run" is the only command. When invoked as `npm run conductor` the subcommand
  // is omitted from argv — treat a missing/unknown first arg as "run" so the script
  // works with no arguments, driven purely by env vars.
  let args = argv;
  if (!argv[0] || !KNOWN_COMMANDS.has(argv[0])) {
    args = ["run", ...argv];
  }
  const [command, ...rest] = args;

  const flags: Record<string, string> = {};
  let explicitLive = false;
  let explicitDryRun = false;
  let resume = false;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--live") {
      explicitLive = true;
      continue;
    }
    if (arg === "--dry-run") {
      explicitDryRun = true;
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

  // Resolve link: flag beats env var.
  const link = flags.link ?? env.ADLC_LINK ?? "";
  if (!link) {
    throw new Error(
      "Missing required flag: --link <url|path>  (or set ADLC_LINK env var)",
    );
  }

  // Dry-run: explicit --dry-run flag > ADLC_DRY_RUN env var > default false (live).
  const dryRun = explicitDryRun || (!explicitLive && env.ADLC_DRY_RUN === "true");

  const projectId = flags.project ?? env.ADLC_PROJECT ?? `proj_${Date.now().toString(36)}`;
  return {
    command,
    link,
    dryRun,
    org: flags.org ?? env.ADLC_ORG ?? "adlc",
    projectId,
    branch: flags.branch ?? env.ADLC_BRANCH ?? `feat/${projectId}`,
    repoDir: flags["repo-dir"] ?? env.ADLC_REPO_DIR ?? process.cwd(),
    resume: resume || env.ADLC_RESUME === "true",
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
  const opts = parseArgs(argv, env);
  const resolved = resolveEnv(env, !opts.dryRun);
  const runnerConfig = loadRunnerConfig();
  const { brief, policy } = loadProjectConfig(opts.repoDir);

  // Live runs touch real cloud infra with no human at runtime — verify every CLI is
  // present and authed before the first phase, so failure is at second 0, not mid-flight.
  preflight(plannedChecks(runnerConfig, !opts.dryRun));

  const { flush: flushLog, logPath } = setupFileLogging(opts.repoDir);

  try {
    console.log(`[conductor] run project=${opts.projectId} dryRun=${opts.dryRun} resume=${opts.resume}`);
    console.log(`[conductor] link=${opts.link}`);
    console.log(`[conductor] log file: ${logPath}`);

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
  } finally {
    flushLog();
  }
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
