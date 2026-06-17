# SDIAS Operations Hub — Functional Requirements

> Source: design export `design/sdias-ops-hub.dc.html` (standalone interactive prototype). This document captures *what the system must do*, inferred from the design. It is not implementation guidance and is intended to feed a PRD-generation pipeline.

## Overview

The **SDIAS Operations Hub** is an internal staff/administrator web application for the **San Diego Indian American Society (SDIAS)** — a 40-year-old non-profit ("Spreading Mahatma Gandhi['s ideals]", $1.2M+ in scholarships, est. 1984). The Hub is the operational back-office for managing the organization's **Mentor / Mentee** program: intake of mentor and mentee applications, an approval workflow, a manual matching engine, and ongoing relationship tracking with check-in notes.

Access is restricted to staff and administrators ("Staff & administrator access only"). The app is single-tenant for one organization, with org-wide settings managed by Super Admins.

The current design exposes **one live module (Mentor / Mentee)**; four additional modules are stubbed as "Coming soon / SOON": **Matching** (as a standalone module), **Scholarships**, **Events**, and **Awards**. These are future scope and should be treated as roadmap placeholders, not v1 requirements.

Login supports email/password ("Remember me", "Forgot password?") and an SSO option ("Continue with Single Sign-On"). Version label shown: `SDIAS Operations Hub · v1.0`.

## Screens & Navigation

Navigation is a single-page-app state machine. The left sidebar lists **Modules**; within the Mentor/Mentee module a top-level nav switches between primary views. Key state keys observed: `screen`, `nav`, `personType`, `personId`, `selectedAppId`, `matchMenteeId`, `matchId`, `settingsTab`, `matchFilter`, plus per-list filters.

### Top-level screens / views
1. **Login** (`screen:login`) — branded marketing panel (mission, impact stats) + sign-in form; email/password, remember-me, forgot-password, SSO.
2. **Dashboard** (`nav:dashboard`) — landing view after sign-in.
   - 5 KPI tiles: **Active mentors**, **Active mentees**, **Pending approvals**, **Active matches**, **Unmatched mentees**.
   - **Recent activity** feed ("Latest submissions, approvals, and matches.").
   - **Quick actions**: Generate an invite link, Review approval queue, Start a new match.
   - **Our impact since 1984** panel (AVID STEM scholarships, years of giving back).
3. **Mentors** (`nav:mentors`) — table list of mentors with filters (status, category tag) + "Add mentor".
4. **Mentees** (`nav:mentees`) — table list of mentees with filters (status, category tag) + "Add mentee".
5. **Person detail** (`screen:person`, `personType` = mentor|mentee) — profile view: contact, bio, interest/category tags, application answer, match history, "Looking for / Hoping" text, "View profile". Reached by selecting a row.
6. **Approval Queue** — pending mentor & mentee applications; each shows Full name, Contact (Email/Phone), Submitted date, Application answer, Category tags, with **Reject** and **Approve & add to pool** actions.
7. **Relationships / Matches** (`nav:matches`) — list of mentor–mentee relationships with status filter ("All relationships", Active, Paused, Completed); columns include Mentor, Mentee, Shared interests, Connected (since), Duration.
8. **Matching workspace** ("Finding a mentor for …") — pick an unmatched mentee → see **Suggested mentors** (with "Shared:" interest pills) → **Confirm match**. Empty state: "Select a mentee to begin matching".
9. **Relationship detail** ("Back to relationships") — Relationship status controls (**Mark as Active**, **Pause relationship**, **Mark as Completed**), Shared interests, **Notes & check-ins** (timeline with Add).
10. **Settings** — tabbed:
    - **Administrator accounts** (`settingsTab:admins`) — list admins, "Invite admin"; note: Super Admins can invite/remove admins and manage org-wide settings.
    - **Category tag taxonomy** (`settingsTab:taxonomy`) — manage the category tags that power matching; "Add category"; editable by Super Admins only.
    - **Email notifications & templates** (`settingsTab:notifications`) — editable notification templates per event.
    - **Organization profile** — Organization name, Founded, Mission, Scholarships awarded, Beneficiaries; "Save changes".
11. **Invite links** — Mentor application link + Mentee application link, with **Copy** and **Download printable QR** for each.

## Components Inventory

- **App shell**: left sidebar (module list, "Coming soon"/"SOON" badges), top header (org switcher/title, current user avatar+name+role, "Generate invite link", sign-out), scrollable main region.
- **KPI tiles** (5 metric cards on dashboard).
- **Data tables**: mentors, mentees, relationships, admins, taxonomy — sortable/filterable rows with status badges. (3 `<table>` structures; lists also rendered via repeat loops.)
- **Status badges** with color tokens (each status has `bg`/`fg`/`dot` color fields): Active, Pending, Matched, Unmatched, Completed, Rejected, Paused; mentor capacity shows "X of N slots open" / "At capacity".
- **Filter controls**: status dropdowns ("All statuses"), category-tag dropdowns ("All categories"), search input. (`<select>` x5, `<input>` x13.)
- **Tag/pill chips**: category tags, interest tags, shared-interest pills.
- **Avatar** with initials (e.g., "AK", computed `initials`).
- **Add Person modal/form**: Full name, Email, Phone, School·Grad year (mentee) / Profession·Org·Location (mentor), Bio, category tags ("select all that apply"), with note "People added manually are auto-approved and join the active pool immediately." Actions: Cancel, Save & add to pool.
- **Approval card**: application answer, contact block, Reject / Approve & add to pool.
- **Matching panel**: mentee header, suggested-mentor cards with shared-interest pills, Confirm match.
- **Notes & check-ins timeline**: dated entries with author + text, Add control.
- **Invite-link card**: link text, Copy button, QR download.
- **Toast/notification**: transient confirmation (`toast` state, ~2.4s auto-dismiss).
- **Charting**: **none present.** No recharts/Chart/canvas usage — dashboard is KPI tiles + activity feed only. (Flag if PRD assumes charts.)

> Note on stack signals: the export uses a custom design-tool template engine (`sc-for`, `sc-if`, `{{ }}` bindings) and inline styles, **not** a literal production framework. Tailwind/shadcn/radix/lucide were **not** detected in the rendered markup. Treat the visual design as the spec; the production stack (e.g., React + Supabase) is an implementation decision, not dictated by this file.

## Data Model (candidate Supabase tables)

Inferred from JS data literals. Field names reflect the prototype; normalize as needed.

### `mentors`
- `id` (e.g. `m1`), `name`, `profession`, `org`, `location`, `email`, `phone`, `bio`
- `status` (Active | Pending | Rejected) — pool/approval state
- `capacity` (int — max concurrent mentees), derived `slots_open`
- `applied` (date submitted), `tags` (category tag refs)
- `initials` (derived for avatar)

### `mentees`
- `id` (e.g. `me1`), `name`, `school`, `grad` (graduation year), `email`, `phone`, `bio`
- `hoping` (free-text "what I'm looking for" / application answer)
- `status` (Pending | Unmatched | Matched | Completed | Rejected)
- `mentorId` (current matched mentor, nullable), `tags` (category tag refs), `applied` (date)

### `matches` (relationships)
- `id` (e.g. `mt1`), `mentorId`, `menteeId`
- `status` (Active | Paused | Completed)
- `date` (connected/start date), derived `duration`
- `notes` → see `match_notes`

### `match_notes` (check-ins)
- `id`, `matchId` (FK), `date`, `author`, `text`

### `category_tags` (taxonomy)
- `id`/`key`, `label` (full, e.g. "Medicine & Dentistry"), `short` (e.g. "Medicine")
- 12 categories: Medicine & Dentistry; Nursing/Allied Health; Biotech/Biochem/Science; AI/Data/Cybersecurity; Computer Sciences/IT/IS; Engineering; Entrepreneurship/Business; Finance/Economics; Leadership/Community Service; Politics/Govt/Education/Non-Profits; Communications/Media/Journalism; Law.
- Editable by Super Admin only. Joined many-to-many to mentors and mentees (powers matching).

### `mentor_tags` / `mentee_tags` (join tables)
- Many-to-many between persons and `category_tags`.

### `admins` (users)
- `name`, `email`, `role` (Super Admin | Admin)

### `org_profile` (singleton)
- `organization_name`, `founded`, `mission`, `scholarships_awarded`, `beneficiaries`

### `notification_templates`
- `key` ∈ { `app_received`, `app_approved`, `app_rejected`, `match_confirmed`, `checkin_reminder` }, plus enabled flag and editable subject/body.

### `activity_log`
- `who`, `action`, `time` — feeds dashboard "Recent activity".

### `invite_links`
- Mentor and mentee application links (shareable URL + QR), used for public intake.

## Roles & Permissions

Two roles observed:
- **Super Admin** — full access: invite/remove administrators, manage category-tag taxonomy, edit org profile and org-wide settings.
- **Admin** — operational access: manage mentors/mentees, approvals, matching, relationships; cannot manage admins or taxonomy (Super-Admin-gated).

Applicants/mentors/mentees are **not** Hub users; they interact only via public invite links and receive email notifications. The Hub is staff-only.

## Interactions

- **Auth**: sign in (email/password or SSO), remember-me, forgot-password, sign out.
- **Intake**: generate invite link (mentor/mentee), copy link, download printable QR. Public application submission lands in Approval Queue as `Pending`.
- **Approval workflow**: review pending application → **Approve & add to pool** (mentee → `Unmatched`, mentor → `Active`) or **Reject** (→ `Rejected`).
- **Manual add**: staff add a mentor/mentee directly — auto-approved, joins active pool immediately (bypasses queue).
- **Matching**: select an unmatched mentee → system suggests mentors (ranked by shared category tags, gated by mentor `capacity`/available slots) → Confirm match → creates `match` (Active), sets mentee → `Matched`, consumes a mentor slot.
- **Relationship lifecycle**: Mark as Active / Pause / Mark as Completed; transitions affect mentor capacity and mentee status.
- **Check-ins**: add dated notes to a relationship.
- **Filtering & search**: per-list filters by status and category tag; text search across people; relationship filter by status.
- **Settings management**: invite/remove admins; add/edit category tags; edit notification templates (per-event enable + wording); edit org profile.
- **Notifications**: triggered emails on app_received, app_approved, app_rejected, match_confirmed, checkin_reminder (templated, toggleable).
- **Dashboard quick actions** and **toast confirmations** on mutations.

## Design System

- **Brand/identity**: SDIAS, "Operations Hub". Non-profit, scholarship/mentorship tone; impact stats prominent on login.
- **Typography**: Poppins (primary UI), Open Sans, Volkhov (display/serif), Montserrat — multiple custom embedded fonts. Establish a font scale; Poppins as the dominant family.
- **Color / status tokens**: each status carries explicit `bg` (background), `fg` (foreground), and `dot` colors — a status-badge token set for Active, Pending, Matched, Unmatched, Completed, Rejected, Paused. Capacity uses an availability color (`avBg`). A defined token palette should back these.
- **Components**: cards, tiles, tables, pills/tags, avatars (initials), modals, tabbed settings, toast — a standard admin-dashboard component library (shadcn/radix + Tailwind would be a natural fit for the rebuild, though not present in the export).
- **Layout**: fixed left sidebar + top header + scrollable content region; list/detail master-detail pattern for people and relationships.
- **Iconography**: inline SVGs (~47) for nav, actions, statuses.

## Open Questions

(Top items a BA must resolve before the PRD.)

1. **Matching algorithm specifics** — Is "Suggested mentors" purely shared-tag overlap, or weighted (capacity, location, profession, grad-year)? Define ranking rules and whether a mentor can be suggested when at capacity.
2. **Auth & SSO** — Which identity provider backs "Continue with Single Sign-On" (Google Workspace? Supabase Auth?), and is email/password retained alongside it? How are staff accounts provisioned vs. the admin-invite flow?
3. **Public application intake** — The invite links imply public-facing application forms not shown in this design. What fields do applicants submit, where do they live, and how do they map to mentor/mentee records? Is the application form in scope for v1?
4. **Role granularity & data ownership** — Beyond Super Admin / Admin, are there finer permissions (e.g., read-only staff, regional admins)? Single org confirmed, or future multi-chapter/multi-org? This affects RLS/tenancy design in Supabase.
5. **Out-of-scope modules** — Are Matching (standalone), Scholarships, Events, and Awards confirmed as future phases (excluded from v1), or does any need data-model stubs now to avoid rework?

### Secondary open questions
- Capacity semantics: does "Completed"/"Paused" free a mentor slot? Define exactly when capacity is consumed/released.
- Notifications delivery: which provider (SendGrid/Resend/Supabase), and are templates per-event only or also localizable?
- Reporting/exports: dashboard shows KPIs only (no charts/exports in design) — are CSV exports or analytics charts required for v1?
- Audit trail: "Recent activity" is shown — is a full immutable audit log required, and who can view it?
