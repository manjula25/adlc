# Design — ADLC design-link → deployed preview (fully automatic)

Status: Approved (grilled + locked 2026-06-22 via `grill-with-docs`)

This `design.md` is the approved product/technical design the implementation plan implements.
It is a pointer + summary; the canonical decisions live in:

- `CONTEXT.md` — glossary (Escalation, Zero-human, Deploy target, Planning/Execution layers, …)
- `docs/ADLC-AUTONOMY-PLAN.md` §2 (revised boundary) + §8 (this requirement change)
- `docs/adr/0001-shared-supabase-schema-per-project.md` — shared-DB trade-off

## What it does

One claude.ai artifact share link (or exported standalone HTML) in → one deployed Vercel
preview URL emailed out, with **no human in the runtime loop**.

## Locked decisions

1. **Handoff.** Claude Code owns capture → PRD → per-module feature plans. Codex GPT-5.5 owns
   implement → review → deploy preview → email. (Review moved Claude→Codex; Claude still writes
   **no app code** — locked harness rule.)
2. **Zero-human runtime.** Every doubt is auto-decided by the PO-agent from BRIEF/POLICY. A
   low-confidence doubt is **decided anyway** and appended to the **ASSUMPTIONS log** + PR body.
   The loop never pauses. (Supersedes the old escalation-pause in §2.)
3. **Deploy-from-branch.** Deploy the feature branch as a Vercel preview, email that URL. Do NOT
   merge to `main`; `main` is merged by a human offline, asynchronously. Branch protection intact.
4. **Provisioning (ADR 0001).** Per run: create only a GitHub repo + Vercel preview. Supabase is a
   single SHARED project; each project = own Postgres schema (`proj_<id>.*`) + RLS. One-time org
   tokens (GH PAT, VERCEL_TOKEN, SUPABASE_ACCESS_TOKEN) in conductor env = setup, not runtime.
5. **Input.** claude.ai artifact share URL or exported standalone HTML.
6. **Email.** SendGrid (one HTTPS call to `mail/send`); recipient from project config / BRIEF.
7. **Granularity.** One repo per project; modules are feature-plans implemented in sequence; one
   preview URL emailed.

## Lifecycle

```
design link
  Claude:  INTAKE → GRILL (self-play req-gathering → REQUIREMENTS.md) → PRD → per-module PLAN
           → gh repo create → push (.claude AI layer + PRD + plans)
  Codex:   for each plan → IMPLEMENT → QA → REVIEW → (gates green) → DEPLOY branch preview
           all modules done → EMAIL preview URL (+ ASSUMPTIONS summary)
  main:    merged by a human offline (non-blocking)
```

## Non-goals

- No per-run Supabase project creation (ADR 0001 chose shared).
- No runtime human pause / escalation queue.
- No merge-to-main inside the loop.
