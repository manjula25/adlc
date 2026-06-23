# Pending — live-run readiness

Done so far: 145 tests green, typecheck clean. RLS gate, lifecycle gate, CI workflow,
opencode runner all already in place. Preflight CLI/auth check added (`src/preflight.ts`,
wired in `cli.ts` — live runs now fail at second 0 if `gh`/`vercel`/`psql`/`codex`/`claude`
missing or unauthed). Gaps #2 (SendGrid best-effort) and #3 (provisioning retry) closed below.
#1 (headless LLM auth) hardened below — runner now deterministic; only the live token run is left.
Remaining: #4 (pilot) needs a real live run with credentials.

## Remaining gaps (ranked)

### 1. LLM runner auth headless — HARDENED (env-auth deterministic); live token run still pending
Resolved offline from codex/claude source + docs:
- **claude**: `claude --print` auth in headless is "strictly ANTHROPIC_API_KEY or apiKeyHelper"
  (per `claude --help`; OAuth/keychain never read in that mode). Env-auth confirmed. No change.
- **codex**: `load_auth()` precedence is `CODEX_API_KEY env > … > auth.json`; in a clean headless
  env (no auth.json) `OPENAI_API_KEY` alone already resolves to ApiKey mode. Residual risk: a CI
  base image carrying a stale ChatGPT `auth.json` (`auth_mode=Chatgpt`) would otherwise win.
  Fix: `CodexRunner` now mirrors `OPENAI_API_KEY → CODEX_API_KEY` in the child env
  (`codexChildEnv()` in `src/runners/codex.ts`) — highest precedence, beats any stale login.
  Guarded: only when a key is set and `CODEX_API_KEY` unset, so local ChatGPT-login dev is
  untouched. Test: `src/runners/codex.test.ts` (3 cases).
- Still UNVERIFIED: an actual token-spending `codex exec`/`claude --print` round-trip on a hosted
  runner with only the env keys. Cannot test offline (no keys in env). Covered by #4's live run.

### 2. proof-live SendGrid inconsistency — DONE
`SENDGRID_API_KEY` dropped from all three REQUIRED lists (`proof-live.ts`, `cli.ts` LIVE_REQUIRED,
`provision/env.ts` REQUIRED_VARS). Email is now best-effort at the source: `notify.ts`
`sendNotification` skips the POST and returns `sent:false` when `apiKey` is empty — matching the
disabled orchestrator EMAIL step. Test added (notify.test.ts). Re-enable by setting the key once
the sender IP is allowlisted with SendGrid.

### 3. No provisioning retry/backoff — DONE
Added `retry()` helper in `orchestrator.ts` (3× exponential backoff, injectable sleep). Wraps
`provisionRepo`/`provisionSupabase`/`provisionVercel` inside their `step()` calls. 3 tests added
(orchestrator.test.ts: first-success, retry-then-succeed, exhaust-and-throw). Handles token
expiry / 429 / transient DNS (past failure: Supabase DNS, mem 5815).

### 4. Decision Oracle (Phase 6A) end-to-end — per plan
BRIEF+POLICY → PO-agent auto-decide exists (`po-agent.ts`, `brief.ts`, doubt-loop) but the full
design-link → deployed-preview path is unproven on REAL LLM phases (only mocked in tests).
- Action: after #1 confirms runner auth, run `npm run conductor -- run --link <design> --live`
  against a throwaway project. Watch `ASSUMPTIONS.md` output. This is the real Phase 6D pilot
  (SDIAS Operations Hub on GPT-5.5 per `docs/ADLC-AUTONOMY-PLAN.md`).

## To run live (env)
```
gh auth login                 # verify: gh api user
export VERCEL_TOKEN=… SUPABASE_DB_URL=… SUPABASE_URL=… SUPABASE_ANON_KEY=… OPENAI_API_KEY=…
# SENDGRID_API_KEY now optional — email is best-effort, skipped if unset (gap #2 closed)
npm run proof:live            # infra-only smoke (no LLM phases) — start here
```
