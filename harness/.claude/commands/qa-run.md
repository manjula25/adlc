---
description: Author (via Codex) and run the QA suite — vitest + Playwright
argument-hint: [path-to-qa-plan]
---

# QA Run: write specs via Codex, then execute the gate

The VALIDATE stage. Claude orchestrates; **Codex writes any new test code**; the suites run
deterministically. This is the QA gate before developer review.

## Input
Read the QA plan: `$ARGUMENTS` (default: newest `*-qa.md` in `.agents/plans/`).

## Steps

### 1. One-time setup (if missing)
If the project has no Playwright/vitest config, dispatch Codex (via `codex-bridge`) to add it:
- `vitest` + config, `@playwright/test` + `playwright.config.ts`, `test:e2e` / `test:run`
  npm scripts, a `tests/e2e/` dir, and CI-friendly settings (headless, retries, traces on failure).
Claude does NOT write these files — Codex does.

### 2. Author specs (Codex only)
For each case in the QA plan with no existing spec, dispatch Codex to write it:
- vitest specs for unit/integration cases.
- Playwright specs for journey cases — deterministic selectors, seeded fixtures, explicit
  data assertions against Supabase. No LLM in the spec; pure Playwright.
Claude reviews each generated spec against the case definition (right assertion? flaky waits?
scoped to the case?). Issues → re-dispatch Codex. **Claude never edits spec code.**

### 3. Run the gate
```bash
npm run test:run     # vitest
npm run test:e2e     # playwright (regression + new) — zero LLM tokens
```
Include the full regression suite, not just new specs (catch breakage — PIV system-evolution).

### 4. On failure
- Test reveals a real bug → it's working as intended; route to `/add-regression` flow / fix
  via Codex, then re-run.
- Flaky/wrong test → re-dispatch Codex to fix the spec (never hand-edit).
- Continue only when green.

## Output Report
- Setup actions taken (if any).
- Specs authored (paths) + which QA-plan case each covers.
- Run results: vitest pass/fail, Playwright pass/fail, regression status.
- Gate verdict: **PASS** (ready for `/code-review`) or **FAIL** (blocking issues listed).
- Reminder: QA gate does not merge — developer review owns merge.
