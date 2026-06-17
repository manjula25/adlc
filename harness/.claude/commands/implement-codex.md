---
description: Implement an approved plan by delegating code-writing to Codex GPT-5.5
argument-hint: [path-to-plan]
---

# Implement (Codex): write code from an approved plan

The IMPLEMENT stage with **no manual coding**. You (Claude) orchestrate and review;
**Codex GPT-5.5 writes the code** via the `codex-bridge` skill. You never type app code here.

## Plan
Read the approved plan: `$ARGUMENTS` (default: newest in `.agents/plans/`).
If the plan is missing a task list OR a validation section, STOP — it is not ready to
implement; send it back to `/plan-feature`.

## Steps

### 1. Pre-flight (fail fast)
- `git status --porcelain` must be clean. If not, stop.
- Confirm `.env.local` (or equivalent) has the env vars the plan needs — missing env makes
  agents fake-pass validation (PIV gotcha).
- Confirm `codex` CLI present and `$CODEX_MODEL` set (see `MODEL-ROUTING.md`).

### 2. Branch
Create a feature branch off the default branch:
`git switch -c feat/<feature-slug>` (derive slug from the plan title).

### 3. Dispatch to Codex
Use the **codex-bridge** skill: pass the plan file as the sole context, sandbox
`workspace-write`, working root = project dir. Let Codex write code + tests and run the
plan's validation.

### 4. Review the diff (mandatory — this is why hybrid works)
Read `git diff`. Check against the plan:
- Every task in the task list implemented? Anything out of scope?
- Follows `CLAUDE.md` + `.agents/reference/` patterns (naming, errors, types)?
- Security: no leaked secrets, inputs validated, RLS/authz intact?
- Tests present per the plan's validation strategy?

If issues → re-dispatch Codex with a corrective prompt (cite the exact gap). Iterate until
the diff matches the plan. **Claude never edits app code — not even trivial fixes. Every code
change, including one-liners, goes through Codex re-dispatch.** Claude only reads, judges, and
writes the corrective prompt.

### 5. Validate
Run all validation commands from the plan. Failures → fix loop via Codex (never hand-fix).
Continue only green.

### 6. Hand off (do NOT merge)
- Leave changes committed on the feature branch (`/commit` for the standardized message).
- Next: `/qa-run` (Phase 2 QA gate) → then `/code-review` + PR for the **developer** to merge.
- This command NEVER merges, pushes to main, or deploys. Role boundary: only a developer merges.

## Output Report
- Branch name + files created/modified (paths).
- Diff summary + which plan tasks each change covers.
- Validation results (commands + pass/fail).
- Review notes (anything the dev reviewer should focus on).
- Explicit: "Not merged. Awaiting QA + developer review."
