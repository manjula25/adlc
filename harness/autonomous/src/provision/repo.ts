import { execSync } from "node:child_process";

export interface RepoProvisionArgs {
  org: string;
  name: string;
  repoDir: string;
  // The feature branch that carries the generated app (e.g. feat/<projectId>). The PR
  // (deploy-from-branch governance, ADLC-AUTONOMY-PLAN §2) is opened from this branch into
  // the base branch for a human to review; the loop never merges to base.
  branch: string;
  baseBranch?: string;
  dryRun?: boolean;
  exec?: (cmd: string) => string;
}

export interface RepoProvisionResult {
  url: string;
  existed: boolean;
  // The base branch the PR targets (default "main") — carries no app code, just an init commit.
  baseBranch: string;
  // The feature branch the app was committed + pushed to; head of the human-review PR.
  featureBranch: string;
  command: string;
}

const DEFAULT_BASE_BRANCH = "main";

function defaultExec(cmd: string): string {
  return execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
}

// ADLC_GH_ORG must be the owner (user/org). Tolerate a pasted GitHub URL or `owner/repo`
// by keeping only the owner segment — `gh repo create owner/name` needs exactly one slash.
export function normalizeOwner(org: string): string {
  const owner = org
    .trim()
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/\.git$/i, "")
    .split("/")[0];
  if (!owner) {
    throw new Error(`Invalid ADLC_GH_ORG: "${org}" — expected a GitHub owner like "manjula25"`);
  }
  return owner;
}

export function buildRepoCommand(org: string, name: string, repoDir: string): string {
  return `gh repo create ${normalizeOwner(org)}/${name} --private --source "${repoDir}" --remote origin --push`;
}

export function buildCheckCommand(org: string, name: string): string {
  return `gh repo view ${normalizeOwner(org)}/${name} --json name --jq .name`;
}

// The base branch gets an empty init commit ONLY — no app code. This makes `main` an
// empty baseline so the feature branch's PR diff is exactly the generated app (clean human
// review). Idempotent: `init -b` is a no-op branch hint on an existing repo, and an extra
// `--allow-empty` commit is harmless. Generated files stay untracked here (committed on the
// feature branch below), so `main` carries no app code.
export function buildBaseCommitCommands(repoDir: string, baseBranch: string): string[] {
  const git = `git -C "${repoDir}"`;
  return [
    `${git} init -q -b ${baseBranch}`,
    `${git} -c user.email=adlc@bitcot.com -c user.name=ADLC commit -q --allow-empty -m "ADLC: init"`,
  ];
}

// Move the generated app onto the feature branch and commit it. `checkout -B` creates (or
// resets) the feature branch at the base HEAD so the diff is just the app. The commit is
// skipped when nothing is staged (empty-diff is already guarded upstream in the lifecycle).
export function buildFeatureCommitCommands(repoDir: string, featureBranch: string): string[] {
  const git = `git -C "${repoDir}"`;
  return [
    `${git} checkout -B ${featureBranch}`,
    `${git} add -A`,
    `${git} diff --cached --quiet || ${git} -c user.email=adlc@bitcot.com -c user.name=ADLC commit -q -m "ADLC: generated app"`,
  ];
}

export async function provisionRepo(args: RepoProvisionArgs): Promise<RepoProvisionResult> {
  const exec = args.exec ?? defaultExec;
  const baseBranch = args.baseBranch ?? DEFAULT_BASE_BRANCH;
  const featureBranch = args.branch;
  const command = buildRepoCommand(args.org, args.name, args.repoDir);
  const checkCmd = buildCheckCommand(args.org, args.name);

  if (args.dryRun) {
    return {
      url: `https://github.com/${args.org}/${args.name}`,
      existed: false,
      baseBranch,
      featureBranch,
      command,
    };
  }

  // 1) Empty base commit on the base branch so `gh repo create --push` has a HEAD to push
  //    and the base branch exists as the PR target.
  for (const cmd of buildBaseCommitCommands(args.repoDir, baseBranch)) {
    exec(cmd);
  }

  // 2) Create the repo (idempotent). `gh repo create --source --push` pushes the current
  //    (base) branch and sets it as default; if the repo already exists we push the base
  //    branch explicitly instead.
  let existed = false;
  try {
    exec(checkCmd);
    existed = true;
    exec(`git -C "${args.repoDir}" push -u origin ${baseBranch}`);
  } catch {
    exec(command);
  }

  // 3) Commit the generated app onto the feature branch and push it — the head of the
  //    human-review PR and the branch the Vercel preview is built from (#3, #10).
  for (const cmd of buildFeatureCommitCommands(args.repoDir, featureBranch)) {
    exec(cmd);
  }
  exec(`git -C "${args.repoDir}" push -u origin ${featureBranch}`);

  return {
    url: `https://github.com/${normalizeOwner(args.org)}/${args.name}`,
    existed,
    baseBranch,
    featureBranch,
    command,
  };
}
