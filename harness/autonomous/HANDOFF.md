# ADLC Conductor — Session Handoff

## Two repos
- **Conductor tool:** `/Users/manju/Documents/projects/ADLC/harness/autonomous` — the orchestrator. `npm run conductor` → `node --import tsx src/cli.ts`.
- **Target app (output):** `~/adlc-run-1` (GitHub `manjula25/adlc-app-1`) — only stub `.md` files so far.

## Run command
```
npm run conductor -- run --live \
  --link "<figma>" --repo-dir ~/adlc-run-1 --org manjula25 --project adlc-app-1
```

## Pipeline order (`src/orchestrator.ts`)
intake → grill → lifecycle(PRD→PLAN→IMPLEMENT→QA→REVIEW) → provision-repo → provision-supabase → provision-vercel → notify(disabled).

Dev phases run FIRST; provisioning LAST. It only *looks* like "deployment first" because dev phases used to be silent and provisioning is the only thing that logged.

## Logging
- No log file exists. All `console.log/error` → terminal only.
- Active runners = codex/claude (`runners.config.json`, priority `["codex","opencode","claude"]`).

## Done — streaming patch (typecheck clean, lifecycle tests 5/5)
- `src/runners/{claude,codex,opencode}.ts` — mirror subprocess stdout+stderr live to `process.stderr`. Captured buffers unchanged → parsing/result text intact.
- `src/lifecycle.ts` — `[lifecycle] <PHASE> start/ok/FAILED (retries=, assumptions=)` milestone lines per phase.

Save a run to disk:
```
npm run conductor -- run --live ... 2>&1 | tee ~/run.log
```

## Open problem
`adlc-app-1` empty despite real runners. Hypothesis: IMPLEMENT phase produces no file writes, then lifecycle hits "gate cap exhausted → proceed anyway" (`lifecycle.ts:97`) silently. The streaming patch will reveal why on next run.

## Next step
Run conductor again, watch `[lifecycle] IMPLEMENT` output to see if codex actually writes code or no-ops.

## Security TODO
Vercel token `vcp_2GXPpNNX3b...` leaked in earlier screenshot — revoke + reissue.
