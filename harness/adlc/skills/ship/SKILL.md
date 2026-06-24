---
name: ship
description: Ship a verified feature branch by provisioning the repo/Vercel/Supabase, deploying the branch as a Vercel preview, emailing the URL, and finishing the branch — WITHOUT merging to main. Use in the ADLC ship phase after verification passes. Adapted for the ADLC harness in the spirit of Matt Pocock's ship skill.
---

# ship

The ship phase of `docs/PROCESS.md`: deploy-from-branch, email, finish. Never merges to `main`.

## Preconditions (refuse to ship otherwise)

- All implementation tasks green (see `implement`).
- `verification-before-completion` passed — behavior proven, not asserted.
- `ASSUMPTIONS.md` summarized for the PR body + email.

## Steps

1. **Provision** (idempotent): `gh repo create` (if absent), link Vercel project, bootstrap the
   project's Supabase schema (`proj_<id>` + RLS) in the shared project. See `vercel-deploy` and
   `supabase-migrations` skills and ADR 0001.
2. **Verify isolation** — confirm RLS on the new schema (`verifyRls`); a cross-schema read with the
   shared anon key must be denied. RLS is load-bearing security (ADR 0001) — do not skip.
3. **Deploy the feature branch** as a Vercel preview. Capture the preview URL. Do NOT deploy `main`.
4. **Email** the preview URL + ASSUMPTIONS summary via SendGrid (`notify`). Recipient from config/BRIEF.
   Missing recipient → log an assumption + skip; never block.
5. **Finish the branch** via `finishing-a-development-branch`: open the PR (body includes the
   ASSUMPTIONS log), leave `main` for a human to merge offline. Do NOT merge or push to `main`.

## Hard rules

- **No merge to `main` in the loop.** Branch protection + CODEOWNERS stay intact; `main` is merged
  by a human asynchronously (ADLC-AUTONOMY-PLAN §2).
- **Never auto-drop** a `proj_<id>` schema; orphan cleanup is manual (blast-radius, ADR 0001).
- **Zero-human** — any doubt is decided + logged, never paused.
