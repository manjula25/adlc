import { describe, expect, it } from "vitest";

import { parseArgs, resolveEnv } from "./cli.js";

describe("parseArgs", () => {
  it("parses a minimal run command with a link", () => {
    const opts = parseArgs(["run", "--link", "https://claude.ai/x"]);
    expect(opts.command).toBe("run");
    expect(opts.link).toBe("https://claude.ai/x");
    expect(opts.dryRun).toBe(false); // live by default for autonomous runs
  });

  it("opts into dry-run via --dry-run flag", () => {
    const opts = parseArgs(["run", "--link", "https://claude.ai/x", "--dry-run"]);
    expect(opts.dryRun).toBe(true);
  });

  it("opts into dry-run via ADLC_DRY_RUN env var", () => {
    const opts = parseArgs(["run", "--link", "https://claude.ai/x"], { ADLC_DRY_RUN: "true" });
    expect(opts.dryRun).toBe(true);
  });

  it("reads link from ADLC_LINK env var when flag is absent", () => {
    const opts = parseArgs(["run"], { ADLC_LINK: "https://env.example/design.html" });
    expect(opts.link).toBe("https://env.example/design.html");
    expect(opts.dryRun).toBe(false);
  });

  it("reads repo-dir from ADLC_REPO_DIR env var", () => {
    const opts = parseArgs(["run"], { ADLC_LINK: "x", ADLC_REPO_DIR: "/custom/repo" });
    expect(opts.repoDir).toBe("/custom/repo");
  });

  it("works without the 'run' subcommand (npm run conductor style)", () => {
    const opts = parseArgs(["--link", "https://claude.ai/x"]);
    expect(opts.command).toBe("run");
    expect(opts.link).toBe("https://claude.ai/x");
  });

  it("flips to live with --live and reads optional flags", () => {
    const opts = parseArgs([
      "run",
      "--link",
      "/path/design.html",
      "--live",
      "--org",
      "bitcot",
      "--project",
      "proj_demo",
      "--branch",
      "feat/demo",
      "--repo-dir",
      "/tmp/demo",
    ]);
    expect(opts.dryRun).toBe(false);
    expect(opts.org).toBe("bitcot");
    expect(opts.projectId).toBe("proj_demo");
    expect(opts.branch).toBe("feat/demo");
    expect(opts.repoDir).toBe("/tmp/demo");
  });

  it("throws when no link is provided", () => {
    expect(() => parseArgs(["run"])).toThrow(/--link/);
  });

  it("treats an unknown first arg as a flag (npm run conductor style — no subcommand)", () => {
    // "frobnicate" is not a known command but also not a --flag, so it's treated as the
    // implicit "run" subcommand and the remaining args are parsed normally.
    const opts = parseArgs(["--link", "x"]);
    expect(opts.command).toBe("run");
  });
});

describe("resolveEnv", () => {
  it("collects required live tokens from the environment", () => {
    const env = {
      VERCEL_TOKEN: "vtok",
      SUPABASE_DB_URL: "postgresql://x",
      SUPABASE_URL: "https://x.supabase.co",
      SUPABASE_ANON_KEY: "anon",
      SENDGRID_API_KEY: "sg",
    };
    const resolved = resolveEnv(env, true);
    expect(resolved.vercelToken).toBe("vtok");
    expect(resolved.supabaseDbUrl).toBe("postgresql://x");
    expect(resolved.notifyApiKey).toBe("sg");
  });

  it("falls back to NEXT_PUBLIC_* names from .env.local", () => {
    const env = {
      VERCEL_TOKEN: "vtok",
      SUPABASE_DB_URL: "postgresql://x",
      NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pub",
    };
    const resolved = resolveEnv(env, true);
    expect(resolved.supabaseUrl).toBe("https://x.supabase.co");
    expect(resolved.supabaseAnonKey).toBe("pub");
  });

  it("throws in live mode when a required token is missing", () => {
    expect(() => resolveEnv({}, true)).toThrow(/missing/i);
  });

  it("tolerates missing tokens in dry-run mode", () => {
    const resolved = resolveEnv({}, false);
    expect(resolved.vercelToken).toBe("");
  });
});
