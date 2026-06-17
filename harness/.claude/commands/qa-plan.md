---
description: Derive a deterministic QA test plan from a feature plan
argument-hint: [path-to-feature-plan]
---

# QA Plan: turn a feature plan into a test plan

## Input
Read the feature plan: `$ARGUMENTS` (default: newest in `.agents/plans/`).
Also read `CLAUDE.md` and any `.agents/reference/` testing context.

## Mission
Produce a **test plan** mapping every acceptance criterion + user journey to concrete,
deterministic tests. **No SaaS.** Two layers only:
- **vitest** — unit/integration (logic, server actions, schema, RLS helpers).
- **Playwright** — end-to-end user journeys (durable regression suite, runs free in CI).

You write a PLAN (markdown), not test code. Spec code is written later by Codex (see `/qa-run`).
You may invoke the `qa-agent` subagent to *discover* edge cases/journeys (it explores with
agent-browser) — but its output feeds the plan, not the repo.

## Process
1. Extract from the feature plan: success criteria, user stories, screens/routes, data writes,
   role-based behavior.
2. Assign each to a layer — prefer Playwright for anything a user sees/does; vitest for pure
   logic + DB rules.
3. Define each case: `id`, `title`, `layer`, `preconditions` (seed data, auth role), `steps`,
   `expected`, `data assertion` (Supabase row that must exist/change).
4. Flag regression risk: which existing specs could this feature break?

## Output
Write `.agents/plans/<feature>-qa.md`:
```markdown
# QA Plan: <feature>
## Coverage map      (criterion → case id → layer)
## vitest cases      (id, title, target, expected)
## Playwright cases  (id, title, role, steps, expected, data assertion)
## Regression risk   (existing specs to re-run)
## Seed / fixtures
## Open questions
```
Print: file path + case counts (vitest / Playwright) + regression risk list.
Do NOT write test code here.
