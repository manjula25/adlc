---
description: Developer review gate — review a PR/diff against plan, rules, security before merge
argument-hint: [PR number or branch]
---

# Code Review — the merge gate (Developer role)

The one human-in-the-loop gate. Reviews Codex's output against the plan + rules + security
before a developer merges. **Claude assists the review and dispatches Codex fixes; the
developer makes the approve/merge decision. Claude never merges and never hand-edits code.**

## Input
PR/branch: `$ARGUMENTS` (default: current `feat/*` branch). Read:
- the diff (`gh pr diff` or `git diff main...HEAD`),
- the feature plan `.agents/plans/<feature>.md` + its QA plan,
- `CLAUDE.md` + relevant `.agents/reference/*`.

## Review dimensions
1. **Plan conformance** — every task implemented? anything out of scope / unrequested?
2. **Correctness** — logic matches success criteria; edge cases from the plan handled.
3. **Security** — no leaked secrets; inputs validated; **RLS/authz intact** (ops-hub roles
   enforced server-side, not just UI); no SQL/JSX injection; safe env handling.
4. **Conventions** — naming/structure/error handling per `CLAUDE.md` + reference docs.
5. **Tests** — QA plan's vitest + Playwright cases present and meaningful (not assertion-free).
6. **Migrations** — forward-safe, RLS preserved, expand→contract for destructive change.

## Process
- Optionally run `codex exec review` as a cheap independent first pass, then review yourself.
- File findings by severity (blocker / should-fix / nit) with `file:line` + the rule violated.
- Blockers/should-fix → dispatch Codex (via `codex-bridge`) to fix; re-review. **No hand-edits.**
- Confirm CI is green (lint, typecheck, test:run, test:e2e) — merge is blocked otherwise.

## Verdict
- **APPROVE** → developer merges (squash). Then `/deploy`.
- **REQUEST CHANGES** → list blockers; loop back to Codex.

## Output Report
- Per-dimension findings (severity, file:line, rule).
- Codex fix dispatches made + outcomes.
- CI status. Final verdict: APPROVE / REQUEST CHANGES.
- Reminder: only a developer's CODEOWNERS approval satisfies branch protection.
