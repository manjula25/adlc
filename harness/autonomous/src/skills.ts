import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Lifecycle phase names that map to an existing command file under a different name.
const COMMAND_ALIASES: Record<string, string> = {
  "to-prd": "create-prd",
  implement: "implement-codex",
};

export function loadSkill(name: string, skillsDir = defaultSkillsDir()): string {
  const resolved = resolveSkillsDir(skillsDir);
  const commandsDir = join(resolved, "..", "commands");

  // Resolution order: a dedicated SKILL.md wins, then a sibling commands/<name>.md,
  // then the aliased command file. This reuses the rich command prose as the single
  // source instead of duplicating it into adlc/skills (avoids drift, plan §4).
  const candidates = [
    join(resolved, name, "SKILL.md"),
    join(commandsDir, `${name}.md`),
    join(commandsDir, `${COMMAND_ALIASES[name] ?? name}.md`),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, "utf8");
    }
  }

  throw new Error(`Skill not found: ${name} (looked in ${candidates.join(", ")})`);
}

export function listSkills(skillsDir = defaultSkillsDir()): string[] {
  const resolved = resolveSkillsDir(skillsDir);

  if (!existsSync(resolved)) {
    return [];
  }

  return readdirSync(resolved)
    .filter((entry) => {
      const skillPath = join(resolved, entry);
      return statSync(skillPath).isDirectory() && existsSync(join(skillPath, "SKILL.md"));
    })
    .sort();
}

function resolveSkillsDir(skillsDir: string): string {
  if (isAbsolute(skillsDir)) {
    return skillsDir;
  }
  // Relative skillsDir (e.g. "adlc/skills" from runners.config.json) is anchored to
  // the harness root (two levels up from this file's src dir), not process.cwd().
  const harnessRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
  return resolve(harnessRoot, skillsDir);
}

function defaultSkillsDir(): string {
  return resolve(process.cwd(), "..", "..", ".claude", "skills");
}
