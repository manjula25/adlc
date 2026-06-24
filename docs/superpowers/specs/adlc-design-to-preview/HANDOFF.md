# ADLC autonomy — session handoff (2026-06-22)

## What this work is
Revise the ADLC harness so: **one claude.ai design link → deployed Vercel preview URL emailed**,
fully automatic, **zero human in the runtime loop**. Design locked via grill-with-docs; full plan
written. Phase A was about to be implemented when paused.

## Locked decisions (all recorded in repo)
1. **Handoff line.** Claude Code = capture design link → PRD → per-module feature plans. Codex
   GPT-5.5 = implement → review → deploy preview → email. (review moved Claude→Codex; Claude writes
   NO app code.)
2. **Doubts never pause.** PO-agent auto-decides from BRIEF/POLICY; low-confidence → decide anyway +
   append to `ASSUMPTIONS.md` + PR body. "Escalation" redefined = log, not human-pause.
3. **Deploy-from-branch.** Deploy feature branch as Vercel preview, email URL. NO in-loop merge;
   `main` merged by a human offline (governance intact).
4. **Input** = claude.ai artifact share URL / exported standalone HTML (e.g. `SDIAS Operations Hub
   (standalone).html` in repo root).
5. **Provisioning (ADR 0001).** Per run: new GitHub repo + Vercel preview only. **Single SHARED
   Supabase project**; each project isolated by **schema-per-project + RLS** (`proj_<id>.*`). RLS is
   load-bearing security. Orphan schema cleanup is MANUAL (never auto-drop).
6. **Email** = Resend (one HTTPS call), recipient from config/BRIEF.
7. **Granularity** = one repo/project; modules = sequential feature-plans; one preview URL.
8. **Trigger** = CLI core now (`conductor run --link <url|path>`), GitHub Action wrapper later (on
   DESIGN_LINK push).
9. **Build-time vs runtime** (user's key concern): grill questions were build-time design
   (human=architect). Runtime loop asks NOBODY — infers project purpose from design link + optional
   BRIEF; ambiguity → auto-decided + logged.

## Compulsory process (`docs/PROCESS.md`)
Pipeline: `grill-with-docs → to-prd → to-issues → implement → verification-before-completion → ship
+ finishing-a-development-branch`.
Rules: **TDD mandatory** (failing test first, every edit) · **Subagent-Driven Development** with
`spec-drift-check` + `backend-code-review` **between every task** · verify before ship · ship =
deploy-from-branch.
`implement` + `ship` Matt Pocock skills created at `harness/adlc/skills/{implement,ship}/SKILL.md`
(symlinked into `.claude/skills`).

## Files written/edited this session
- `CONTEXT.md` — glossary (Escalation redefined, Zero-human, Deploy target, layers, provisioning).
- `docs/adr/0001-shared-supabase-schema-per-project.md` — shared-DB trade-off + blast-radius + upgrade path.
- `docs/PROCESS.md` — canonical compulsory pipeline.
- `docs/ADLC-AUTONOMY-PLAN.md` — §2 boundary revised, §8 requirement-change flow, §6/§7 deltas.
- `docs/superpowers/specs/adlc-design-to-preview/design.md` + `implementation.md` — full plan, phases A–G.
- `tasks/todo.md` — active checklist, **Approved: yes**.
- `harness/AGENTS.md` — fixed obsolete golden rules (deploy-from-branch + auto-decide+log) + PROCESS pointer.
- `harness/CLAUDE.md` — autonomous-mode override note.

## Implementation plan phases (detail in `implementation.md`)
- **A** doubt path → auto-decide + ASSUMPTIONS log (edits `doubt-loop.ts`, `po-agent.ts`,
  `conductor.ts`; new `assumptions.ts`)
- **B** `lifecycle.ts` 8-phase machine + per-phase runner pinning (`router.ts` add `runWithRunner`)
- **C** `intake.ts` design link → normalized input (C1) + `grill.ts` GRILL self-play → REQUIREMENTS.md (C2)
- **D** provisioning: `repo.ts`/`vercel.ts`/`supabase.ts`/`env.ts`
- **E** `notify.ts` SendGrid
- **F** dry-run proof → live proof
- **G** CLI now + GitHub Action wrapper later

## Level 1 vs Level 2 (mental model — LOCKED)
- **Level 1 = build the engine** (conductor in `harness/autonomous`, Phases A–G). Supervised dev:
  Claude writes it, human reviews. TDD + spec/code review between tasks apply to the ENGINE's code.
- **Level 2 = the engine running on a target project** (`conductor run --link <X>`). Fully autonomous,
  zero human. **No separate Level-2 codebase** — it IS Level 1 running. Finish Level 1 → Level 2 exists
  for every future project. Engine is generic; only the input (design link + optional BRIEF) varies.
- **Build-approach fork RESOLVED:** "Codex writes all code" is a **Level-2 runtime property** (the engine
  builds target apps via Codex). The engine itself (Level 1) is built **directly by Claude, supervised,
  TDD** — NOT routed through codex-bridge. So Phase A = built directly.

## GRILL phase (wired this session)
Lifecycle is now **9 phases**: `INTAKE→GRILL→PRD→PLAN→IMPLEMENT→QA→REVIEW→DEPLOY→EMAIL`. GRILL (new task
C2, `src/grill.ts`) = requirement-gathering as PO-agent self-play over intake output → `REQUIREMENTS.md`
+ assumptions, bounded by retry/budget cap, zero prompts. Closes the PROCESS.md↔lifecycle gap.

## Current state
- Branch: **`feat/adlc-design-to-preview`** (created, checked out). Nothing committed.
- `tasks/todo.md` Approved: yes.
- Env verified: **Codex CLI 0.130 present + logged in (ChatGPT auth)**; node v22, deps installed in
  `harness/autonomous`.
- Plan fully wired + consistent across all docs (GRILL included).
- **Phase A NOT yet implemented** — subagent dispatch interrupted twice. No code written yet.

## Next step
Implement **Phase A directly** (Claude, supervised) with TDD (failing test first):
`npm run proof:unit` (vitest) + `npm run typecheck` green; confirm no `interrupt:true` low-confidence
path in `conductor.ts` (`grep -n interrupt src/conductor.ts`). ESM TS — imports use `.js` suffix. Then
spec-drift-check + backend-code-review before Phase B.

A-tasks: A1 NEW `src/assumptions.ts` (`AssumptionEntry{phase,question,decision,confidence,grounding,at}`,
`appendAssumption`, `summarizeAssumptions`; pass `at` in, no Date.now in pure logic) + test ·
A3 `src/po-agent.ts` `poAnswerOne` always returns best-effort `answer`+`grounding` even when not confident ·
A2 `src/doubt-loop.ts` `escalated`→`assumptions`, low-confidence = decide-anyway + `appendAssumption(cwd)` +
inject (never block); add optional `now` param · A4 `src/conductor.ts` drop deny/interrupt on low confidence
→ allow + log.

**Fresh-session start:** `cd harness/autonomous`; read `implementation.md` Phase A; implement test-first directly.

## Key existing code (harness/autonomous/src)
- `runner.ts` — `Runner` iface (`runHeadless(prompt, {cwd, allowEdits}) → {text, ok, runner}`).
- `router.ts` — `buildRunner`, `runWithFallback` (priority fallback). Need to ADD `runWithRunner(name)`.
- `doubt-loop.ts` — `runSkillWithDoubts` (proactive prompt + UNRESOLVED parse + PO answer + inject).
  Currently returns `escalated: string[]` and BLOCKS — must flip to `assumptions: AssumptionEntry[]`.
- `po-agent.ts` — `poAnswerOne(q, brief) → {answer?, confident}`. Must always return best-effort
  `answer` + `grounding` even when `confident=false`.
- `conductor.ts` — Claude SDK `canUseTool`; currently `deny`+`interrupt` on low confidence — must
  stop blocking, allow + log assumption.
- `brief.ts`, `skills.ts`, `runners/{claude,codex,opencode}.ts`.
- `runners.config.json` — priority `[codex, opencode, claude]`, codex model `gpt-5.5`, skillsDir `adlc/skills`.
