# ADLC Harness — Agentic Development Lifecycle

Reusable, copyable AI layer for greenfield React projects. Built on the **PIV loop**
(Plan → Implement → Validate) and extended into a full lifecycle so **BAs and QA ship
features and bug-fixes without developers writing code** — developers gate only on
**code review + merge**.

> Usage: copy this `harness/` into a new project root (or use as `.claude/` + `.agents/`).
> Then run the lifecycle below.

## Framework (the diagram: `AICodingWithLargeCodebases.png`)
Three pillars, mirrored from `link-in-bio-page-builder-main/`:
1. **Greenfield Project Planning** — PRD-first · modular rules architecture · prime · subagents.
2. **The PIV Loop** — plan → implement → validate, iterate until complete.
3. **The Four Golden Rules** (below).

ADLC adds 4 extensions (marked ★): Codex code engine, Playwright QA loop, deploy agent,
governance/roles. See `../docs/ADLC-PLAN.md` for the full mapping.

## Golden rules (always)
1. **Context is precious** — reset context between plan and implement; sub-agents for research.
2. **Commandify everything** — done twice → make it a command/skill.
3. **Git log = long-term memory** — standardized commits via `/commit`.
4. **System-evolution mindset** — every bug also fixes the AI layer so it can't recur.

## Lifecycle & who runs what

| Stage | Command(s) | Role | Model | Merges? |
|-------|-----------|------|-------|---------|
| Prime | `/prime` | any | Sonnet | – |
| Plan  | `/create-prd` `/create-rules` `/plan-feature` | **BA** | Opus (PRD/arch), Sonnet (routine) | no |
| Implement | `/execute` or `/implement-codex` | auto | **Codex GPT-5.5** | no (opens PR) |
| Validate | `/qa-plan` `/qa-run` `/add-regression` | **QA** | Sonnet + Playwright | no |
| Review | `/code-review` `/commit` | **Developer** | Opus/Sonnet | **yes** |
| Deploy | `/deploy` `/rollback` | gated (post-merge) | – | – |

Role definitions + permission matrix: `.agents/roles/`.
Model routing rationale: `MODEL-ROUTING.md`.

## AI layer map  (base = link-in-bio; ★ = ADLC extension)
```
.claude/commands/   prime create-prd create-rules plan-feature execute commit init-project   (base)
                    implement-codex★ qa-plan★ qa-run★ add-regression★ code-review★ deploy★ rollback★
.claude/skills/     agent-browser · e2e-test   (base)   |   codex-bridge★ vercel-deploy★ supabase-migrations★
.claude/agents/     ba-agent★ · qa-agent★ · reviewer★ · deploy-agent★
.agents/CLAUDE-template.md   rules template (→ project CLAUDE.md via /create-rules)
.agents/reference/  on-demand context — see reference/README.md (per-project; empty in template)
.agents/plans/      per-feature PIV plans   (PRD → PRD.md, per link-in-bio)
.agents/roles/★     role defs + permission matrix
MODEL-ROUTING.md★   per-phase model + cost   |   .github/★  CI + CODEOWNERS + branch-protection
```

## Stack default
Next.js on **Vercel** + **Supabase** (Postgres, Auth, RLS, Storage). React UI via
shadcn/Tailwind; design-to-code from captured `.dc.html`; QA via Playwright.

## Build status
See `../tasks/todo.md`. Phase 0 scaffold = done; Phases 1–5 in progress.
