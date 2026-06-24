---
name: finishing-a-development-branch
description: Finish a feature branch — verify tests, verify spec alignment, generate a changelog, then open a PR for a human to merge. Adapted for the ADLC harness from the superpowers finishing-a-development-branch skill. Called by ship; never merges to main in the loop.
---

# finishing-a-development-branch

Called by `ship` (and conceptually by `implement` when all tasks are green). Completes a feature
branch deterministically. **ADLC deviation from upstream:** the autonomous loop never prompts a
human and never merges to `main` — it always finishes by opening a PR and leaving the merge to a
human offline (deploy-from-branch governance, ADLC-AUTONOMY-PLAN §2).

## Process
### 1. Verify tests
Run the project's full suite via `codex-bridge`. If any fail, STOP — do not finish the branch.
Defer to `verification-before-completion` for the evidence discipline.

### 2. Verify spec alignment
Run `spec-drift-check` against the PRD/issue: requirements coverage, scope creep, constraint
violations. Drift that is groundable in BRIEF/POLICY is resolved + logged; ungroundable drift is
decided + logged to `ASSUMPTIONS.md`. Never pause.

### 3. Generate changelog
Use `writing-changelog` to record what was implemented. Save under
`docs/superpowers/specs/<branch>/<date>-changelog.md`.

### 4. Determine the base branch
`git merge-base HEAD main` (or `master`). This is the diff base for the PR and for `review`.

### 5. Finish — open a PR (the only option in the autonomous loop)
Upstream offers four options (merge locally / open PR / keep as-is / discard); the zero-human loop
takes exactly one: **open a PR.**
```bash
git push -u origin <feature-branch>
gh pr create --title "<title>" --body "<summary + test plan + ASSUMPTIONS.md log>"
```
The PR body includes the assumptions log. Do NOT merge, do NOT push to `main`, do NOT delete the
branch — a human merges `main` asynchronously.

## Hard rules
- **Never** proceed with failing tests.
- **Never** merge to `main` or force-push inside the loop.
- **Never** discard work.
- Branch protection + CODEOWNERS stay intact.
