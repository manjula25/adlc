# Active plan — ADLC design-link → deployed preview

Full plan: `docs/superpowers/specs/adlc-design-to-preview/implementation.md`
Design: `docs/superpowers/specs/adlc-design-to-preview/design.md`
Context: `CONTEXT.md` · `docs/adr/0001-shared-supabase-schema-per-project.md` · `docs/ADLC-AUTONOMY-PLAN.md` §2/§8
(Prior harness build history: `docs/ADLC-PLAN.md`.)

Branch: implement on `feat/adlc-design-to-preview` (NOT main).
Process (compulsory): `docs/PROCESS.md` — TDD mandatory · SDD + spec-review + code-review between tasks · verify before ship.
Approved: yes (user instructed "proceed with the phase" — 2026-06-22)

## Phase A — Doubt path → auto-decide + ASSUMPTIONS log ✓
- [x] A1 `src/assumptions.ts` append-only writer + `summarizeAssumptions` (+ test)
- [x] A2 `src/doubt-loop.ts` flip escalation→auto-decide+log; `escalated`→`assumptions` (+ update test)
- [x] A3 `src/po-agent.ts` best-effort answer + grounding on low confidence (+ test)
- [x] A4 `src/conductor.ts` drop `deny/interrupt` on low confidence → allow + log

## Phase B — Lifecycle state machine + per-phase runner pinning ✓
- [x] B1 `src/lifecycle.ts` ordered INTAKE→GRILL→PRD→PLAN→IMPLEMENT→QA→REVIEW→DEPLOY→EMAIL (+ test)
- [x] B2 `src/router.ts` add `runWithRunner(name)` pinned entry (+ test)
- [x] B3 per-phase gates + retry/budget caps; on cap → log assumption + continue

## Phase C — Intake ✓
- [x] C1 `src/intake.ts` claude.ai artifact URL / standalone HTML → normalized PRD input (+ test)
- [x] C2 `src/grill.ts` GRILL phase — grill-with-docs self-play → REQUIREMENTS.md + assumptions, bounded (+ test)

## Phase D — Provisioning (repo + Vercel per run; shared Supabase by schema) ✓
- [x] D1 `src/provision/repo.ts` `gh repo create --source --push` (idempotent)
- [x] D2 `src/provision/vercel.ts` link + branch preview deploy + inject env
- [x] D3 `src/provision/supabase.ts` `create schema proj_<id>` + migrations + RLS + `verifyRls`
- [x] D4 `src/provision/env.ts` org-token contract, fail-fast on missing var

## Phase E — Notify ✓
- [x] E1 `src/notify.ts` SendGrid send preview URL + ASSUMPTIONS summary (+ test)

## Phase F — Wire + proof ✓
- [x] F1 `src/proof-e2e.ts` full dry-run, cloud stubbed, zero prompts (+ all suites green)
- [~] F2 live proof: harness ready (`LIVE-PROOF.md` runbook · `proof:live` cloud smoke · CLI `--live`); awaiting real tokens to fire + tick

## Phase G — Trigger (later)
- [x] G1 `src/cli.ts` `conductor run --link <url|path>` → runProject (live-token fail-fast; +test)
- [x] G2 GitHub Action `adlc.yml`: DESIGN_LINK push / manual dispatch → `conductor run --live` (LLM-runner CI auth caveat documented)

## Verification
- `npm run proof:unit` green · `tsc --noEmit` clean
- no `interrupt:true` low-confidence path remains (A)
- lifecycle walks 8 phases, correct runner per phase (B)
- generated SQL applies RLS; `verifyRls` true; cross-schema denied (D3)
- F1 dry-run: all phases, zero prompts, ASSUMPTIONS log written

## Rollback
- New modules additive — delete `lifecycle/intake/notify/assumptions/provision/*`, revert `doubt-loop`/`conductor`/`po-agent` diffs.
- Orphan `proj_<id>` schema cleanup is MANUAL (`drop schema ... cascade`) — never auto-drop (ADR 0001 blast-radius).
