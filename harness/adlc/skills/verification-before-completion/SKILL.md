---
name: verification-before-completion
description: Prove the build behaves before any completion claim — evidence before assertions, always. Adapted for the ADLC harness from the superpowers verification-before-completion skill. Runs as the VERIFY gate before review/ship.
---

# verification-before-completion

The VERIFY phase of `docs/PROCESS.md`, between `implement`/`qa-run` and `review`/`ship`.

## Core principle
Claiming work is complete without verification is dishonesty, not efficiency.
**Evidence before claims, always.**

## The Iron Law
```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```
If you have not run the verification command in this run, you cannot claim it passes.

## The gate function
Before asserting any status:
1. **IDENTIFY** — which command proves the claim?
2. **RUN** — execute the FULL command, fresh and complete (via `codex-bridge`).
3. **READ** — the full output: exit code, failure count.
4. **VERIFY** — does the output confirm the claim? If not, state the actual status with evidence.
5. **ONLY THEN** — make the claim.

Skipping any step is lying, not verifying.

## What to verify (each needs fresh evidence)
- **Tests pass** — test command output shows 0 failures (not "should pass").
- **Build succeeds** — build command exits 0 (a passing linter is not a passing build).
- **Bug fixed** — the original symptom's test now passes.
- **Regression tests** — red→green verified (revert fix → test MUST fail → restore → pass).
- **Requirements met** — line-by-line checklist against the PRD/issue, not "tests pass".
- **Agent work** — verify the VCS diff independently; never trust a runner's "success" report.

## Red flags — STOP
"should", "probably", "seems to"; expressing satisfaction before verification; about to
deploy/PR without evidence; trusting an agent's success report; partial checks.

## Verdict (machine-readable — the conductor's gate reads this)
End with exactly one line:
```
Verification verdict: PASS
```
or
```
Verification verdict: FAIL — <what is unproven, with evidence>
```
A FAIL withholds deploy/ship; the conductor logs it to `ASSUMPTIONS.md` and never pauses.
