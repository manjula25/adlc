import { describe, expect, it } from "vitest";

import {
  buildRepoCommand,
  buildCheckCommand,
  buildBaseCommitCommands,
  buildFeatureCommitCommands,
  normalizeOwner,
  provisionRepo,
} from "./repo.js";

describe("buildRepoCommand", () => {
  it("constructs the exact gh invocation", () => {
    const cmd = buildRepoCommand("myorg", "myrepo", "/tmp/repo");
    expect(cmd).toBe(`gh repo create myorg/myrepo --private --source "/tmp/repo" --remote origin --push`);
  });
});

describe("normalizeOwner", () => {
  it("keeps a plain owner", () => {
    expect(normalizeOwner("manjula25")).toBe("manjula25");
  });
  it("strips a pasted GitHub URL down to the owner", () => {
    expect(normalizeOwner("https://github.com/manjula25/ADLC_test")).toBe("manjula25");
  });
  it("keeps only the owner from owner/repo", () => {
    expect(normalizeOwner("manjula25/ADLC_test")).toBe("manjula25");
  });
  it("throws on empty input", () => {
    expect(() => normalizeOwner("")).toThrow(/Invalid ADLC_GH_ORG/);
  });
});

describe("buildCheckCommand", () => {
  it("constructs the gh view command", () => {
    expect(buildCheckCommand("myorg", "myrepo")).toBe(
      "gh repo view myorg/myrepo --json name --jq .name",
    );
  });
});

describe("provisionRepo — dryRun", () => {
  it("returns expected URL, branches, and command without executing", async () => {
    const result = await provisionRepo({
      org: "acme",
      name: "my-feature",
      repoDir: "/tmp/myrepo",
      branch: "feat/my-feature",
      dryRun: true,
    });

    expect(result.url).toBe("https://github.com/acme/my-feature");
    expect(result.command).toContain("gh repo create");
    expect(result.command).toContain("acme/my-feature");
    expect(result.existed).toBe(false);
    expect(result.baseBranch).toBe("main");
    expect(result.featureBranch).toBe("feat/my-feature");
  });
});

describe("buildBaseCommitCommands", () => {
  it("inits on the base branch and makes an empty (app-free) base commit", () => {
    const cmds = buildBaseCommitCommands("/tmp/repo", "main");
    expect(cmds).toHaveLength(2);
    expect(cmds[0]).toContain("init -q -b main");
    expect(cmds[1]).toContain("commit -q --allow-empty");
    expect(cmds.every((c) => c.includes('git -C "/tmp/repo"'))).toBe(true);
  });
});

describe("buildFeatureCommitCommands", () => {
  it("checks out the feature branch, stages, and commits only when staged", () => {
    const cmds = buildFeatureCommitCommands("/tmp/repo", "feat/x");
    expect(cmds).toHaveLength(3);
    expect(cmds[0]).toContain("checkout -B feat/x");
    expect(cmds[1]).toContain("add -A");
    expect(cmds[2]).toContain("diff --cached --quiet ||");
  });
});

describe("provisionRepo — idempotent (mocked exec)", () => {
  it("pushes base + feature and skips create when repo exists", async () => {
    const executed: string[] = [];
    const exec = (cmd: string) => {
      executed.push(cmd);
      return "my-feature"; // gh view returns repo name → exists
    };

    const result = await provisionRepo({
      org: "acme",
      name: "my-feature",
      repoDir: "/tmp/repo",
      branch: "feat/my-feature",
      exec,
    });

    expect(result.existed).toBe(true);
    expect(result.featureBranch).toBe("feat/my-feature");
    expect(executed.some((c) => c.includes("gh repo view"))).toBe(true);
    expect(executed.some((c) => c.includes("gh repo create"))).toBe(false); // skipped
    expect(executed.some((c) => c.includes("push -u origin main"))).toBe(true);
    expect(executed.some((c) => c.includes("push -u origin feat/my-feature"))).toBe(true);
    expect(executed.some((c) => c.includes("checkout -B feat/my-feature"))).toBe(true);
  });

  it("creates repo when check throws (repo absent), then pushes the feature branch", async () => {
    const executed: string[] = [];
    const exec = (cmd: string) => {
      executed.push(cmd);
      if (cmd.includes("view")) throw new Error("not found");
      return "";
    };

    const result = await provisionRepo({
      org: "acme",
      name: "new-repo",
      repoDir: "/tmp/repo",
      branch: "feat/new-repo",
      exec,
    });

    expect(result.existed).toBe(false);
    expect(executed.some((c) => c.includes("gh repo create"))).toBe(true);
    // create handles the base push; we never push base separately on the absent path.
    expect(executed.filter((c) => c.includes("push -u origin main"))).toHaveLength(0);
    expect(executed[executed.length - 1]).toContain("push -u origin feat/new-repo");
  });
});
