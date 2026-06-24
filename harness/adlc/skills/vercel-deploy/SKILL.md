---
name: vercel-deploy
description: Deploy a Next.js app to Vercel via the Vercel CLI and capture the deployment URL. Use during the DEPLOY stage, after merge to main + green CI. Handles preview and production deploys, env pull, and promote/rollback.
---

# Vercel Deploy

Deploys to Vercel. Invoked by `/deploy`. **Claude runs CLI commands, writes no app code.**

## Pre-flight
```bash
command -v vercel || npm i -g vercel   # or use `npx vercel`
test -n "$VERCEL_TOKEN" || { echo "VERCEL_TOKEN missing"; exit 1; }
```
Secrets come from env / CI secrets — never hard-code, never commit. Project link is in
`.vercel/project.json` (run `vercel link` once per project).

## Deploy
```bash
# preview (default for verification)
vercel deploy --token "$VERCEL_TOKEN" --yes > /tmp/vercel-url.txt
# production (only from /deploy after gate passes)
vercel deploy --prod --token "$VERCEL_TOKEN" --yes > /tmp/vercel-url.txt
URL=$(tail -1 /tmp/vercel-url.txt)
```
Build env vars must be set in the Vercel project (or `vercel env pull` locally). Missing env
→ build fails or fake-passes; verify before promoting.

## Verify
- `curl -fsS "$URL"` returns 200.
- Hand the URL to `/deploy`'s smoke step (Playwright smoke subset against the live URL).

## Promote / rollback
```bash
vercel ls --token "$VERCEL_TOKEN"                       # list deployments
vercel promote <previous-deployment-url> --token "$VERCEL_TOKEN"   # roll back to prior
```
Vercel deploys are immutable — rollback = promote the last-known-good deployment. Fast and safe
for app code. (DB rollback is separate — see `supabase-migrations`.)
