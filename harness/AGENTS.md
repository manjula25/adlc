# AGENTS.md — runner-neutral entrypoint

This project uses the **ADLC** lifecycle. Its AI assets are the single source of truth in `adlc/`,
usable by ANY runner (Claude Code, Codex/GPT, opencode, Kimi, etc.).

## Where things live (canonical, neutral)
- `adlc/skills/<name>/SKILL.md` — reusable capabilities (codex-bridge, agent-browser, vercel-deploy, …)
- `adlc/commands/<name>.md` — lifecycle steps (plan-feature, implement-codex, qa-run, code-review, …)
- `adlc/subagents/<name>.md` — judgment-only subagents (reviewer, qa-agent, deploy-agent)
- `.agents/plans/` — approved per-feature plans · `.agents/roles/` — governance · `.agents/reference/` — context
- `BRIEF.md` / `POLICY.md` (per target project) — the Decision Oracle source for headless runs

`.claude/{skills,commands,agents}` are **symlinks into `adlc/`** so Claude Code + opencode discover them
natively. Codex and other runners: read the relevant `adlc/...` markdown and follow it as instructions
(the autonomous conductor inlines it for you; `harness/autonomous/runners.config.json` sets `skillsDir`).

## Golden rules (all runners) — revised 2026-06-22
- **Claude writes ZERO app/test code.** All implementation is produced by the code engine (Codex GPT-5.5)
  via the `codex-bridge` skill. Judgment models plan, dispatch, review diffs, write corrective prompts.
- **Deploy-from-branch, never merge.** The loop deploys the feature branch as a Vercel preview and emails
  the URL. Runners do NOT merge to `main`; a human merges `main` offline, asynchronously (non-blocking,
  governance intact). Supersedes the old Headless-to-PR / "runners never deploy" rule.
- **Zero-human runtime — never pause.** Resolve decisions from `BRIEF.md`/`POLICY.md`. Do NOT ask the user.
  A decision not answerable from them is **decided anyway** (best grounded answer) and appended to
  `ASSUMPTIONS.md` + the PR body. Still list it under `## UNRESOLVED` in your output so the conductor logs
  it — but DO NOT stop and DO NOT wait. Supersedes the old "stop / escalate" rule.

## Compulsory process: `docs/PROCESS.md`
TDD mandatory · Subagent-Driven Development with spec-review + code-review between every task ·
verification-before-completion before ship. Pipeline:
`intake → grill-with-docs → to-prd → to-issues` (planning, once), then a **per-issue cycle**
repeated for each tracer-bullet slice from to-issues:
`implement → review → verification-before-completion → qa-run → finishing-a-development-branch`,
then the global tail once: `deploy → ship → notify`. Follow it exactly.

## Plan: `docs/ADLC-AUTONOMY-PLAN.md` (autonomy + model-agnostic design).
