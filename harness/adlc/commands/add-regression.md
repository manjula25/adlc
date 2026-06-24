---
description: Bug → failing Playwright/vitest spec → fix via Codex → permanent guard
argument-hint: [bug description or issue link]
---

# Add Regression: lock a bug out forever

System-evolution rule made concrete. Every bug becomes a deterministic test that fails first,
then passes after the fix — so it can never silently return. **All code (spec + fix) by Codex.**

## Input
Bug: `$ARGUMENTS` (description, repro steps, or issue link). If vague, reproduce first
(use `qa-agent` / agent-browser to confirm the actual broken behavior).

## Steps

### 1. Pin the bug
Nail the exact failing behavior: route, role, input, expected vs actual, and the data effect.

### 2. Write the failing test (Codex)
Dispatch Codex via `codex-bridge` to add the smallest spec that reproduces the bug:
- user-facing → Playwright; pure logic/DB → vitest.
Run it. **It MUST fail** for the right reason. If it passes, the repro is wrong — refine and
re-dispatch. Claude reviews the spec; never writes it.

### 3. Fix (Codex)
Dispatch Codex to fix the root cause (not the symptom). Re-run: the new spec must pass AND the
full existing suite must stay green.

### 4. Evolve the AI layer (the real point)
Ask: why did this slip through? Update the harness so the *class* of bug can't recur —
e.g. add a rule to `CLAUDE.md`, a note to `.agents/reference/*`, or a missing case to a QA plan.
Make this change yourself (markdown only).

## Output Report
- The bug, restated precisely.
- New spec path + proof it failed before / passes after.
- Fix summary (files via Codex) + full-suite green confirmation.
- AI-layer change made so it can't recur.
- Not merged — routes to `/code-review`.
