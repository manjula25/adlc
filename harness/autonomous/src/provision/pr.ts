import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { normalizeOwner } from "./repo.js";

export interface PullRequestArgs {
  org: string;
  name: string;
  repoDir: string;
  baseBranch: string;
  featureBranch: string;
  title: string;
  // Markdown body — preview URL + ASSUMPTIONS summary. Passed via a file (--body-file) so
  // multi-line content and shell metacharacters survive intact.
  body: string;
  dryRun?: boolean;
  exec?: (cmd: string) => string;
}

export interface PullRequestResult {
  url: string;
  command: string;
}

function defaultExec(cmd: string): string {
  return execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
}

export function repoSlug(org: string, name: string): string {
  return `${normalizeOwner(org)}/${name}`;
}

// `gh pr create` opens the human-review PR (feature → base). The loop NEVER merges; a human
// merges base offline (deploy-from-branch governance, ADLC-AUTONOMY-PLAN §2).
export function buildPrCommand(
  slug: string,
  baseBranch: string,
  featureBranch: string,
  title: string,
  bodyFile: string,
): string {
  return [
    "gh pr create",
    `--repo ${slug}`,
    `--base ${baseBranch}`,
    `--head ${featureBranch}`,
    `--title "${title.replace(/"/g, '\\"')}"`,
    `--body-file "${bodyFile}"`,
  ].join(" ");
}

// gh prints the PR URL on success; surface the first github.com/.../pull/N it emits.
export function parsePrUrl(output: string): string {
  const match = output.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/);
  return match ? match[0] : output.trim();
}

export async function openPullRequest(args: PullRequestArgs): Promise<PullRequestResult> {
  const exec = args.exec ?? defaultExec;
  const slug = repoSlug(args.org, args.name);
  const bodyFile = join(args.repoDir, ".adlc", "pr-body.md");
  const command = buildPrCommand(slug, args.baseBranch, args.featureBranch, args.title, bodyFile);

  if (args.dryRun) {
    return { url: `https://github.com/${slug}/pull/1`, command };
  }

  mkdirSync(dirname(bodyFile), { recursive: true });
  writeFileSync(bodyFile, args.body);

  // Idempotent: if a PR for this head already exists, reuse its URL instead of failing.
  try {
    const output = exec(command);
    return { url: parsePrUrl(output), command };
  } catch {
    const existing = exec(
      `gh pr view ${args.featureBranch} --repo ${slug} --json url --jq .url`,
    );
    return { url: existing.trim(), command };
  }
}
