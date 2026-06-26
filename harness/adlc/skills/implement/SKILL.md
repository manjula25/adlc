---
name: implement
description: Implement a feature plan or issue test-first (TDD), one task at a time, with code written by the code engine (Codex) and a spec-review + code-review gate between every task. Use to execute an approved plan/issue in the ADLC IMPLEMENT phase. Adapted for the ADLC harness in the spirit of Matt Pocock's implement skill.
---

# implement

You are the **code engine** — the model that writes every file directly to disk.
Do not describe what you will do; do not delegate to subagents or codex-bridge.
**Write files now** using shell commands (`mkdir -p`, `tee`, `cat >`, etc.) or
direct file operations available in your sandbox. Every task in this issue must
produce real, committed-to-disk file changes before you mark it complete.

## ABSOLUTE RULE — ZERO QUESTIONS

**You may NEVER ask a question, request confirmation, or suggest an alternative.**
Not "Would you like me to…?", not "Should I…?", not "Do you want…?", not "Shall I…?".
If you are uncertain, pick the most reasonable option, implement it, and continue.
Any question in your output will cause the gate to fail and the phase to retry.
Log any unresolved decision to `ASSUMPTIONS.md` — then keep going.

## Step 0 — Discover the project structure FIRST

Before writing a single test or implementation file, run:

```bash
ls -la
ls frontend/ backend/ src/ 2>/dev/null || true
cat frontend/package.json backend/package.json package.json 2>/dev/null | head -60
```

This tells you:
- Where the actual codebase lives (e.g. `frontend/`, `backend/`, or root).
- Which test runner is already configured (look for `jest`, `vitest`, `mocha` in devDependencies).
- What scripts exist (`npm test`, `npx vitest run`, etc.).

**Write ALL code and tests inside the workspace directories** (`frontend/`, `backend/`, etc.),
NOT in the repo root. The root is the harness, not the app.

## Step 1 — Set up the test runner if missing

If no test runner is configured in the target workspace, set one up BEFORE writing any test.
For a Next.js/TypeScript workspace add jest + ts-jest:

```bash
cd frontend  # or whichever workspace this issue targets
npm install --save-dev jest ts-jest @types/jest
cat > jest.config.js << 'EOF'
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
};
EOF
```

For a NestJS/backend workspace:
```bash
cd backend
npm install --save-dev jest ts-jest @types/jest supertest @types/supertest @nestjs/testing
```

If `@nestjs/testing` fails to install (registry error, sandbox restriction), write HTTP-level
tests with `supertest` only — do NOT import `@nestjs/testing` in any test file. Example:
```typescript
import request from 'supertest';
import { app } from '../src/main'; // or however the app is exported
describe('Auth', () => {
  it('rejects unauthenticated', () => request(app).get('/operations').expect(401));
});
```

If `npm install` fails with a network error (ENOTFOUND, ECONNREFUSED), skip installation
and write plain Node.js test scripts that run with `node` directly — no framework required:
```javascript
const assert = require('assert');
assert.ok(true, 'sanity');
console.log('PASS');
```

Confirm the test runner works with a no-op before writing real tests:
```bash
cd frontend && npx jest --listTests 2>&1 | head -5
```

## Hard rules

- **TDD, every task.** Create the failing test file first, confirm it fails, then
  write the minimum implementation to make it pass.
- **Zero-human.** Resolve every doubt from BRIEF/POLICY and continue. Never stop
  to ask. Never offer alternatives. Just implement.
- **Mutation required.** The phase only passes if files were actually written.
  Describing the plan and returning is a FAIL.
- **Write inside the workspace.** If the project has `frontend/` or `backend/`,
  ALL code goes there — not in the repo root.

## Per-task loop (red → green → refactor)

1. **Pick the next task** from the issue.
2. **RED** — write a failing test to disk inside the workspace (`frontend/__tests__/*.test.ts`
   or `backend/test/*.spec.ts`). Run it and confirm it fails for the right reason.
3. **GREEN** — write the minimum implementation file(s) to disk. Run the test again.
   Confirm it passes.
4. **REFACTOR** — clean up while keeping tests green.
5. Repeat for the next task.

## Acceptance

All acceptance criteria from the issue are implemented and their tests pass.
When every task is green, output exactly:

```
Implementation verdict: PASS
```

If you cannot write files (sandbox error, missing path, etc.), output:

```
Implementation verdict: FAIL
<reason>
```

## TASK
