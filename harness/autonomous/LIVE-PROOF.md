# LIVE PROOF — fire one real design-link → deployed-preview run

Everything in CI is **stubbed**. This is the only procedure that proves the engine works
against real cloud + real LLM runners. Run it in two stages: cheap cloud smoke first, then
the full pipeline. Stage 1 catches token/auth/cloud breakage *before* you spend LLM tokens.

## 0. Prerequisites (one-time auth) — with the gotchas we actually hit

| Tool | Auth | Gotcha learned |
|------|------|----------------|
| `gh` | `gh auth login` | PAT needs **repo create** (Administration: write) + **`delete_repo`** for teardown. `Resource not accessible` = missing scope. |
| `vercel` | `npm i -g vercel` | Must be on PATH (`vercel --version`). Token passed via `--token`, no `vercel login` needed. |
| `codex` | `codex login` (GPT-5.5) | IMPLEMENT/QA/REVIEW phases. Headless auth must work non-interactively. |
| `claude` | logged in | INTAKE/GRILL/PRD/PLAN/EMAIL phases. |
| Supabase | DB URL (below) | **Use the Session pooler URI** (`postgres.<ref>@aws-…pooler.supabase.com:5432`). The direct `db.<ref>.supabase.co` host is deprecated / won't resolve. You must own the project (need reset rights for the DB password). |
| SendGrid | API key (below) | `from` must be a **verified sender**; disable **IP Access Management** (or allowlist your IP) — `401 IP not whitelisted` otherwise. CI runner IPs are dynamic, so disable the allowlist for the GitHub Action. |

Runner priority: `codex → opencode → claude` (`runners.config.json`). Codex must be authed.

`ADLC_GH_ORG` must be the **owner** (`manjula25`), not a URL. Repo name = `ADLC_PROJECT_ID` (or auto `proj_<ts>`).

## 1. Tokens (export before either stage)

```bash
export VERCEL_TOKEN=...           # Vercel account token
export SUPABASE_DB_URL=...        # postgres://...  (service/admin — creates schema + RLS)
export SUPABASE_URL=...           # https://<ref>.supabase.co  (injected into the app)
export SUPABASE_ANON_KEY=...      # anon key (injected into the app)
export SENDGRID_API_KEY=...       # SendGrid send key
export ADLC_NOTIFY_EMAIL=you@bitcot.com   # where the preview URL lands (optional)
```

Missing any of the 5 required tokens → both stages **fail-fast / skip**, never half-mutate.

## 2. Stage 1 — cloud smoke (no LLM tokens burned)

Deploys a trivial app through the real provisioning stack only:
`gh repo → Supabase schema+RLS → Vercel preview → SendGrid email`.

```bash
npm run proof:live
```

PASS = you get an email with a live Vercel preview URL and `rlsVerified=true`.
If this fails, fix cloud/auth here — do NOT proceed to Stage 2.

## 3. Stage 2 — full pipeline, one real design link

The full run builds the generated app **into `--repo-dir`** (not the harness) and reads
`BRIEF.md` from there. There is **no SKIP_SUPABASE** here — Supabase must work. Set up a
fresh working dir first:

```bash
# fresh project workspace (NOT the harness repo)
mkdir -p ~/adlc-run-1 && cd ~/adlc-run-1
git init -q && git commit -q --allow-empty -m init   # provision-repo pushes this repo

# minimal BRIEF.md (project title + Decisions; `recipient` drives the email)
cat > BRIEF.md <<'EOF'
# My App

## Decisions
- recipient: you@bitcot.com
- stack: Next.js + Supabase
EOF

# optional POLICY.md (rules + confidence threshold for the doubt loop)
cat > POLICY.md <<'EOF'
## Rules
- All tables have RLS enabled.

**Confidence threshold:** 0.7
EOF
```

Then fire from the engine dir, pointing at that workspace:

```bash
cd /path/to/ADLC/harness/autonomous
source <your env with the 5 tokens>          # VERCEL_TOKEN, SUPABASE_DB_URL, SUPABASE_URL, SUPABASE_ANON_KEY, SENDGRID_API_KEY
npm run conductor -- run \
  --link https://<your-design-link> \
  --org manjula25 \
  --project adlc-app-1 \
  --repo-dir ~/adlc-run-1 \
  --live
```

Flags: `--project <id>` (default `proj_<ts>`) · `--org <owner>` · `--branch <name>` ·
`--repo-dir <dir>`. Omit `--live` for a zero-cloud dry run (great first smoke — exercises
intake/grill/plan/implement/qa/review with cloud stubbed).

Expected tail:
```
=== RESULT ===
ok:         true
previewUrl: https://<proj>-<hash>.vercel.app
repoUrl:    https://github.com/<org>/<proj>
schema:     proj_<id>
notified:   true
=== ASSUMPTIONS ===
<auto-decided doubts, if any>
```
Exit 0 = full design-link → deployed-preview proven. Check the emailed URL renders.

## 4. Teardown (MANUAL — ADR 0001)

Schemas are **never auto-dropped** (shared-Supabase blast radius). After verifying, clean up
by hand:

```sql
drop schema proj_<id> cascade;   -- only the run's own schema
```
```bash
vercel remove <proj> --yes       # Vercel project
gh repo delete <org>/<proj> --yes  # GitHub repo
```

## Notes
- Stage 1 ≠ Stage 2: Stage 1 skips all LLM phases on purpose, so a green Stage 1 means cloud
  is sound but says nothing about intake/grill/plan/implement. Stage 2 is the real proof.
- Known gap: bundled-SPA design links yield minimal static text; intake falls back to telling
  the runner to read the file directly (works only with the Claude runner). Prefer a design
  link with real static content for the first live run.
