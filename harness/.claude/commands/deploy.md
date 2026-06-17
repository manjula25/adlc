---
description: Deploy to Vercel + Supabase — gated, with smoke test and auto-rollback
argument-hint: [preview|prod]
---

# Deploy

The DEPLOY stage (past the PIV diagram). Orchestrates DB migrate → app deploy → smoke →
auto-rollback on failure. Default target: `preview`. `prod` only from `main`.

## Gate (refuse if not met)
For `prod`:
- On `main`, working tree clean, and HEAD is the merged PR commit.
- CI green (lint + `test:run` + `test:e2e`). Check `gh run list` / required checks.
- Developer review already merged it (role boundary — deploy never bypasses review).
If any fails → stop and report. Use `preview` for pre-merge verification instead.

## Steps
1. **Migrate** — `supabase-migrations` skill: apply DB changes and verify (RLS intact).
   Take a backup/snapshot first for risky migrations.
2. **Deploy** — `vercel-deploy` skill: `preview` or `--prod`. Capture the URL.
3. **Smoke** — run the Playwright **smoke subset** (tag `@smoke`) against the live URL:
   load home, auth, one critical write path. Also `curl -fsS <url>` = 200.
4. **Verdict**
   - Green → report URL, done.
   - Red → **auto-rollback**: `vercel promote <previous-good>`; if a migration is implicated,
     flag it (schema rollback needs a compensating migration via Codex — see `/rollback`).
     Never leave prod in a broken half-deployed state.

## Output Report
- Target, migration result, deployment URL.
- Smoke results (pass/fail per check).
- Verdict: DEPLOYED / ROLLED BACK (with reason + next action).
