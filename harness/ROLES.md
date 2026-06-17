# ADLC Roles & Governance

Makes the org model real: **BAs and QA ship features and bug-fixes without writing code or
needing a developer; developers gate only on code review + merge.** Enforced mechanically
(branch protection + CODEOWNERS + CI + command design), not by trust.

## Roles

| Role | Runs | Produces | Can merge? | Can deploy prod? |
|------|------|----------|------------|------------------|
| **BA** | `/prime` `/create-prd` `/create-rules` `/plan-feature` | approved plan in `.agents/plans/` | ❌ | ❌ |
| **Auto (Codex)** | `/implement-codex` (dispatched) | code on a `feat/*` branch + PR | ❌ | ❌ |
| **QA** | `/qa-plan` `/qa-run` `/add-regression` | passing Playwright/vitest suite, QA gate verdict | ❌ | ❌ |
| **Developer** | `/code-review` `/commit`, then merge | review verdict, merge | ✅ (only role) | ✅ (via `/deploy` after merge) |

Mentor/mentee program note (SDIAS): these are the *internal build* roles. App end-user roles
(Super Admin / Admin) are separate — see the PRD.

## The lifecycle, by role
```
BA:        prime → create-prd → create-rules → plan-feature        → APPROVED PLAN
Auto:      implement-codex (Codex writes code on feat/ branch)     → PR opened
QA:        qa-plan → qa-run (+ add-regression on bugs)             → GREEN suite, QA gate PASS
Developer: code-review → approve → MERGE                           → main
Deploy:    /deploy (gated: on main + CI green + merged)            → Vercel + Supabase
```

## Enforcement layers (defense in depth)
1. **Command design** — `/implement-codex`, `/qa-run`, BA commands all "open PR, never merge,
   never push to main, never deploy." The verbs aren't available to them.
2. **Branch protection on `main`** (set once by a repo admin):
   - Require pull request before merging.
   - Require **≥1 approving review from CODEOWNERS** (= developers).
   - Require status checks to pass: `lint`, `typecheck`, `test:run`, `test:e2e` (the QA gate).
   - Dismiss stale approvals on new commits. No force-push. Include admins.
3. **CODEOWNERS** (`.github/CODEOWNERS`) — routes every PR review to the dev team, so only a
   developer's approval can satisfy branch protection.
4. **CI** (`.github/workflows/ci.yml`) — runs the QA gate on every PR; a red suite blocks merge
   regardless of who opened the PR.
5. **Deploy gate** — `/deploy` refuses prod unless HEAD is the merged commit on `main` with CI
   green. BA/QA may trigger it, but it can't run on unreviewed code.

Detailed command × role allowlist: `.agents/roles/permission-matrix.md`.

## Why this works without devs in the build loop
A BA describes the feature → Codex writes it → QA proves it with deterministic tests → the
developer's *only* job is the review+merge decision. Nobody can route around the developer
because merge to `main` is physically gated on a CODEOWNERS approval + green CI.
