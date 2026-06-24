import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { Brief } from "./brief.js";
import type { Policy } from "./config.js";
import type { RunnerConfig } from "./router.js";
import { retry, runProject, type RunProjectDeps } from "./orchestrator.js";

const brief: Brief = {
  project: "Test",
  decisions: { storage: "Postgres", recipient: "dev@example.com" },
};
const policy: Policy = { rules: [], confidenceThreshold: 0.7 };

const config: RunnerConfig = {
  skillsDir: "/nonexistent",
  priority: ["stub"],
  runners: { stub: { kind: "stub" } },
};

function makeStubDeps(order: string[]): RunProjectDeps {
  return {
    intake: async () => {
      order.push("intake");
      return { source: "file", raw: "<h1>App</h1>", normalized: "App design" };
    },
    runGrill: async (args) => {
      order.push("grill");
      return {
        requirementsPath: join(args.cwd, "REQUIREMENTS.md"),
        requirements: "The system shall work.",
        assumptions: [],
        iterations: 1,
      };
    },
    runLifecycle: async () => {
      order.push("lifecycle");
      return {
        ok: true,
        phases: [
          { phase: "PRD", runner: "claude", ok: true, gatePassed: true, assumptions: 0, retriesUsed: 0 },
          { phase: "IMPLEMENT", runner: "codex", ok: true, gatePassed: true, assumptions: 0, retriesUsed: 0 },
        ],
      };
    },
    provisionRepo: async (args) => {
      order.push("repo");
      return {
        url: "https://github.com/org/proj",
        existed: false,
        baseBranch: "main",
        featureBranch: args.branch,
        command: "gh ...",
      };
    },
    provisionSupabase: async () => {
      order.push("supabase");
      return { schema: "proj_test", sql: "CREATE SCHEMA ...", rlsVerified: true, existed: false };
    },
    provisionVercel: async (args) => {
      order.push("vercel");
      return {
        previewUrl: "https://proj-test.vercel.app",
        projectName: args.projectName,
        envVarsSet: Object.keys(args.envVars),
        gitConnected: true,
      };
    },
    openPullRequest: async (args) => {
      order.push("pr");
      return { url: `https://github.com/org/proj/pull/1`, command: `gh pr create ${args.featureBranch}` };
    },
    sendNotification: async (args) => {
      order.push("notify");
      return { sent: true, recipient: "dev@example.com", payload: null, _url: args.previewUrl } as never;
    },
  };
}

function baseArgs(cwd: string) {
  return {
    link: "/some/design.html",
    cwd,
    config,
    brief,
    policy,
    org: "org",
    projectId: "proj_test",
    branch: "feat/x",
    vercelToken: "tok",
    supabaseDbUrl: "postgresql://stub",
    supabaseEnv: { url: "https://stub.supabase.co", anonKey: "anon" },
    notifyApiKey: "key",
    dryRun: true,
  };
}

describe("runProject", () => {
  it("runs the full pipeline in the correct order and returns the preview URL", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "adlc-orch-"));
    const order: string[] = [];
    const result = await runProject({ ...baseArgs(cwd), deps: makeStubDeps(order) });

    // notify step disabled — SendGrid 401 (sender IP not whitelisted). Re-add when restored.
    // PR opened (human review) after the preview deploys; loop never merges.
    expect(order).toEqual([
      "intake",
      "grill",
      "lifecycle",
      "repo",
      "supabase",
      "vercel",
      "pr",
    ]);
    expect(result.previewUrl).toBe("https://proj-test.vercel.app");
    expect(result.repoUrl).toBe("https://github.com/org/proj");
    expect(result.prUrl).toBe("https://github.com/org/proj/pull/1");
    expect(result.schema).toBe("proj_test");
    expect(result.notified).toBe(false);
    expect(result.ok).toBe(true);
  });

  it("withholds the live deploy when the lifecycle gate fails", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "adlc-orch-gate-"));
    const order: string[] = [];
    const deps = makeStubDeps(order);
    deps.runLifecycle = async () => {
      order.push("lifecycle");
      return {
        ok: false,
        phases: [
          { phase: "QA", runner: "codex", ok: false, gatePassed: false, assumptions: 1, retriesUsed: 2 },
        ],
      };
    };

    const result = await runProject({ ...baseArgs(cwd), dryRun: false, deps });

    // dev phases ran, but NOTHING provisioned — the gate stopped the deploy.
    expect(order).toEqual(["intake", "grill", "lifecycle"]);
    expect(order).not.toContain("vercel");
    expect(result.ok).toBe(false);
    expect(result.previewUrl).toBe("");
  });

  it("provisions Vercel with the Supabase schema in env vars", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "adlc-orch-"));
    let capturedEnv: Record<string, string> = {};
    let capturedBranch = "";
    const deps = makeStubDeps([]);
    deps.provisionVercel = async (args) => {
      capturedEnv = args.envVars;
      capturedBranch = args.branch;
      return { previewUrl: "https://x.vercel.app", projectName: args.projectName, envVarsSet: [], gitConnected: true };
    };

    await runProject({ ...baseArgs(cwd), deps });
    expect(capturedEnv.SUPABASE_SCHEMA).toBe("proj_test");
    expect(capturedEnv.SUPABASE_URL).toBe("https://stub.supabase.co");
    // Vercel deploys the feature branch (deploy-from-branch, #3/#10).
    expect(capturedBranch).toBe("feat/x");
  });
});

describe("retry", () => {
  const noSleep = async () => {};

  it("returns the result on first success without retrying", async () => {
    let calls = 0;
    const result = await retry(async () => { calls++; return "ok"; }, 3, 1, noSleep);
    expect(result).toBe("ok");
    expect(calls).toBe(1);
  });

  it("retries transient failures then succeeds", async () => {
    let calls = 0;
    const result = await retry(
      async () => {
        calls++;
        if (calls < 3) throw new Error("429 rate limited");
        return "ok";
      },
      3,
      1,
      noSleep,
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("throws the last error after exhausting all attempts", async () => {
    let calls = 0;
    await expect(
      retry(async () => { calls++; throw new Error(`fail ${calls}`); }, 3, 1, noSleep),
    ).rejects.toThrow("fail 3");
    expect(calls).toBe(3);
  });
});
