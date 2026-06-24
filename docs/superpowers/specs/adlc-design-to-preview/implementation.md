# ADLC design-link → deployed preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn one claude.ai design link into a deployed Vercel preview URL emailed to the requester, fully automatic, with zero human in the runtime loop.

**Spec:** `design.md`

**Architecture:** A runner-neutral conductor drives an ordered lifecycle state machine (INTAKE→PRD→PLAN→IMPLEMENT→QA→REVIEW→DEPLOY→EMAIL). Each phase is pinned to a runner — Claude Code for the planning layer (INTAKE/PRD/PLAN), Codex GPT-5.5 for the execution layer (IMPLEMENT/QA/REVIEW/DEPLOY). Doubts are resolved by the PO-agent; unresolvable ones are decided anyway and appended to an append-only ASSUMPTIONS log instead of pausing. Provisioning creates a GitHub repo + Vercel preview per run against one shared Supabase project isolated by schema+RLS.

**Tech Stack:** TypeScript (existing `harness/autonomous`), Claude Agent SDK, `codex exec`, `gh` CLI, Vercel CLI/API, Supabase CLI + Management API, SendGrid HTTPS API, vitest.

**Branch:** create `feat/adlc-design-to-preview`; do not implement on `main`.

**Compulsory process:** every task obeys `docs/PROCESS.md` — TDD mandatory (failing test first), run under `subagent-driven-development`, and run `spec-drift-check` + `backend-code-review` between tasks. `verification-before-completion` gates ship.

---

## Build order rationale

A (doubt path) first — it changes the contract every later phase depends on (no blocking). Then B (lifecycle skeleton) to have an end-to-end spine. Then C/D/E (intake, provisioning, email) as the spine's concrete steps. F wires the live proof last.

---

## Phase A — Doubt path: auto-decide + ASSUMPTIONS log

Removes the only runtime human touchpoint. Cites: `CONTEXT.md` **Escalation** (redefined), **ASSUMPTIONS log**, **Zero-human**; `ADLC-AUTONOMY-PLAN.md` §2 + §8.

- [ ] **A1. `src/assumptions.ts` — append-only log writer.**
  - Export `appendAssumption(repoDir, entry)` writing to `<repoDir>/ASSUMPTIONS.md` (create with header if absent).
  - Entry: `{ phase, question, decision, confidence: number, grounding: string }`. Append as a dated row/section. No `Date.now()` in pure logic — pass timestamp in.
  - Export `summarizeAssumptions(repoDir): string` for the email body + PR body.
  - **Acceptance:** appending N entries yields N rows; file is valid markdown; summary lists all.
  - **Test:** `src/assumptions.test.ts` — append 2, assert file content + summary. `npm run proof:unit`.

- [ ] **A2. `src/doubt-loop.ts` — flip escalation to auto-decide+log.**
  - Replace the `escalated: string[]` blocking return with: when `poAnswer` is NOT confident, still take its best answer (extend `po-agent` to return a best-effort answer + confidence), record an assumption via A1, and inject it like a confident answer.
  - `DoubtRunResult.escalated` → `assumptions: AssumptionEntry[]` (the loop never returns a blocked state).
  - Keep the proactive-prompt + UNRESOLVED parse mechanism unchanged (`buildProactivePrompt`, `parseUnresolved`).
  - **Acceptance:** a residual the PO can't ground produces one ASSUMPTIONS entry AND a second injected run — never an early "escalated" return.
  - **Test:** update `src/doubt-loop.test.ts` — low-confidence residual ⇒ assumption logged, `ok` still true. `npm run proof:unit`.

- [ ] **A3. `src/po-agent.ts` — best-effort answer on low confidence.**
  - `poAnswerOne(q, brief)` already returns `{answer?, confident}`. Add: always return a best `answer` (most-grounded guess) even when `confident=false`, plus a `grounding` string (which BRIEF/POLICY clause it leaned on, or "no grounding — default").
  - **Acceptance:** never returns `answer: undefined`; `confident=false` still carries a usable answer + grounding.
  - **Test:** extend `src/po-agent.test.ts`. `npm run proof:unit`.

- [ ] **A4. `src/conductor.ts` — stop denying on low confidence.**
  - In `canUseTool` for `AskUserQuestion`: low confidence no longer `behavior:"deny"`+`interrupt`. Instead allow with the PO best answer and append an assumption (A1). Drop `promptedHuman`/`deferred` blocking semantics; keep counters for reporting.
  - **Acceptance:** no code path returns `interrupt:true` for a normal low-confidence doubt.
  - **Test:** existing conductor proof still constructs; add a unit asserting allow-path on low confidence (mock `answerQuestions`).

---

## Phase B — Lifecycle state machine + per-phase runner pinning

Cites: `CONTEXT.md` **Conductor**, **Planning/Execution layers**, **Deploy target**; §8 lifecycle.

- [ ] **B1. `src/lifecycle.ts` — ordered phase machine.**
  - `type Phase = "INTAKE"|"GRILL"|"PRD"|"PLAN"|"IMPLEMENT"|"QA"|"REVIEW"|"DEPLOY"|"EMAIL"`.
  - `PHASES: { name: Phase; runner: "claude"|"codex"; skill: string; gate?: (r)=>boolean }[]`.
  - Planning layer (INTAKE/GRILL/PRD/PLAN) → `claude`; execution layer (IMPLEMENT/QA/REVIEW/DEPLOY) → `codex`. (Locked harness rule: Claude writes no app code.)
  - GRILL = requirement-gathering self-play (C2): runs `grill-with-docs` as PO-agent self-play over the intake output, bounded by the retry/budget cap, emitting `REQUIREMENTS.md` + assumptions BEFORE PRD. Closes the PROCESS.md↔lifecycle gap (PROCESS pipeline starts with grill-with-docs).
  - `runLifecycle(ctx)` iterates phases, calls the phase's runner via B2, runs the gate, on gate-fail retries up to budget cap then records an assumption and proceeds (never blocks — §8).
  - **Acceptance:** dry-run with stubbed runners walks all 9 phases in order with the right runner per phase.
  - **Test:** `src/lifecycle.test.ts` with fake runners asserting order + runner mapping. `npm run proof:unit`.

- [ ] **B2. `src/router.ts` — add `runWithRunner(name)` (pinned, not just fallback).**
  - Add a pinned-runner entry point alongside `runWithFallback`; lifecycle pins per phase, fallback still available on quota/429.
  - **Acceptance:** PRD phase runs on Claude even when Codex is higher priority in `runners.config.json`.
  - **Test:** extend `src/router.test.ts`.

- [ ] **B3. Per-phase gates + retry/budget caps in `lifecycle.ts`.**
  - QA gate = QA skill verdict pass; REVIEW gate = review skill verdict pass + RLS check (Phase D3 hook). Cap retries; on cap, log assumption + continue.
  - **Acceptance:** a failing gate retries to the cap then proceeds with a logged assumption.
  - **Test:** `lifecycle.test.ts` — forced gate failure path.

---

## Phase C — Design intake

Cites: `CONTEXT.md` **Design link**; §8 input.

- [ ] **C1. `src/intake.ts` — normalize the design link to PRD input.**
  - Accept a claude.ai artifact share URL OR a local standalone HTML path. Fetch/read, strip to meaningful copy + structure, return normalized design text for the PRD skill prompt.
  - For URL fetch use the conductor host (not a runner); offline mode reads a local HTML (e.g. the SDIAS standalone HTML).
  - **Acceptance:** given the local SDIAS standalone HTML, returns non-empty normalized text with section/feature hints.
  - **Test:** `src/intake.test.ts` against a small fixture HTML. `npm run proof:unit`.

- [ ] **C2. `src/grill.ts` — requirement-gathering self-play (the GRILL phase).**
  - Run `grill-with-docs` as PO-agent self-play over the C1 intake output + BRIEF/POLICY: surface ambiguities, auto-decide each from BRIEF (decide-anyway + log on low confidence — Phase A), emit `REQUIREMENTS.md` (the gathered requirements the PRD builds on). Never pauses, never asks.
  - Bound the self-play by the retry/budget cap (B3) so it can't loop forever; each unresolved ambiguity → one ASSUMPTIONS entry.
  - This is the engine's requirement-gathering step — the runtime analogue of the human grill that designed the engine. Output feeds PRD (`to-prd`).
  - **Acceptance:** given intake text with a deliberate ambiguity, produces `REQUIREMENTS.md` + ≥1 ASSUMPTIONS entry, zero prompts, terminates within the cap.
  - **Test:** `src/grill.test.ts` with a stub runner returning an UNRESOLVED item; assert REQUIREMENTS.md written, assumption logged, bounded iterations.

---

## Phase D — Provisioning (per run: repo + Vercel; shared Supabase by schema)

Cites: ADR 0001; `CONTEXT.md` **Project provisioning**, **Deploy target**.

- [ ] **D1. `src/provision/repo.ts` — GitHub repo.**
  - `gh repo create <org>/<name> --private --source <repoDir> --remote origin --push` (repo already holds Claude's pushed AI layer + PRD + plans). Idempotent: skip if exists.
  - **Acceptance:** dry-run prints the exact `gh` invocation; live mode creates + pushes.
  - **Test:** unit asserts command construction (no network); live behind `ADLC_LIVE=1`.

- [ ] **D2. `src/provision/vercel.ts` — link + preview deploy.**
  - Link the repo to a Vercel project (API or `vercel link`), deploy the feature branch, capture the preview URL. Inject per-project env (Supabase URL, shared anon key, project schema name) as Vercel env vars.
  - **Acceptance:** returns a preview URL string; env vars set on the project.
  - **Test:** unit mocks the Vercel client; assert URL parse + env payload.

- [ ] **D3. `src/provision/supabase.ts` — schema bootstrap + RLS into the shared project.**
  - Connect to the shared Supabase project (`SUPABASE_ACCESS_TOKEN` / DB conn). `create schema if not exists proj_<id>`; run the project's migrations into that schema only; apply RLS policies keyed to the project; expose only that schema. **RLS is load-bearing security (ADR 0001) — verify, don't assume.**
  - Provide `verifyRls(schema): boolean` consumed by the REVIEW gate (B3).
  - **Acceptance:** after bootstrap, `verifyRls` is true for the new schema; cross-schema select with the shared anon key is denied.
  - **Test:** unit asserts generated SQL (schema + RLS); live integration behind `ADLC_LIVE=1`.

- [ ] **D4. Token/env contract — `src/provision/env.ts` + doc.**
  - Single source for required org tokens (`GH_TOKEN`, `VERCEL_TOKEN`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_URL`, `SENDGRID_API_KEY`) read from conductor env; fail fast with a clear message naming the missing var (no human mid-run — §8 risk: provisioning is critical-path).
  - **Acceptance:** missing var ⇒ single clear error before any cloud call.
  - **Test:** `src/provision/env.test.ts`.

---

## Phase E — Notify

Cites: `CONTEXT.md` **Deploy target**; §8 email.

- [ ] **E1. `src/notify.ts` — SendGrid send-URL.**
  - One HTTPS POST to SendGrid `mail/send`; recipient from project config / BRIEF; body = preview URL + ASSUMPTIONS summary (A1 `summarizeAssumptions`).
  - **Acceptance:** builds a valid SendGrid payload; missing recipient ⇒ logged assumption + skip (never block).
  - **Test:** `src/notify.test.ts` mocks fetch; assert payload.

---

## Phase F — Wire end-to-end + live proof

- [ ] **F1. `src/proof-e2e.ts` — full dry-run.**
  - Local SDIAS standalone HTML → INTAKE→PRD→PLAN (Claude) → IMPLEMENT→QA→REVIEW→DEPLOY→EMAIL (Codex), cloud calls stubbed. Prints the phase trace, the would-be preview URL, and the ASSUMPTIONS log.
  - **Acceptance:** dry-run completes all phases, zero prompts, ASSUMPTIONS log present.
  - **Test:** `npm run proof:unit` green for all new suites; `tsc --noEmit` clean.

- [ ] **F2. Live proof (behind `ADLC_LIVE=1`, tokens present).**
  - One real run end-to-end → real preview URL emailed. Compare a Claude-planned run vs the dry-run trace.
  - **Acceptance:** an email lands with a reachable preview URL; ASSUMPTIONS log attached.

---

## Phase G — Trigger (later)

- [ ] **G1. `src/cli.ts` — conductor CLI.** `conductor run --link <url|path>` → `runLifecycle`. Phase C
  intake already consumes the link; this is the operator entry point. (Build now alongside F.)
- [ ] **G2. GitHub Action wrapper (deferred).** On push of a `DESIGN_LINK` file (or issue event) in the
  seed repo, call `src/cli.ts` with the link. Thin wrapper over G1 — no core logic. Add when the
  drop-in-repo trigger is wanted.

## Verification checkpoints

- After A: `npm run proof:unit` green; no `interrupt:true` low-confidence path remains.
- After B: dry lifecycle walks 8 phases, correct runner per phase.
- After D: generated SQL applies RLS; `verifyRls` true; cross-schema denied.
- After F1: full dry-run, zero prompts, ASSUMPTIONS log written.
- Final: `tsc --noEmit` clean; all vitest suites green.

## Rollback notes

- All new modules are additive; revert by deleting `src/lifecycle.ts`, `src/intake.ts`, `src/notify.ts`, `src/assumptions.ts`, `src/provision/*` and reverting the `doubt-loop.ts`/`conductor.ts`/`po-agent.ts` diffs.
- No schema is dropped automatically — shared Supabase: a bad run leaves an orphan `proj_<id>` schema; cleanup is a manual `drop schema proj_<id> cascade` (document, don't auto-drop — blast-radius, ADR 0001).
