---
name: codex-bridge
description: Delegate implementation of an approved plan to OpenAI Codex (GPT-5.5) via the `codex exec` CLI. Use during the IMPLEMENT stage when code should be written by Codex (cheap throughput) rather than Claude. Claude orchestrates and reviews; Codex writes the code.
---

# Codex Bridge — hand a plan to Codex GPT-5.5

The IMPLEMENT step of the ADLC loop. The orchestrator (Claude) does NOT write app code
here — it dispatches the approved plan to Codex, then reviews Codex's diff. This keeps
expensive Claude tokens on judgment (planning/review) and cheap Codex tokens on bulk coding.

## Pre-flight
```bash
codex --version            # expect codex-cli >= 0.13
command -v codex || { echo "codex CLI missing — install & auth first"; exit 1; }
```
Model: pass `-m "$CODEX_MODEL"` (default `gpt-5.5-codex`; override per project in
`MODEL-ROUTING.md`). Verify the exact id is available before relying on it.

## Invocation contract
- **Input** = a single approved plan file in `.agents/plans/<feature>.md`. The plan is the
  ONLY context Codex needs (PIV rule: the plan carries all patterns, files, validation).
- **Working root** = project dir via `-C`.
- **Sandbox** = `workspace-write` (Codex may edit files + run cmds in the repo, no network/
  outside writes). Never `danger-full-access` unless the user explicitly opts in.
- **Output** = code changes on the current git branch. Capture the last agent message.

## Pattern
```bash
# 1. clean tree on a feature branch (the command layer creates the branch)
git status --porcelain   # must be clean before dispatch

# 2. dispatch the plan to Codex
codex exec \
  -m "${CODEX_MODEL:-gpt-5.5-codex}" \
  -s workspace-write \
  -C "$PROJECT_DIR" \
  --output-last-message /tmp/codex-last.txt \
  "Implement the plan in .agents/plans/${FEATURE}.md exactly. Follow CLAUDE.md rules and
   .agents/reference/*. Write code + tests as the plan's task list and validation section
   specify. Run the plan's validation commands and fix failures. Do NOT commit, push, or
   merge — leave changes in the working tree for review. Do NOT touch files outside the
   plan's scope."

# 3. surface what changed for Claude to review
git --no-pager diff --stat
```

## After Codex returns
1. `git diff` — Claude reviews the diff against the plan (scope creep, missing tasks,
   rule violations, security). This is mandatory; Codex output is trust-but-verify.
2. Optionally run an independent pass: `codex exec review` (Codex's own reviewer) as a
   cheap second opinion — but the human/dev review gate (Phase 4) still owns merge.
3. Run validation commands from the plan; loop fixes via another `codex exec` if needed.
4. Hand off to `/qa-run` (Phase 2) before review.

## Guardrails
- **Claude writes ZERO app code.** Every line of implementation — and every fix, however
  trivial — is produced by Codex. Claude only plans, dispatches, reviews diffs, and writes
  corrective prompts. If tempted to hand-edit, re-dispatch Codex instead.
- Codex never merges, pushes, or deploys. It writes code only.
- Out-of-scope edits → reject the diff, re-dispatch with a tighter prompt.
- Missing env vars cause silent mock-passing — ensure `.env.local` is set before dispatch
  (PIV gotcha). The command layer checks this.
- If `$CODEX_MODEL` is unavailable, stop and report — do NOT silently fall back to a
  weaker model.
