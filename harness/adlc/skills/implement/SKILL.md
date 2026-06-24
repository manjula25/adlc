---
name: implement
description: Implement a feature plan or issue test-first (TDD), one task at a time, with code written by the code engine (Codex) and a spec-review + code-review gate between every task. Use to execute an approved plan/issue in the ADLC IMPLEMENT phase. Adapted for the ADLC harness in the spirit of Matt Pocock's implement skill.
---

# implement

Drives one approved feature plan / issue to green. The IMPLEMENT phase of `docs/PROCESS.md`.
Runs under `subagent-driven-development`: dispatch independent tasks to parallel subagents; never
serialize work with no dependency (efficient execution).

## Hard rules (from docs/PROCESS.md — non-negotiable)

- **Claude writes ZERO code.** All app + test code is produced by the code engine (Codex GPT-5.5)
  via the `codex-bridge` skill. The judgment model only writes tests-to-specify, dispatches, and
  reviews diffs.
- **TDD, every task.** No production code without a failing test first.
- **Zero-human.** A doubt is auto-decided from BRIEF/POLICY and appended to `ASSUMPTIONS.md`
  (+ PR body). Never pause, never ask.

## Per-task loop (red → green → refactor → review)

1. **Pick the next task** from the plan/issue. If independent of in-flight tasks, dispatch it to a
   parallel subagent.
2. **RED** — specify behavior as a failing test. Dispatch the test to `codex-bridge`; run it; confirm
   it fails for the right reason.
3. **GREEN** — dispatch the minimum implementation to `codex-bridge`; run the test; confirm green.
4. **REFACTOR** — clean up via `codex-bridge` while tests stay green.
5. **SPEC REVIEW** — run `spec-drift-check`: did the change drift from the PRD / issue / `design.md`?
6. **CODE REVIEW** — run `backend-code-review` on the diff.
7. **Resolve** review findings + any doubt: ground in BRIEF/POLICY → fix via `codex-bridge`; if not
   groundable, decide anyway + append to `ASSUMPTIONS.md`. Never block.
8. Mark the task done only when its test is green AND both reviews pass (or their findings are
   resolved/logged).

## Done

All tasks green, all between-task reviews cleared/logged. Hand off to `verification-before-completion`,
then `ship`. Do NOT deploy or merge here.
