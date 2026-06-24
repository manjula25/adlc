import { describe, expect, it } from "vitest";

import {
  buildBranchAliasUrl,
  buildBranchTriggerCommands,
  buildEnvCommand,
  buildGitConnectCommand,
  buildLinkCommand,
  buildWhoamiCommand,
  isAlreadyConnected,
  provisionVercel,
  redactSecrets,
  sanitizeBranchSlug,
  sanitizeProjectName,
} from "./vercel.js";

describe("sanitizeProjectName", () => {
  it("lowercases and replaces invalid chars", () => {
    expect(sanitizeProjectName("adlc-live-qEgo8t")).toBe("adlc-live-qego8t");
  });
  it("collapses '---' which Vercel forbids", () => {
    expect(sanitizeProjectName("a---b")).toBe("a--b");
  });
  it("trims leading/trailing separators and falls back when empty", () => {
    expect(sanitizeProjectName("___")).toBe("adlc-app");
  });
});

describe("sanitizeBranchSlug", () => {
  it("lowercases and turns non-alphanumeric runs into single dashes", () => {
    expect(sanitizeBranchSlug("feat/adlc-staged-live")).toBe("feat-adlc-staged-live");
    expect(sanitizeBranchSlug("Feat/My_Branch.v2")).toBe("feat-my-branch-v2");
  });
});

describe("buildGitConnectCommand", () => {
  it("connects the project to the GitHub repo for auto-deploys", () => {
    const cmd = buildGitConnectCommand("/tmp/repo", "https://github.com/org/proj", "tok123");
    expect(cmd).toContain("vercel git connect");
    expect(cmd).toContain("https://github.com/org/proj");
    expect(cmd).toContain('--cwd "/tmp/repo"');
    expect(cmd).toContain("--yes");
  });
});

describe("buildLinkCommand", () => {
  it("pins the project name and cwd", () => {
    const cmd = buildLinkCommand("/tmp/repo", "tok123", "my-proj");
    expect(cmd).toContain("vercel link");
    expect(cmd).toContain('--project "my-proj"');
    expect(cmd).toContain('--cwd "/tmp/repo"');
    expect(cmd).toContain("--yes");
  });
});

describe("buildEnvCommand", () => {
  it("targets the linked dir via --cwd, not --scope", () => {
    const cmd = buildEnvCommand("SUPABASE_URL", "https://x.supabase.co", "tok123", "/tmp/repo");
    expect(cmd).toContain("vercel env add");
    expect(cmd).toContain("SUPABASE_URL");
    expect(cmd).toContain('--cwd "/tmp/repo"');
    expect(cmd).not.toContain("--scope");
  });
});

describe("buildWhoamiCommand", () => {
  it("passes the token", () => {
    expect(buildWhoamiCommand("tok123")).toBe('vercel whoami --token "tok123"');
  });
});

describe("buildBranchTriggerCommands", () => {
  it("makes an empty commit then pushes the branch ref to fire the git build", () => {
    const [commit, push] = buildBranchTriggerCommands("/tmp/repo", "feat/x");
    expect(commit).toContain("commit -q --allow-empty");
    expect(push).toBe('git -C "/tmp/repo" push origin HEAD:feat/x');
  });
});

describe("buildBranchAliasUrl", () => {
  it("builds the deterministic git-connected branch preview alias", () => {
    expect(buildBranchAliasUrl("adlc-app", "feat/adlc-staged-live", "manjula25")).toBe(
      "https://adlc-app-git-feat-adlc-staged-live-manjula25.vercel.app",
    );
  });
});

describe("provisionVercel — dryRun", () => {
  it("returns a branch-alias URL and lists env vars without executing", async () => {
    const result = await provisionVercel({
      repoDir: "/tmp/repo",
      projectName: "test-proj",
      branch: "feat/x",
      repoUrl: "https://github.com/org/proj",
      token: "tok",
      envVars: {
        SUPABASE_URL: "https://x.supabase.co",
        SUPABASE_ANON_KEY: "anon123",
      },
      dryRun: true,
    });

    expect(result.previewUrl).toContain("vercel.app");
    expect(result.envVarsSet).toEqual(["SUPABASE_URL", "SUPABASE_ANON_KEY"]);
    expect(result.gitConnected).toBe(true);
  });
});

describe("provisionVercel — mocked exec", () => {
  it("connects git + sets env before triggering the branch build, returns the alias", async () => {
    const executed: string[] = [];
    const exec = (cmd: string) => {
      executed.push(cmd);
      if (cmd.includes("vercel whoami")) {
        return "manjula25\n";
      }
      return "";
    };

    const result = await provisionVercel({
      repoDir: "/tmp/repo",
      projectName: "test-proj",
      branch: "feat/x",
      repoUrl: "https://github.com/org/proj",
      token: "tok",
      envVars: { SUPABASE_URL: "https://x.supabase.co" },
      exec,
    });

    expect(result.previewUrl).toBe("https://test-proj-git-feat-x-manjula25.vercel.app");
    expect(result.envVarsSet).toEqual(["SUPABASE_URL"]);
    expect(result.gitConnected).toBe(true);
    // link → git connect → 1 env var → whoami → empty commit → push = 6 exec calls, in order.
    expect(executed).toHaveLength(6);
    expect(executed[0]).toContain("vercel link");
    expect(executed[1]).toContain("vercel git connect");
    expect(executed[2]).toContain("vercel env add");
    expect(executed[3]).toContain("vercel whoami");
    expect(executed[4]).toContain("commit -q --allow-empty");
    expect(executed[5]).toContain("push origin HEAD:feat/x");
  });

  it("treats an already-connected repo as success (idempotent re-run)", async () => {
    const executed: string[] = [];
    const exec = (cmd: string) => {
      executed.push(cmd);
      if (cmd.includes("vercel git connect")) {
        throw Object.assign(new Error("Command failed: vercel git connect"), {
          stderr: "manjula25/proj is already connected to your project.",
        });
      }
      if (cmd.includes("vercel whoami")) return "manjula25\n";
      return "";
    };

    const result = await provisionVercel({
      repoDir: "/tmp/repo",
      projectName: "test-proj",
      branch: "feat/x",
      repoUrl: "https://github.com/org/proj",
      token: "tok",
      envVars: {},
      exec,
    });

    expect(result.gitConnected).toBe(true);
    // flow continues past the swallowed git-connect error
    expect(executed.some((c) => c.includes("push origin HEAD:feat/x"))).toBe(true);
  });

  it("rethrows a git-connect error that is NOT already-connected", async () => {
    const exec = (cmd: string) => {
      if (cmd.includes("vercel git connect")) {
        throw new Error("Command failed: authentication required");
      }
      return "";
    };
    await expect(
      provisionVercel({
        repoDir: "/tmp/repo",
        projectName: "test-proj",
        branch: "feat/x",
        repoUrl: "https://github.com/org/proj",
        token: "tok",
        envVars: {},
        exec,
      }),
    ).rejects.toThrow(/authentication required/);
  });
});

describe("isAlreadyConnected", () => {
  it("matches the Vercel already-connected message in stderr", () => {
    expect(isAlreadyConnected({ stderr: "repo is already connected to your project." })).toBe(true);
  });
  it("is false for other errors", () => {
    expect(isAlreadyConnected(new Error("boom"))).toBe(false);
  });
});

describe("redactSecrets", () => {
  it("masks the token and printf secret values", () => {
    const cmd = `vercel git connect "x" --token "vcp_abc123" --yes`;
    expect(redactSecrets(cmd)).toBe(`vercel git connect "x" --token "***" --yes`);
    expect(redactSecrets(`printf '%s' "supersecret" | vercel env add`)).toContain(`'%s' "***"`);
  });
});
