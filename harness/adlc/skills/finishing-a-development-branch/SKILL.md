---
name: finishing-a-development-branch
description: Finish a feature branch — verify tests, verify spec alignment, generate a changelog, then open a PR for a human to merge. Adapted for the ADLC harness from the superpowers finishing-a-development-branch skill. Called by ship; never merges to main in the loop.
---

# finishing-a-development-branch

Called by `ship` (and conceptually by `implement` when all tasks are green). Completes a feature
branch deterministically. **ADLC deviation from upstream:** the autonomous loop never prompts a
human and never merges to `main` — the orchestrator handles `git push` + `gh pr create` AFTER the
lifecycle passes (deploy-from-branch governance, ADLC-AUTONOMY-PLAN §2). This skill does NOT push
or open a PR — it only verifies the branch is ready for the orchestrator to ship.

## Process
### 1. Verify tests
Run the project's full test suite. If any fail, STOP — do not finish the branch.
Defer to `verification-before-completion` for the evidence discipline.
Use whatever test runner is already installed (jest, vitest, or plain node). If the runner is
missing and `npm install` fails (no network), run any plain `node` test scripts directly.

### 2. Verify spec alignment
Run `spec-drift-check` against the PRD/issue: requirements coverage, scope creep, constraint
violations. Drift that is groundable in BRIEF/POLICY is resolved + logged; ungroundable drift is
decided + logged to `ASSUMPTIONS.md`. Never pause.

### 3. Generate changelog
Use `writing-changelog` to record what was implemented. Save under
`docs/superpowers/specs/<branch>/<date>-changelog.md`.

### 4. Commit changes (best-effort)
Commit any uncommitted work so the orchestrator's `git push` has a clean tree:
```bash
git add -A && git commit -m "feat: complete issue implementation"
```
If `git add` or `git commit` fails (index.lock permission, git unavailable), note the error in
the output and continue — the orchestrator will handle the push. Do NOT block on git failures.
Do NOT push, do NOT open a PR, do NOT merge — those are the orchestrator's job.

## ABSOLUTE RULE — ZERO QUESTIONS

**You may NEVER ask a question, request confirmation, or suggest a next step.**
Not "Ready to proceed?", not "Should I…?", not "Do you want…?", not "Next: …".
**Any question or prompt for input in your output will cause the gate to FAIL and the phase to retry.**
Do not describe what you will do — DO it. Run the tests, check the spec, write the changelog,
commit the work. Then output the verdict. Nothing else after the verdict line.

## Hard rules
- **Never** proceed with failing tests.
- **Never** merge to `main` or force-push inside the loop.
- **Never** discard work.
- Branch protection + CODEOWNERS stay intact.
- **Do not describe plans.** Execute every step, then report results with evidence.

## Verdict (machine-readable — the conductor's gate reads this)
End your response with exactly one of these lines as the very last line:
```
Finish verdict: PASS
```
or
```
Finish verdict: FAIL — <what failed, with evidence>
```
A FAIL withholds deploy; the conductor logs it to `ASSUMPTIONS.md` and never pauses.
**The verdict line is mandatory. A missing verdict is a FAIL.**

## TASK
