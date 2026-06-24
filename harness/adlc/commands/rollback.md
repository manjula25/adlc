---
description: Roll back a bad deployment — Vercel promote + Supabase compensating migration
argument-hint: [reason]
---

# Rollback

Restore the last-known-good state after a bad deploy. Reason: `$ARGUMENTS`.
**Claude runs CLI + reviews; any compensating SQL is authored by Codex.**

## 1. App code (fast, safe)
`vercel-deploy` skill → list deployments, identify last-known-good, `vercel promote <url>`.
Vercel deploys are immutable, so this is instant and reversible.

## 2. Database (deliberate)
Postgres/Supabase migrations are forward-only. If the bad deploy ran a migration:
- If the new schema is backward-compatible with the promoted app → leave it (preferred).
- If not → dispatch Codex to write a **compensating migration**, review the SQL, apply via
  `supabase-migrations`. Never hand-edit prod schema. If data was lost, restore via PITR/backup.

## 3. Verify + evolve
- Smoke the promoted URL (`@smoke` Playwright subset) → confirm healthy.
- System-evolution: run `/add-regression` so the failure that forced this rollback becomes a
  permanent test, and update the AI layer so it can't recur.

## Output Report
- What was rolled back (app deployment id, any DB compensating migration).
- Current live state + smoke result.
- Follow-up regression/AI-layer change created.
