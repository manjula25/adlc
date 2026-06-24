---
name: notify
description: Compose the end-of-run notification (preview URL + assumptions summary) that the conductor emails via Resend. Final lifecycle phase.
---

# Notify: announce the deployed preview

The EMAIL phase — the last step of the loop. The actual send is performed by the conductor
(`harness/autonomous/src/notify.ts`); your job is to compose the human-facing message body.
Never ask the user anything.

## Input
- The Vercel preview URL (passed in the task).
- The repo's `ASSUMPTIONS.md` summary (auto-decisions made during the run).
- The BRIEF (recipient address lives in `BRIEF.decisions.recipient`).

## Steps
1. Confirm the preview URL is present and well-formed (`https://….vercel.app`). If missing,
   say so explicitly — do not fabricate a URL.
2. Summarize what was built in 2–4 lines (project name + key modules delivered).
3. Surface the assumptions log prominently — this is the human's only audit surface for the
   autonomous decisions. Link or inline the `ASSUMPTIONS.md` summary.
4. State clearly: this is a **feature-branch preview**, not merged to `main` (a human merges
   `main` offline).

## Output
A short plain-text/markdown email body:
- Subject hint: `Preview ready: <url>`
- Body: what was built, the preview URL, the assumptions summary, the no-merge note.
