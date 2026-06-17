# PRD — SDIAS Operations Hub

> Source of truth for the MVP. Derived from `../docs/sdias-functional-requirements.md`
> (design export) + BA decisions. Built via the ADLC harness; phases below are PIV loops.

## 1. Executive Summary
The **SDIAS Operations Hub** is an internal, staff-only back-office for the San Diego Indian
American Society's **Mentor / Mentee** program. It handles application intake (via public invite
links), an approval workflow, manual tag-based matching, and ongoing relationship tracking with
check-in notes. Single organization; access restricted to staff (Super Admin / Admin).

**MVP goal:** a staff member can invite applicants, approve them into the pool, match a mentee to
a mentor by shared interests, and track the relationship's lifecycle and check-ins — end to end.

## 2. Mission & Principles
- Reduce the manual overhead of running a mentorship program for non-technical staff.
- **Security-first:** staff-only; role-gated; data protected by Supabase RLS server-side.
- Clarity over features: KPI tiles + tables (no charts), master-detail flows.
- Single source of truth for people, matches, and check-ins.

## 3. Target Users
- **Super Admin** — manages administrators, category-tag taxonomy, org profile, notification
  templates. Technical comfort: moderate.
- **Admin** — day-to-day ops: people, approvals, matching, relationships. Cannot manage admins
  or taxonomy.
- (Applicants/mentors/mentees are **not** users — they use public invite links + receive email.)

## 4. MVP Scope
**In scope** ✅
- ✅ Auth: Supabase Auth — email/password + Google SSO; remember-me; forgot-password; sign-out.
- ✅ Roles: Super Admin / Admin, enforced via RLS + server checks.
- ✅ App shell: left sidebar (modules; future ones badged "Soon"), top header, content region.
- ✅ Dashboard: 5 KPI tiles, recent-activity feed, quick actions, impact panel.
- ✅ People: mentors & mentees lists (filter by status + tag, search), person detail, manual add
  (auto-approved into pool).
- ✅ Public intake: mentor & mentee application forms behind invite links (+ printable QR);
  submissions land in Approval Queue as `Pending`.
- ✅ Approval workflow: approve & add to pool / reject.
- ✅ Matching: select unmatched mentee → suggested mentors ranked by shared-tag count,
  **at-capacity mentors hidden** → confirm match.
- ✅ Relationships: list (filter by status), detail with status lifecycle (Active/Paused/Completed)
  + notes & check-ins timeline.
- ✅ Settings: admin accounts, category-tag taxonomy (Super-Admin only), notification templates,
  org profile.
- ✅ Email notifications (templated, toggleable): app_received, app_approved, app_rejected,
  match_confirmed, checkin_reminder.

**Out of scope** ❌
- ❌ Standalone Matching module, Scholarships, Events, Awards (badged "Soon" — future phases,
  no data stubs now).
- ❌ Charts/analytics dashboards, CSV export.
- ❌ Multi-chapter / multi-org tenancy (single org only).
- ❌ Read-only / regional staff roles.
- ❌ Applicant logins/portal (invite-link + email only).

## 5. User Stories
1. As an Admin, I generate a mentee invite link + QR, so applicants can apply themselves.
2. As an applicant, I submit a public application form, so I enter the approval queue as Pending.
3. As an Admin, I review a pending application and Approve & add to pool (→ Unmatched/Active) or Reject.
4. As an Admin, I add a mentor/mentee manually, so they're auto-approved into the active pool.
5. As an Admin, I select an unmatched mentee and confirm a suggested mentor, so a match is created
   and the mentor's capacity is consumed.
6. As an Admin, I pause/complete a relationship and add check-in notes, so I track its progress.
7. As a Super Admin, I invite an admin, edit the category taxonomy, and edit org settings.
8. As a staff member, I see live KPIs and recent activity on the dashboard.

## 6. Core Architecture & Patterns
- **Next.js (App Router)** on Vercel; server components + server actions for mutations.
- **Supabase**: Postgres (data), Auth (sessions), **RLS** (authorization), Storage (QR assets if needed).
- **Drizzle ORM** for schema + migrations (`DATABASE_URL` → Supabase pooler); typed queries.
- Data access through a **server-side Supabase client** so RLS is enforced; never expose the
  service role to the browser.
- **shadcn/ui + Tailwind** components; design tokens for status badges + fonts.
- Master-detail pattern for people and relationships; route-based screens.
- Directory (target):
  ```
  src/app/(auth)            login, forgot-password
  src/app/(hub)             dashboard, mentors, mentees, matches, settings, person/[id], relationship/[id]
  src/app/apply/[type]/[token]   public application forms
  src/app/api               server actions / route handlers
  src/components/{ui,shell,people,matching,relationships,settings}
  src/lib/{db,auth,supabase,matching,notifications}
  drizzle/                  schema + migrations
  ```

## 7. Data Model (Supabase / Drizzle)
Tables: `admins` (users; role enum Super Admin|Admin), `mentors`, `mentees`, `matches`,
`match_notes`, `category_tags` (12 seeded), `mentor_tags`, `mentee_tags` (join),
`org_profile` (singleton), `notification_templates`, `activity_log`, `invite_links`,
`applications` (public-intake submissions → become mentor/mentee on approval).
- Status enums per functional reqs. Mentor `capacity` (int); `slots_open` derived from active matches.
- **Capacity rule:** a match consumes a slot while `Active` or `Paused`; `Completed`/`Rejected`
  frees it. (Resolves secondary open Q.)
- RLS: all tables staff-only (authenticated admin); taxonomy/admins/org_profile writes
  Super-Admin-only; `applications` insert allowed via public-intake path (anon, token-scoped).

## 8. Technology Stack
- Next.js 15 (App Router), React 19, TypeScript.
- Supabase (Auth, Postgres, RLS, Storage), Drizzle ORM.
- Tailwind + shadcn/ui + lucide-react; fonts: Poppins (primary), Open Sans, Volkhov, Montserrat.
- Email: Resend (templated transactional). QR: `qrcode` lib.
- Tooling: Biome (lint/format), vitest, Playwright (e2e).
- Deploy: Vercel.

## 9. Security & Configuration
- Auth via Supabase; sessions server-verified. SSO = Google provider in Supabase Auth.
- **RLS is the authorization boundary** — never rely on UI gating alone; enforce role checks in
  policies + server actions.
- Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (client),
  `SUPABASE_DB_PASSWORD`/`DATABASE_URL`, `RESEND_API_KEY` (server). Service role never shipped to client.
- Public intake uses token-scoped invite links; rate-limit submissions.

## 10. Success Criteria
- ✅ Staff can complete the full loop: invite → apply → approve → match → track → check-in.
- ✅ Super Admin vs Admin permissions enforced server-side (verified by RLS tests).
- ✅ Matching hides at-capacity mentors and ranks by shared-tag count.
- ✅ All 5 notification events fire with editable templates.
- ✅ Playwright covers each user story; vitest covers matching + capacity + RLS helpers.

## 11. Implementation Phases (each = a PIV loop)
- **Phase 1 — Foundation:** Next.js + Supabase + Drizzle scaffold; auth (email/password + Google
  SSO); app shell (sidebar/header); roles + baseline RLS; full schema + migrations; seed 12 tags +
  org profile. *Validation:* sign in, see empty shell, RLS denies cross-role writes.
- **Phase 2 — People:** mentors/mentees lists (filters+search), person detail, manual add
  (auto-approve), tag chips.
- **Phase 3 — Intake & Approval:** invite links + QR, public application forms, approval queue,
  approve/reject, notification emails (app_received/approved/rejected).
- **Phase 4 — Matching & Relationships:** matching workspace (shared-tag rank, capacity-gated),
  confirm match (match_confirmed email), relationships list + detail (lifecycle + check-ins +
  checkin_reminder), dashboard KPIs + activity feed.
- **Phase 5 — Settings & Polish:** admin accounts, taxonomy editor, template editor, org profile,
  quick actions, toasts, design tokens/fonts, full regression + deploy.

## 12. Risks & Mitigations
- **RLS misconfig leaks data** → dedicated RLS vitest + reviewer security dimension; deny-by-default.
- **Matching/capacity edge cases** → unit-test slot consume/release transitions explicitly.
- **Public intake abuse** → token-scoped links + rate limiting + Pending-only writes.
- **Email deliverability** → Resend with verified domain; templates toggleable.
- **Design fidelity** → use captured `.dc.html` as visual spec; agent-browser visual checks in QA.

## 13. Appendix
- Functional requirements: `../docs/sdias-functional-requirements.md`
- Design export: `../design/sdias-ops-hub.dc.html`
- Harness lifecycle/roles: `ROLES.md`, `MODEL-ROUTING.md`
