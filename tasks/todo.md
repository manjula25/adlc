# ADLC Build — todo

Plan detail: `docs/ADLC-PLAN.md` (restructured: mapped to the diagram's 3 pillars +
PIV loop; base = link-in-bio, ★ = 4 ADLC extensions). Decisions locked: harness-first→
SDIAS pilot · hybrid (Claude plans/reviews, Codex writes ALL code) · QA=Playwright (no SaaS) ·
Vercel+Supabase · design = captured `.dc.html`. Build order = PIV lifecycle order.

Approved: yes (building; Codex-bridge-first; diagram-aligned restructure done; Phase 6 headless-autonomy added)

## Phase 0 — Scaffold reusable harness
- [x] Lift AI layer into reusable `harness/` template (commands + skills seeded)
- [x] harness/README.md (lifecycle + role map)
- [x] link-in-bio kept as worked reference example
- [x] design HTML staged → `design/sdias-ops-hub.dc.html`; functional reqs done (`docs/sdias-functional-requirements.md`)

## Phase 1 — Codex code engine (IMPLEMENT) ✅
- [x] `codex-bridge` skill (real `codex exec -m -s workspace-write -C` flags verified)
- [x] `implement-codex` command (plan → branch → Codex writes → Claude reviews diff → no merge)
- [x] `MODEL-ROUTING.md` (per-phase model + cost levers)

## Phase 2 — QA agent loop (Playwright, VALIDATE) ✅
- [x] `qa-plan` command (feature plan → test plan, markdown)
- [x] `qa-run` command (Codex authors specs → vitest + Playwright regression, zero tokens)
- [x] `add-regression` command (bug → failing spec via Codex → fix → AI-layer evolve)
- [x] `qa-agent` subagent (agent-browser discovers cases; writes NO code)
- note: Playwright/vitest config authored by Codex at /qa-run setup (rule: Claude writes no code)

## Phase 3 — Deployment agent (Ext-3, DEPLOY) ✅
- [x] `vercel-deploy` skill (deploy + immutable promote/rollback)
- [x] `supabase-migrations` skill (migrate-before-deploy ordering, forward-only caveat, RLS check)
- [x] `deploy` command (gate → migrate → deploy → @smoke → auto-rollback)
- [x] `rollback` command (vercel promote + Codex compensating migration + evolve)
- [x] `deploy-agent` subagent (isolated context, gated)

## Phase 4 — Governance / role boundary (Ext-4, REVIEW gate) ✅
- [x] `ROLES.md` (4 roles, lifecycle-by-role, 5 enforcement layers)
- [x] `.agents/roles/permission-matrix.md` (command × role)
- [x] `code-review` command (6-dimension dev gate; Codex fixes, dev merges)
- [x] `reviewer` subagent (deep review, isolated context)
- [x] `.github/workflows/ci.yml` (lint+typecheck+vitest+playwright = required checks)
- [x] `.github/CODEOWNERS` (review routed to devs = merge gate)
- note: branch-protection settings documented in ROLES.md (admin sets once)

## Phase 5 — PILOT: SDIAS Operations Hub
- [ ] functional reqs → create-prd → create-rules → phase plans
- [ ] Codex implements phases → QA gate → dev review → deploy
- [ ] Feed every gap back into harness (system-evolution)

## Phase 6 — Headless autonomy (no-human conductor)
Goal: run lifecycle skills with ZERO terminal prompts. Crux solved (docs.claude.com, 2026-06-17):
`AskUserQuestion` can only be auto-answered via Agent SDK **`canUseTool`** callback (NOT hooks —
hooks return allow/deny/ask/defer + updatedInput, no synthetic result). `defer` = escalation hatch.
SDK = TypeScript (`@anthropic-ai/claude-agent-sdk`), matches Next.js/Vercel/Codex-Node stack.

**LOCKED — autonomy boundary = Headless-to-PR.** Bot owns plan→code→QA→review→ready PR.
Human keeps final merge-to-main + prod-deploy click. Phase 4 governance (CODEOWNERS, branch
protection) stays 100% intact — NO structural rework. Audit confirmed: 15 assets zero-change,
~7 mechanical CLI-auth fixes (deferred to A); the only structural conflict (human-only merge)
is sidestepped by this boundary. Conductor stops at PR; never merges/deploys.

### Step B — prove canUseTool answers one skill headless (DOING FIRST)
- [ ] `harness/autonomous/` scaffold: `package.json` (+ `@anthropic-ai/claude-agent-sdk`), `tsconfig.json`, `src/conductor.ts` entry
- [ ] `src/brief.ts` — hardcoded BRIEF fixture (the Oracle source) for the proof run
- [ ] `src/po-agent.ts` — stub: takes `{questions, options}` + BRIEF → `{ selections, confident }` (rule-based first; LLM later)
- [ ] `src/conductor.ts` — `query()` with `permissionMode: "bypassPermissions"` + `canUseTool`:
      AskUserQuestion → po-agent → return selections; `confident:false` → return `defer`; other tools → allow
- [ ] run ONE interactive skill (brainstorming) end-to-end against BRIEF
- [ ] PROOF GATE: completes with zero terminal prompts → B done. Capture transcript as evidence.

### Step A — scale to Decision Oracle (AFTER B; Headless-to-PR boundary)
- [ ] BRIEF.md + POLICY.md schema (committed to target repo before agent starts)
- [ ] po-agent → real PO subagent over BRIEF+POLICY with confidence threshold
- [ ] `defer` → escalation queue (Slack/Linear) + resume-from-persisted-session
- [ ] auto plan-gate: validator stamps `Approved: yes` when plan matches BRIEF (replaces human)
- [ ] mechanical CLI-auth fixes: CODEX_TOKEN preflight, `vercel --token`, `supabase --no-interactive`
- [ ] FIX harness defect (found Phase 6 B): codex-bridge/MODEL-ROUTING default `gpt-5.5-codex` rejected by ChatGPT-account auth ("model not supported"). Use `gpt-5.5` (or detect auth_mode). Add codex model preflight.
- [ ] orchestrator state machine: INTAKE→SPEC→PLAN→SCAFFOLD→IMPLEMENT→QA→REVIEW→**PR** (STOP — human merges/deploys)
- [ ] wire to SDIAS pilot (Phase 5)

## Phase 7 — Model-agnostic runners + token fallback
Goal: run the SAME lifecycle with any capable model/CLI, not just Claude. On Claude token
exhaustion, fall back to another runner with the same plan. Decision: lifecycle stays
runner-neutral (plans/BRIEF/POLICY/rules/skills = plain markdown — already true); only the
DRIVER is swappable.
- [ ] `Runner` interface: `runHeadless(prompt, {autoAnswer, allowEdits, cwd}) → result`. Build the
      Phase 6 conductor against THIS (Claude = first impl) — not hardwired to Claude SDK.
- [ ] adapters: Claude (Agent SDK + canUseTool), Codex (`codex exec --approval never -s workspace-write`),
      opencode (model-agnostic: Anthropic/OpenAI/OpenRouter→Kimi K2/local)
- [ ] `runners.config` (yaml/json): runner priority, auth-env per runner, per-runner token budget
- [ ] router + fallback: try Claude → on 429/quota → same plan to opencode/Codex (no replan)
- [ ] PO-agent/BRIEF/POLICY kept runner-neutral (data + decision fn; every adapter calls them)
- [ ] enforce per-project `git init` in `init-project` (this session: ADLC was nested in parent repo)
- [ ] caveat to handle: non-asking runners (Codex) need richer BRIEF upfront (fewer mid-run questions)

## Review
- Phase 0: scaffold done. Reordered to Codex-bridge-first per user.
- Phase 6 added: headless autonomy. Crux (AskUserQuestion→SDK canUseTool, defer=escalation) verified vs official docs; see memory project_adlc_autonomy_mechanism.
