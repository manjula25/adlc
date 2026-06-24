# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

The **ADLC Harness** is a reusable, copyable AI layer for greenfield React projects. It implements
the **PIV loop** (Plan → Implement → Validate) extended into a full Agentic Development Lifecycle so
**BAs and QA ship features and bug-fixes without writing code** — developers gate only on **code
review + merge**. Copy this `harness/` into a new project root (or use as `.claude/` + `.agents/`)
and run the lifecycle. This repo is the *AI layer itself*, not an application — it ships no app code.

---

## Tech Stack

| Technology | Purpose |
|------------|---------|
| Claude Code | Orchestration, planning, review — the judgment layer |
| Codex GPT-5.5 (`codex exec`) | **Writes all app & test code** via `codex-bridge` skill |
| Next.js + Vercel | Default target stack for projects built with this harness |
| Supabase (Postgres, Auth, RLS, Storage) | Default data/auth layer for built projects |
| Playwright + vitest | QA gate — deterministic regression, zero LLM tokens in CI |
| GitHub Actions + CODEOWNERS + branch protection | Mechanical role enforcement |

---

## Commands

The harness *is* a set of slash-commands. They are the lifecycle, not shell commands.

```bash
# Prime        load project context        /prime
# Plan (BA)    PRD → rules → feature plan   /create-prd  /create-rules  /plan-feature
# Implement    Codex writes code, opens PR  /execute  /implement-codex
# Validate(QA) Playwright/vitest suite      /qa-plan  /qa-run  /add-regression
# Review (Dev) gate + merge                 /code-review  /commit
# Deploy       post-merge, gated            /deploy  /rollback
# Bootstrap    new project from harness     /init-project
```

---

## Project Structure

```
harness/
├── .claude/
│   ├── commands/   # lifecycle slash-commands (prime, plan-feature, implement-codex, ...)
│   ├── skills/     # codex-bridge★, agent-browser, e2e-test, vercel-deploy★, supabase-migrations★
│   └── agents/     # ba-agent★, qa-agent★, reviewer★, deploy-agent★  (judgment only — none write code)
├── .agents/
│   ├── CLAUDE-template.md       # rules template → project CLAUDE.md via /create-rules
│   ├── roles/                   # role defs + permission-matrix.md
│   ├── plans/                   # per-feature PIV plans
│   └── reference/               # on-demand per-project context
├── .github/                     # CI (QA gate) + CODEOWNERS + branch protection
├── README.md                    # framework + AI layer map
├── ROLES.md                     # governance: who runs what, enforcement layers
└── MODEL-ROUTING.md             # per-stage model + cost rationale
```
★ = ADLC extension over the link-in-bio base.

---

## Architecture

**Event/lifecycle pipeline gated by role**, not a runtime architecture. Work flows one direction:

```
BA:   prime → create-prd → create-rules → plan-feature   → APPROVED PLAN (.agents/plans/)
Auto: implement-codex (Codex writes code on feat/ branch) → PR opened
QA:   qa-plan → qa-run (+ add-regression)                 → GREEN suite, gate PASS
Dev:  code-review → approve → MERGE                       → main
Dep:  /deploy (on main + CI green + merged)               → Vercel + Supabase
```

Nobody routes around the developer: merge to `main` is physically gated on a CODEOWNERS approval +
green CI. Spend expensive **judgment** tokens (Claude) on plan + review; spend cheap **throughput**
tokens (Codex) on bulk implementation.

---

## Code Patterns

### Naming Conventions
- Commands: kebab-case verbs in `.claude/commands/*.md` (`plan-feature`, `implement-codex`).
- ADLC extensions over the base are marked `★` in docs.

### File Organization
- AI layer lives in `.claude/` (commands/skills/agents); governance + plans in `.agents/`.
- "Commandify everything" — done twice → make it a command/skill.

### Error Handling
- Every bug fix also fixes the AI layer so the same class of bug can't recur (system-evolution rule).

---

## Testing

- **Run tests**: project's `test:run` + `test:e2e` (Playwright/vitest) — defined per built project, not here.
- **Test location**: built project's repo; this harness only defines the QA *commands*.
- **Pattern**: QA discovers journeys (`qa-agent`); **Codex writes the spec code**; CI runs it deterministically.

---

## Validation

```bash
# This repo ships no app code, so no lint/typecheck/test here.
# Validate the harness by running the lifecycle end-to-end on a target project:
/prime && /plan-feature <x> && /implement-codex && /qa-run && /code-review
```

---

## Key Files

| File | Purpose |
|------|---------|
| `README.md` | Framework, golden rules, AI layer map |
| `ROLES.md` | Role × command matrix; enforcement (branch protection, CODEOWNERS, CI) |
| `MODEL-ROUTING.md` | Per-stage model choice + cost rationale |
| `.agents/CLAUDE-template.md` | Template `/create-rules` fills into each project's CLAUDE.md |
| `.claude/skills/codex-bridge/` | Delegates implementation to Codex GPT-5.5 |

---

## On-Demand Context

| Topic | File |
|-------|------|
| Governance & roles | `ROLES.md` |
| Model/cost routing | `MODEL-ROUTING.md` |
| Permission matrix | `.agents/roles/permission-matrix.md` |
| Per-project reference | `.agents/reference/README.md` |

---

## Notes

- **HARD RULE: Claude writes NO code — app code or test code. Every line is produced by Codex GPT-5.5.**
  Claude only plans, dispatches, reviews diffs, writes corrective prompts. Fixes (even one-liners) go
  back through Codex. This is why there is no "coder" agent in `.claude/agents/` — coding is the
  `codex-bridge` skill, not a Claude subagent.
- The four golden rules: context is precious (reset between plan/implement); commandify everything;
  git log = long-term memory; system-evolution mindset.
- Design generation is expensive — batch it, capture once as `.dc.html`, never regenerate weekdays.
- **Autonomous (zero-human) mode overrides the human flow above.** When run headlessly, the lifecycle
  follows `docs/PROCESS.md` and `docs/ADLC-AUTONOMY-PLAN.md` §2/§8: doubts are auto-decided + logged to
  `ASSUMPTIONS.md` (never paused); ship = deploy the feature branch to a Vercel preview + email the URL
  (no in-loop merge — `main` merged offline). TDD is mandatory; spec-review + code-review run between
  every implementation task.
