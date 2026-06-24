# CONTEXT — ADLC glossary

Canonical language for the Agentic Development Lifecycle harness. Glossary only —
no implementation details, no specs.

## Terms

**ADLC** — Agentic Development Lifecycle. The end-to-end loop that takes a design
artifact to a deployed, iterated application with no human in the runtime loop.

**Runner** — a CLI driven headlessly that executes a model (Claude Code SDK,
`codex exec`, `opencode run`). Distinct from the model it drives.

**Conductor** — the runner-neutral orchestrator. Reads neutral ADLC definitions,
drives whichever runner, owns the lifecycle state machine.

**PO-agent** — the decision oracle. Answers doubts raised by any skill, grounded in
BRIEF + POLICY. Source-agnostic (answers by question content, not by which skill asked).

**Doubt** — a clarification a skill would normally ask a human. Resolved by the
PO-agent from BRIEF/POLICY.

**Escalation** — a doubt the PO-agent cannot ground above its confidence threshold.
Does NOT pause for a human. The PO-agent decides anyway (best grounded answer),
records the choice in the ASSUMPTIONS log + PR body, and continues. Humans read the
log post-hoc; the runtime loop never blocks. *(Redefined 2026-06-22: previously a
human-blocking pause.)*

**ASSUMPTIONS log** — the append-only record of every low-confidence decision the
PO-agent made instead of asking. The single place a human looks to audit autonomy.

**Zero-human** — no interactive human input at runtime. A human authors BRIEF/POLICY
up front and may review logs after; neither blocks the loop.

**Deploy target** — the autonomous loop deploys the *feature branch* as a Vercel
preview and emails that preview URL. It does NOT merge to main. `main` stays
human-curated and is merged offline, asynchronously — never a runtime gate. Branch
protection / CODEOWNERS on `main` remain fully intact.

**Planning layer** — owned by Claude Code: capture the design link → full PRD →
per-module feature plans.

**Execution layer** — owned by Codex GPT-5.5: implement each plan → review → deploy
preview → email URL. ("the rest")

**Design link** — the loop's entry input: a claude.ai artifact share URL or exported
standalone HTML (e.g. the SDIAS Operations Hub standalone HTML). Claude reads it to
produce the PRD.

**Project provisioning** — per run, only a new GitHub repo + a new Vercel preview are
created. The Supabase backend is a single SHARED project; each project is isolated
inside it via schema-per-project + RLS (see ADR 0001). One-time org tokens (GitHub, Vercel, Supabase) live
in the conductor env; that setup is not "human in the loop".
