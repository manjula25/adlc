# ADLC — Agentic Development Lifecycle Harness

Base = the framework in `AICodingWithLargeCodebases.png` + `transcribe.txt`, as already
implemented in `link-in-bio-page-builder-main/`. ADLC keeps that base **verbatim** and layers
four extensions so **BAs and QA ship features/bug-fixes with no manual coding**, devs gate only
on **code review + merge**, and **all code is written by Codex GPT-5.5** (Claude plans/reviews).

---

## 1. The canonical framework (the diagram) — DO NOT reinvent

Three pillars. The harness mirrors `link-in-bio` exactly.

### Pillar 1 — Greenfield Project Planning  (the AI layer)
| Diagram element | Implemented as | Status |
|---|---|---|
| PRD-first development | `/create-prd` → `PRD.md` | base (seeded) |
| Modular rules architecture | `/create-rules` → `CLAUDE.md` + `.agents/reference/*` (progressive disclosure) | base + `reference/README.md` added |
| The prime command | `/prime` (git log + structure + core files) | base |
| Subagents for context isolation | research subagents (Claude built-in) | base |

### Pillar 2 — Core Feature Development (The PIV Loop)
`prime → plan → implement → validate → commit`, iterate until complete.
| Diagram step | Implemented as | Status |
|---|---|---|
| Vibe-plan → clarify ambiguity → structured plan (context engineering: task / strategic / domain) | `/plan-feature` → `.agents/plans/<feature>.md` | base |
| Context reset, then execute | `/execute` (Claude) **→ extended to `/implement-codex` (Codex)** | base + **Ext-1** |
| Trust-but-verify: validation pyramid (unit/integration/e2e) + agent-browser + human review | `e2e-test` + `agent-browser` skills **→ extended to Playwright QA loop** | base + **Ext-2** |

### Pillar 3 — The Four Golden Rules (cross-cutting)
1. Context is King · 2. Commandify Everything · 3. Git Log = Memory · 4. System-Evolution Mindset.
Every command/skill obeys these (context reset between plan/implement; everything is a command;
`/commit` standardizes history; `/add-regression` evolves the AI layer on every bug).

## 2. The four extensions (what ADLC adds on top)

| # | Extension | Augments | Net-new? |
|---|-----------|----------|----------|
| **Ext-1** | **Codex code engine** — `codex-bridge` skill + `/implement-codex` | PIV "delegate all coding" → routed to **Codex GPT-5.5**; Claude writes zero code | replaces the agent in the existing Implement step |
| **Ext-2** | **Playwright QA loop** — `/qa-plan` `/qa-run` `/add-regression` + `qa-agent` | PIV validation pyramid; replaces QA-Tech SaaS with in-repo deterministic specs | formalizes existing Validate step |
| **Ext-3** | **Deployment agent** — `/deploy` `/rollback` + `vercel-deploy`/`supabase-migrations` skills | **past** the diagram (it ends at "Iterate Until Complete") | net-new |
| **Ext-4** | **Governance / roles** — `ROLES.md`, permission matrix, `/code-review` gate, CI/CODEOWNERS/branch-protection | enforces the org model (BA/QA build, dev merges) | net-new |

## 3. Harness layout (mirrors link-in-bio; ★ = extension)
```
harness/
  .claude/
    commands/  prime create-prd create-rules plan-feature execute commit init-project   # base
               implement-codex★ qa-plan★ qa-run★ add-regression★ code-review★ deploy★ rollback★
    skills/    agent-browser e2e-test          # base
               codex-bridge★ vercel-deploy★ supabase-migrations★
    agents/    qa-agent★ deploy-agent★ reviewer★
    CLAUDE-template.md → lives at .agents/ (where /create-rules references it)
  .agents/
    reference/ README.md (modular rules slot; components/api/styles/supabase .md per project)
    plans/     per-feature PIV plans  (PRD lives at PRD.md / .claude/PRD.md per link-in-bio)
    roles/★    role defs + permission matrix
  MODEL-ROUTING.md★  README.md  .github/★ (CI · CODEOWNERS · branch-protection)
```

## 4. Decisions (locked)
Harness-first → SDIAS pilot · hybrid (Claude plans/reviews, **Codex writes ALL code**) ·
QA = Playwright (no SaaS) · stack = Vercel + Supabase · design source = captured `.dc.html`.

## 5. Phases (build order = PIV lifecycle order)
- **Phase 0 — Scaffold** *(done)*: mirror link-in-bio AI layer into reusable `harness/`.
- **Phase 1 — Ext-1 Codex engine (IMPLEMENT)** *(done)*.
- **Phase 2 — Ext-2 Playwright QA (VALIDATE)** *(done)*.
- **Phase 3 — Ext-3 Deploy agent (DEPLOY)**.
- **Phase 4 — Ext-4 Governance / roles (REVIEW gate)**.
- **Phase 5 — PILOT: SDIAS Operations Hub** — run the full loop: functional reqs → `/create-prd`
  → `/create-rules` (+ populate `reference/`) → `/plan-feature` per phase → `/implement-codex`
  → `/qa-run` → `/code-review` → dev merge → `/deploy`. Every gap found evolves the harness.

## 6. Open dependencies
1. `design/sdias-ops-hub.dc.html` *(staged)* + `docs/sdias-functional-requirements.md` *(done)*.
2. Codex CLI *(present v0.130)* + `CODEX_MODEL` set to real GPT-5.5 id.
3. Supabase *(url+publishable key in `.env.local`)*; still need access token + DB password + Vercel token for deploy.
4. GitHub repo admin for branch protection / CODEOWNERS.
