---
description: Author (via Codex) and run the QA suite — use whatever test runner is installed
argument-hint: [path-to-qa-plan]
---

# QA Run: write specs via Codex, then execute the gate

The VALIDATE stage. Claude orchestrates; **Codex writes any new test code**; the suites run
deterministically. This is the QA gate before developer review.

## Input
Read the QA plan: `$ARGUMENTS` (default: newest `*-qa.md` in `.agents/plans/`).

**If no QA plan file exists, do NOT block.** Derive test cases directly from the issue's
acceptance criteria in the TASK section below. Each acceptance criterion becomes one test
case. This keeps the QA gate functional even when no prior `qa-plan` phase ran.

## Steps

### 1. Discover the test runner already configured
Run this FIRST to find what's available:
```bash
cat frontend/package.json backend/package.json package.json 2>/dev/null | grep -E '"(jest|vitest|playwright|mocha|ava)"'
ls frontend/vitest.config.* frontend/jest.config.* frontend/playwright.config.* 2>/dev/null
npx jest --listTests 2>&1 | head -5 || npx vitest list 2>&1 | head -5 || true
```

Use whatever test runner is ALREADY installed. Do NOT require vitest or Playwright
specifically. The implement phase already installed jest/ts-jest — use that if present.

If vitest AND playwright are both installed, prefer them. If only jest is installed,
use jest for all tests (unit + integration). If nothing is installed and `npm install`
fails (no network), write plain Node.js test scripts that run with `node` directly:
```javascript
// test/auth.test.js — no test framework required
const assert = require('assert');
assert.ok(true, 'sanity');
console.log('PASS');
```

### 2. One-time setup (if missing AND network available)
If no test runner is configured, try to install one. If `npm install` fails with a network
error (ENOTFOUND, ECONNREFUSED), skip installation and use plain Node.js test scripts
instead. Do NOT block on missing dependencies.

### 3. Author specs (Codex only)
For each acceptance criterion or QA-plan case with no existing spec, write a test:
- Use the test runner discovered in step 1 (jest, vitest, or plain node).
- For e2e/journey tests: if Playwright is installed, use it. If not, write HTTP-level
  integration tests with `supertest` or plain `fetch()` calls instead. Do NOT require
  a running dev server — test against the app module directly.
- No LLM in the spec; pure deterministic assertions.

### 4. Run the gate
Use whichever command matches the installed runner:
```bash
npx jest --passWithNoTests     # if jest is installed
# OR
npx vitest run --passWithNoTests  # if vitest is installed
# OR
node test/*.test.js             # if no framework installed
```
Include the full regression suite, not just new specs (catch breakage — PIV system-evolution).

### 5. On failure
- Test reveals a real bug → it's working as intended; fix via Codex, then re-run.
- Flaky/wrong test → re-dispatch Codex to fix the spec (never hand-edit).
- Continue only when green.

## ABSOLUTE RULE — ZERO QUESTIONS

**You may NEVER ask a question, request confirmation, or suggest a next step.**
Not "Ready to proceed?", not "Should I…?", not "Do you want…?", not "Next: …".
**Any question or prompt for input in your output will cause the gate to FAIL and the phase to retry.**
Do not describe what you will do — DO it. Discover the runner, write specs, run tests, report results.
Then output the verdict. Nothing else after the verdict line.

## Output Report
- Setup actions taken (if any).
- Specs authored (paths) + which acceptance criterion each covers.
- Run results: test runner used, pass/fail counts, regression status.

## Verdict (machine-readable — the conductor's gate reads this)
End your response with exactly one of these lines as the very last line:
```
Gate verdict: PASS
```
or
```
Gate verdict: FAIL — <what failed, with evidence>
```
A FAIL withholds deploy; the conductor logs it to `ASSUMPTIONS.md` and never pauses.
**The verdict line is mandatory. A missing verdict is a FAIL.**

## TASK
