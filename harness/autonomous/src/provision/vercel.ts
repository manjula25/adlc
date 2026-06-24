import { execSync } from "node:child_process";

export interface VercelProvisionArgs {
  repoDir: string;
  projectName: string;
  branch: string;
  // The GitHub repo URL (origin) to connect the Vercel project to, so pushes to the feature
  // branch auto-build a branch-tracked preview (#10, git-connected model).
  repoUrl: string;
  envVars: Record<string, string>;
  token: string;
  dryRun?: boolean;
  exec?: (cmd: string) => string;
}

export interface VercelProvisionResult {
  previewUrl: string;
  projectName: string;
  envVarsSet: string[];
  // Whether the project was linked to the GitHub repo (auto-deploy on push enabled).
  gitConnected: boolean;
}

// Strip secrets from any string before it can reach a log/error. execSync puts the full failing
// command (token and all) into err.message, so an unredacted throw leaks the Vercel token.
export function redactSecrets(text: string): string {
  return text
    .replace(/(--token\s+")[^"]*(")/g, "$1***$2")
    .replace(/(printf '%s' ")[^"]*(")/g, "$1***$2");
}

function defaultExec(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  } catch (err) {
    if (err instanceof Error) err.message = redactSecrets(err.message);
    throw err;
  }
}

// `vercel git connect` exits non-zero when the repo is already connected, even though that is the
// desired end state. Treat it as success so re-runs (and proof:live) are idempotent.
export function isAlreadyConnected(err: unknown): boolean {
  const e = err as { message?: string; stdout?: unknown; stderr?: unknown };
  const haystack = `${e?.message ?? ""} ${String(e?.stdout ?? "")} ${String(e?.stderr ?? "")}`;
  return /already connected/i.test(haystack);
}

// Vercel project names must be lowercase [a-z0-9._-], no `---`, ≤100 chars. Without an
// explicit name Vercel derives one from the source dir basename (e.g. a mkdtemp temp dir
// with uppercase) → 400. So we sanitize and `vercel link --project` before deploying.
export function sanitizeProjectName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-{3,}/g, "--")
    .replace(/^[-._]+|[-._]+$/g, "");
  return cleaned.slice(0, 100) || "adlc-app";
}

// Vercel turns a git branch into a subdomain slug: lowercase, every non [a-z0-9] run → "-".
// `feat/adlc-staged-live` → `feat-adlc-staged-live`.
export function sanitizeBranchSlug(branch: string): string {
  return branch
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildLinkCommand(repoDir: string, token: string, projectName: string): string {
  return `vercel link --yes --project "${projectName}" --cwd "${repoDir}" --token "${token}"`;
}

// Connect the linked Vercel project to the GitHub repo so every push to the feature branch
// auto-builds a branch-tracked preview (`*-git-<branch>-<scope>.vercel.app`) that updates on
// future pushes (#10). Re-connecting an already-connected repo exits non-zero; the caller
// swallows that via isAlreadyConnected so the flow stays idempotent.
export function buildGitConnectCommand(repoDir: string, repoUrl: string, token: string): string {
  return `vercel git connect "${repoUrl}" --cwd "${repoDir}" --token "${token}" --yes`;
}

// env add targets the project linked in repoDir (via --cwd), not a --scope team slug.
// printf (not echo) avoids appending a newline to the secret value.
export function buildEnvCommand(key: string, value: string, token: string, repoDir: string): string {
  return `printf '%s' "${value}" | vercel env add "${key}" preview --cwd "${repoDir}" --token "${token}" --yes`;
}

// `vercel whoami` prints the account/team slug, which is the `<scope>` segment of the branch
// preview alias. We need it to construct the URL without parsing async deploy output.
export function buildWhoamiCommand(token: string): string {
  return `vercel whoami --token "${token}"`;
}

// The earlier `provisionRepo` push happened BEFORE `git connect`, so Vercel never saw it. Push
// an empty commit on the branch now to fire the webhook and build from GitHub (with env already
// set). `HEAD:<branch>` pushes the current commit to the branch ref regardless of local name.
export function buildBranchTriggerCommands(repoDir: string, branch: string): string[] {
  const git = `git -C "${repoDir}"`;
  return [
    `${git} -c user.email=adlc@bitcot.com -c user.name=ADLC commit -q --allow-empty -m "ADLC: trigger Vercel build"`,
    `${git} push origin HEAD:${branch}`,
  ];
}

// Deterministic branch preview alias Vercel assigns to a git-connected branch.
// ponytail: holds while `<project>-git-<branch>-<scope>` ≤ 63 chars (one DNS label). Past that
// Vercel substitutes a hashed alias and this URL 404s — upgrade path: poll the Vercel API for
// the branch deployment's real alias.
export function buildBranchAliasUrl(projectName: string, branch: string, scope: string): string {
  return `https://${projectName}-git-${sanitizeBranchSlug(branch)}-${scope.trim()}.vercel.app`;
}

export async function provisionVercel(args: VercelProvisionArgs): Promise<VercelProvisionResult> {
  const exec = args.exec ?? defaultExec;
  const projectName = sanitizeProjectName(args.projectName);

  if (args.dryRun) {
    return {
      previewUrl: buildBranchAliasUrl(projectName, args.branch, "scope"),
      projectName,
      envVarsSet: Object.keys(args.envVars),
      gitConnected: true,
    };
  }

  // 1. Pin the project name so Vercel doesn't derive it from the temp-dir basename.
  exec(buildLinkCommand(args.repoDir, args.token, projectName));

  // 2. Connect the GitHub repo FIRST so the branch push below is built on Vercel (#10).
  //    Already-connected exits non-zero but is the desired state — swallow only that case.
  try {
    exec(buildGitConnectCommand(args.repoDir, args.repoUrl, args.token));
  } catch (err) {
    if (!isAlreadyConnected(err)) throw err;
  }

  // 3. Set env vars BEFORE the build — a build without the Supabase config fails at runtime.
  for (const [key, value] of Object.entries(args.envVars)) {
    exec(buildEnvCommand(key, value, args.token, args.repoDir));
  }

  // 4. Trigger the git-connected build by pushing the branch, then return its deterministic
  //    branch alias (which keeps updating on every subsequent push).
  const scope = exec(buildWhoamiCommand(args.token)).trim();
  for (const cmd of buildBranchTriggerCommands(args.repoDir, args.branch)) {
    exec(cmd);
  }

  return {
    previewUrl: buildBranchAliasUrl(projectName, args.branch, scope),
    projectName,
    envVarsSet: Object.keys(args.envVars),
    gitConnected: true,
  };
}
