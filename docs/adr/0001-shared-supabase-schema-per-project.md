# 1. Shared Supabase project, schema-per-project isolation

Date: 2026-06-22
Status: Accepted

## Context

The autonomous ADLC loop creates a new project on every run. Each project needs a
Postgres + auth backend. Three provisioning models were on the table:

- **A — auto-provision a fresh Supabase project per run** (Management API). Full
  isolation (own DB, own keys), but project-create is slow (minutes) and rate-limited,
  and multiplies token/cost management.
- **B — pre-created pool** of empty projects claimed per run. Fast, isolated, but caps
  concurrency to the pool size and needs manual refill.
- **C — one shared Supabase project** for all generated apps; only the GitHub repo and
  Vercel preview are created per run.

We chose **C**. The generated apps are preview-grade output of an autonomous pipeline,
not long-lived production tenants, so per-project DBs are over-provisioning. C is the
cheapest and has the fewest runtime moving parts (no slow create API in the hot path).

C's hazard: a single Supabase project means a single API gateway and a **single public
(anon) key shipped in every app's browser JS**. Without a barrier, one app's key could
read another app's data. So C is only acceptable with an in-project isolation mechanism.

## Decision

Use **one shared Supabase project**. Isolate each generated app with
**schema-per-project + Row-Level Security**:

- Each project gets its own Postgres schema (`proj_<id>.*`); migrations target only
  that schema.
- Only the project's own schema is exposed to its app; RLS policies key off the project
  identity so the shared anon key cannot cross schema boundaries.
- Per run, provisioning creates **only** the GitHub repo + Vercel preview. The Supabase
  project already exists; the run just adds a schema and runs migrations into it.

## Consequences

- Cheapest, fastest path; no project-create API in the critical path.
- All apps share one keyset and one database instance — blast radius is the whole shared
  project. Schema + RLS contain *data* access, but a bad migration, a Postgres outage, or
  exhausting connection/row limits affects every project at once.
- Not suitable if a generated app ever needs to hold real or sensitive third-party data.
  Promoting such an app to its own Supabase project (model A) is then required — that
  migration is the known upgrade path out of this decision.
- RLS correctness becomes load-bearing security. The review step must verify RLS on every
  generated schema, not treat it as optional.

ponytail: one shared project until a generated app needs real isolation, then graduate
that app to its own Supabase project (model A).
