import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildPrCommand, parsePrUrl, repoSlug, openPullRequest } from "./pr.js";

describe("repoSlug", () => {
  it("normalizes the owner and joins with the repo name", () => {
    expect(repoSlug("https://github.com/manjula25", "proj_x")).toBe("manjula25/proj_x");
  });
});

describe("buildPrCommand", () => {
  it("targets base from head with a body file", () => {
    const cmd = buildPrCommand("org/proj", "main", "feat/x", "ADLC: preview", "/tmp/b.md");
    expect(cmd).toContain("gh pr create");
    expect(cmd).toContain("--repo org/proj");
    expect(cmd).toContain("--base main");
    expect(cmd).toContain("--head feat/x");
    expect(cmd).toContain(`--body-file "/tmp/b.md"`);
  });
});

describe("parsePrUrl", () => {
  it("extracts the PR URL from gh output", () => {
    expect(parsePrUrl("Creating pull request...\nhttps://github.com/org/proj/pull/7\n")).toBe(
      "https://github.com/org/proj/pull/7",
    );
  });
});

describe("openPullRequest — dryRun", () => {
  it("returns a synthetic PR URL without executing", async () => {
    const result = await openPullRequest({
      org: "org",
      name: "proj",
      repoDir: "/tmp/x",
      baseBranch: "main",
      featureBranch: "feat/x",
      title: "t",
      body: "b",
      dryRun: true,
    });
    expect(result.url).toBe("https://github.com/org/proj/pull/1");
  });
});

describe("openPullRequest — mocked exec", () => {
  it("writes the body file and returns the parsed PR URL", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "adlc-pr-"));
    const executed: string[] = [];
    const exec = (cmd: string) => {
      executed.push(cmd);
      return "https://github.com/org/proj/pull/9";
    };

    const result = await openPullRequest({
      org: "org",
      name: "proj",
      repoDir: cwd,
      baseBranch: "main",
      featureBranch: "feat/x",
      title: "ADLC: preview",
      body: "Preview: https://x.vercel.app\n\n## Assumptions\nnone",
      exec,
    });

    expect(result.url).toBe("https://github.com/org/proj/pull/9");
    expect(executed.some((c) => c.includes("gh pr create"))).toBe(true);
    const body = readFileSync(join(cwd, ".adlc", "pr-body.md"), "utf8");
    expect(body).toContain("Preview: https://x.vercel.app");
  });

  it("falls back to the existing PR URL when create fails", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "adlc-pr-"));
    const exec = (cmd: string) => {
      if (cmd.includes("gh pr create")) throw new Error("a pull request already exists");
      return "https://github.com/org/proj/pull/3\n";
    };

    const result = await openPullRequest({
      org: "org",
      name: "proj",
      repoDir: cwd,
      baseBranch: "main",
      featureBranch: "feat/x",
      title: "t",
      body: "b",
      exec,
    });

    expect(result.url).toBe("https://github.com/org/proj/pull/3");
  });
});
