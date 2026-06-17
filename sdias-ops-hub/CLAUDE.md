# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

The **SDIAS Operations Hub** is an internal, staff-only back-office for the San Diego Indian American
Society's **Mentor / Mentee** program. It handles application intake (via public invite links), an
approval workflow, manual tag-based matching, and ongoing relationship tracking with check-in notes.
Single organization; access restricted to staff (Super Admin / Admin). MVP goal: a staff member can
invite applicants, approve them into the pool, match a mentee to a mentor by shared interests, and
track the relationship lifecycle and check-ins — end to end. Built via the ADLC harness.

---

## Tech Stack

| Technology | Purpose |
|------------|---------|
| Next.js 15 (App Router), React 19, TypeScript | UI + server components + server actions |
| Supabase (Auth, Postgres, RLS, Storage) | Data, sessions, **authorization boundary**, QR assets |
| Drizzle ORM | Schema + migrations; typed queries (`DATABASE_URL` → Supabase pooler) |
| Tailwind + shadcn/ui + lucide-react | Components + design tokens (status badges, fonts) |
| Resend | Templated transactional email (5 notification events) |
| `qrcode` | Printable QR for public invite links |
| Biome · vitest · Playwright | Lint/format · unit · e2e |
| Vercel | Deploy |

---

## Commands

This project is built and operated through the ADLC harness lifecycle (slash-commands), not by hand-coding.

```bash
# Development   next dev (after Phase 1 scaffold)
# Build         next build
# Test          vitest run        (unit: matching, capacity, RLS helpers)
# E2E           playwright test   (one spec per user story)
# Lint          biome check

# Lifecycle (who codes: Codex, not Claude):
# /plan-feature  → /implement-codex  → /qa-run  → /code-review  → /deploy
```

---

## Project Structure

```
src/app/(auth)                      # login, forgot-password
src/app/(hub)                       # dashboard, mentors, mentees, matches, settings, person/[id], relationship/[id]
src/app/apply/[type]/[token]        # public application forms (invite-link scoped)
src/app/api                         # server actions / route handlers
src/components/{ui,shell,people,matching,relationships,settings}
src/lib/{db,auth,supabase,matching,notifications}
drizzle/                            # schema + migrations
```

---

## Architecture

**Next.js App Router** with server components + **server actions for all mutations**. **Supabase RLS is
the authorization boundary** — never rely on UI gating alone; enforce role checks in policies *and*
server actions. Data access goes through a **server-side Supabase client** so RLS is enforced; the
service role is never exposed to the browser. Master-detail pattern for people and relationships;
route-based screens. Public intake writes only `Pending` rows via anon, token-scoped links.

---

## Code Patterns

### Naming Conventions
- Routes mirror modules: `(hub)/mentors`, `(hub)/matches`, `person/[id]`, `relationship/[id]`.
- Status enums per functional reqs; relationship lifecycle = Active / Paused / Completed.

### File Organization
- Feature-grouped components under `src/components/<feature>`; shared primitives in `ui/`.
- Domain logic (matching, capacity, notifications) isolated in `src/lib/` for unit testing.

### Error Handling
- Deny-by-default RLS; server actions re-check role. Public intake is rate-limited + token-scoped.

---

## Testing

- **Run tests**: `vitest run` (unit) · `playwright test` (e2e).
- **Test location**: colocated unit tests + `e2e/` Playwright specs.
- **Pattern**: Playwright covers each of the 8 user stories; vitest covers matching, the capacity
  consume/release transitions, and RLS helpers. Spec code is written by **Codex**, not Claude.

---

## Validation

```bash
biome check && vitest run && playwright test
```

---

## Key Files

| File | Purpose |
|------|---------|
| `PRD.md` | Source of truth for MVP scope, data model, phases |
| `src/lib/matching/` | Shared-tag ranking + at-capacity hiding |
| `src/lib/db/` (drizzle schema) | Tables, status enums, capacity rule |
| `src/lib/supabase/` | Server-side client (RLS enforced) |
| `drizzle/` | Migrations + seeds (12 category tags, org profile) |

---

## On-Demand Context

| Topic | File |
|-------|------|
| MVP scope, data model, phases | `PRD.md` |
| Functional requirements | `../docs/sdias-functional-requirements.md` |
| Design export (visual spec) | `../design/sdias-ops-hub.dc.html` |
| Harness roles & governance | `ROLES.md` |
| Model/cost routing | `MODEL-ROUTING.md` |

---

## Notes

- **Capacity rule:** a match consumes a mentor slot while `Active` or `Paused`; `Completed`/`Rejected`
  frees it. `slots_open` is derived from active matches.
- **Permissions:** Super Admin manages admins + taxonomy + org profile; Admin does day-to-day ops only.
  Enforced server-side (RLS), verified by RLS tests — never UI-only.
- Applicants/mentors/mentees are **not** users — public invite links + email only.
- Out of scope (badged "Soon", no data stubs): standalone Matching module, Scholarships, Events,
  Awards, charts/CSV, multi-org tenancy, read-only roles, applicant portal.
- **Code is written by Codex GPT-5.5, not Claude** — Claude plans, dispatches, reviews, and writes
  corrective prompts. See `MODEL-ROUTING.md`.
- Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (client); `DATABASE_URL`,
  `SUPABASE_DB_PASSWORD`, `RESEND_API_KEY` (server). Service role never ships to client.
