---
name: supabase-migrations
description: Apply and verify database migrations against Supabase (Postgres) before a deploy. Use during the DEPLOY stage. Supports Supabase CLI migrations and Drizzle. Forward-only by design — handles the migrate-before-deploy ordering and the rollback caveat.
---

# Supabase Migrations

Applies DB schema changes safely before app deploy. Invoked by `/deploy`.
**Claude runs CLI commands and reviews generated SQL; migration code is authored by Codex.**

## Pre-flight
```bash
test -n "$SUPABASE_ACCESS_TOKEN" || { echo "SUPABASE_ACCESS_TOKEN missing"; exit 1; }
test -n "$SUPABASE_DB_PASSWORD"  || { echo "SUPABASE_DB_PASSWORD missing"; exit 1; }
# project ref = subdomain of NEXT_PUBLIC_SUPABASE_URL (e.g. bmkmzgesaidjnxtpjvyn)
```

## Migration ordering (critical)
**Migrate the DB BEFORE deploying app code** when the new code needs the new schema; for
destructive changes (drop column) use expand→migrate→contract across two deploys so the old
app keeps working mid-rollout. `/deploy` enforces: migrate → smoke → promote.

## Apply — pick the project's tool
**Supabase CLI:**
```bash
supabase link --project-ref "$PROJECT_REF"
supabase db push          # applies supabase/migrations/*.sql
```
**Drizzle (if project uses it against Supabase Postgres):**
```bash
npm run db:migrate        # drizzle-kit migrate, DATABASE_URL → Supabase pooler
```

## Verify
- Migration reports success; no pending diffs (`supabase db diff` empty / `drizzle-kit check`).
- Target tables/columns exist; RLS policies intact (RLS is the security boundary — confirm
  policies weren't dropped).

## Rollback caveat
Supabase/Postgres migrations are **forward-only** in practice. To undo: apply a new compensating
("down") migration authored by Codex — do NOT hand-edit prod schema. Take a snapshot/backup
before risky migrations so PITR is possible. App rollback (Vercel promote) is independent and safe;
schema rollback needs a deliberate compensating migration.
