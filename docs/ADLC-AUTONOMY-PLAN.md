# ADLC Autonomy + Model-Agnostic Plan (consolidated)

Revisited 2026-06-17. Supersedes the Phase 6/7 notes in `tasks/todo.md` (which now point here).
Answers the three driving questions: (1) run on any runner + any model, (2) does the PO-agent
fully remove the developer from git→PR, (3) how Claude skills/agents/commands work under other models.

---

## 1. Vision

From an empty git repo (pre-seeded with the ADLC `.claude/` AI layer) to a ready PR, with no human
typing commands — and runnable on **any runner** (Claude Code / Codex / opencode) driving **any model**
(Claude, GPT-5.5, Kimi K2, local). On Claude quota exhaustion, the same plan continues on another runner.

---

## 2. The autonomy boundary (locked — revised 2026-06-22)

> **Revised 2026-06-22** by the requirement change in §8. The earlier "Headless-to-PR with a
> human merge + escalation pause" boundary is **superseded** by full runtime autonomy. The
> prose below reflects the new boundary; §8 records the deltas and the full flow.

**Deploy-from-branch, zero-human runtime.** The bot owns the whole loop: design intake → PRD →
plan → implement → QA → review → **deploy the feature branch to a Vercel preview → email the URL**.
There is **no human in the runtime loop** — not for clarifications, not for a merge click.

Two things stay human, but **neither blocks the run**:

1. **Doubts never pause.** A clarification the PO-agent can't ground above threshold is no longer an
   escalation-that-waits. The PO-agent **decides anyway** (best grounded answer), records it in the
   **ASSUMPTIONS log + PR body**, and continues. Humans audit the log post-hoc; the loop never blocks.
   Richer BRIEF/POLICY → fewer logged assumptions. (The old failure mode — "guesses and builds the
   wrong thing confidently" — is now mitigated by *visible, audited* assumptions, not by pausing.)
2. **merge-to-main stays human, offline.** The loop deploys the *branch* preview and stops there;
   `main` is merged by a human asynchronously, out of band. Phase-4 governance (CODEOWNERS, branch
   protection on `main`) stays **100% intact** — it just isn't a runtime gate anymore.

So the real claim: **zero-human at runtime; every unanswerable doubt is auto-decided and logged;
`main` merge is the one offline, non-blocking human touch.**

---

## 3. Architecture — three layers

| Layer | What | Model/runner-bound? |
|-------|------|---------------------|
| **Work** | plans, BRIEF, POLICY, rules, reference, skill/command prose | **No** — neutral markdown |
| **Runner adapters** | drive a CLI headless: Claude SDK / `codex exec` / `opencode run` | Yes — thin shim each |
| **Conductor + PO-agent** | orchestrates lifecycle, injects BRIEF, answers doubts, gates, escalates | Neutral logic; calls adapters |

The **conductor is the portability layer.** It reads neutral ADLC definitions and drives whichever
runner. Models are just a flag to the runner (`-m gpt-5.5`, `-m openai/gpt-5.5`, `-m openrouter/moonshotai/kimi-k2`).

---

## 4. How Claude skills/agents/commands work under other models (Q3)

**Verified facts (2026-06-17):**
- **opencode reads `.claude/` natively.** Env flags `OPENCODE_DISABLE_CLAUDE_CODE_SKILLS`
  ("Disable loading `.claude/skills`") and `OPENCODE_DISABLE_CLAUDE_CODE_PROMPT` ("Disable reading
  `~/.claude/CLAUDE.md`") confirm it loads Claude skills + CLAUDE.md by default → **ADLC skills run in
  opencode with ZERO porting.** opencode also has its own commands/agents (frontmatter md) + MCP.
- **Codex** uses `AGENTS.md` + a nascent skills concept; it does NOT read `.claude`. But `codex exec`
  accepts any prompt → the conductor **inlines** the skill/command markdown as the prompt. No porting.
- **Claude Code** = native `.claude/`.

**Decision: single canonical source, distributed by the conductor — do NOT recreate per runner.**

Three-tier portability:
1. **Prompt-style skills/commands (~90% of ADLC: plan-feature, code-review, qa-plan, create-prd…)** —
   pure instructions. Conductor inlines the markdown into any runner's prompt. opencode reads `.claude`
   natively as a bonus. **No porting.**
2. **Tool-backed skills (agent-browser, vercel/supabase CLIs)** — need a runtime. Expose via **MCP**
   (Claude, Codex, opencode all speak MCP) → universal. Or a per-runner adapter where MCP is absent.
3. **Native invocation wrapper files** (so a human can type `/plan-feature` inside Codex/opencode) —
   OPTIONAL, headless doesn't need them. If wanted, **generate** runner-native wrappers from the
   canonical source via a small build step (transpile, don't hand-maintain copies → avoids drift).

So: **generate compatible wrappers from one source where needed; never maintain separate copies.**

---

## 5. Doubt handling (Q2 mechanism) — proactive-first

1. **Proactive (primary).** Inject BRIEF + directive ("resolve from BRIEF; do not ask; escalate only
   true gaps") BEFORE any skill runs. Model self-resolves → questions rarely fire on ANY runner.
   The BRIEF is the mechanism, not `canUseTool`.
2. **Safety nets (residual).** Claude → `canUseTool` catches a stray `AskUserQuestion`. Codex/opencode
   emit no such event → explicit **ELICIT** step ("list doubts you can't resolve from BRIEF") catches them.
3. **Answer.** PO-agent (any model, incl. GPT-5.5) answers from BRIEF/POLICY. **Source-agnostic** —
   answers by question content, regardless of which skill (Superpowers / Matt Pocock / custom) raised it.
4. **Escalate.** Low confidence → queue (Slack/Linear) + pause; never guess.

Notes: dialogic skills (brainstorming) → PO-agent runs self-play. Technical skills (typescript-expert,
shoehorn) rarely ask → minimal PO involvement. GPT-5.5 can be BOTH the asking model AND the PO-agent.

---

## 6. Build plan (consolidated, supersedes Phase 6/7 lists)

**Done:** Phases 0–4 (harness), Phase 6 Step B (Claude conductor headless proof — `harness/autonomous/`,
unit 3/3 green; live run pending Anthropic key).

**A — Decision Oracle (runner-neutral core)**
- [ ] `BRIEF.md` + `POLICY.md` schema (committed to target repo before the agent starts)
- [ ] PO-agent: LLM-backed over BRIEF+POLICY, confidence threshold, source-agnostic answer fn
- [ ] proactive BRIEF injector + ELICIT safety net + escalation queue (pause/resume)
- [ ] auto plan-gate: validator stamps `Approved: yes` when plan matches BRIEF (replaces human)
- [ ] move real `defer`/resume to a PreToolUse HOOK (canUseTool can't defer)

**B — Runner abstraction (model-agnostic)**  ← priority for OpenAI-only setups
- [ ] `Runner` interface `runHeadless(prompt,{cwd,allowEdits,brief}) → {text,ok}`
- [ ] adapters: `claude.ts` (SDK+canUseTool), `codex.ts` (`codex exec -m gpt-5.5 -s workspace-write`),
      `opencode.ts` (`opencode run -m <provider/model> --dangerously-skip-permissions --format json`)
- [ ] `runners.config.json`: priority, per-runner model+auth-env, token budget
- [ ] router + fallback: try runner-A → on 429/quota → same plan to runner-B (no replan)
- [ ] conductor reads canonical skill/command md → inlines for runners without native `.claude`
- [ ] **live proof on GPT-5.5 (OpenAI-only):** ambiguous task → BRIEF injected → self-resolve →
      ELICIT residual → PO-agent answers/escalates → zero human

**C — End-to-end conductor**
- [ ] state machine: INTAKE→GRILL→PRD→PLAN→IMPLEMENT→QA→REVIEW→**DEPLOY-PREVIEW→EMAIL** (STOP; `main` merged offline)
- [ ] per-step gates + retry/budget caps; tool-backed skills via MCP
- [ ] doubt path = auto-decide + append ASSUMPTIONS log (never pause) — see §8

**D — Pilot + hardening**
- [ ] run SDIAS Operations Hub git→PR on GPT-5.5 (OpenAI-only) and on Claude; compare
- [ ] mechanical CLI-auth fixes; `init-project` enforces per-project `git init`
- [ ] fix harness defect: codex default model `gpt-5.5-codex` rejected by ChatGPT-account auth → `gpt-5.5`

---

## 8. Requirement change 2026-06-22 — design-link → deployed preview, fully automatic

Grilled + locked via `grill-with-docs`. Glossary terms in `CONTEXT.md`; shared-DB trade-off in
`docs/adr/0001-shared-supabase-schema-per-project.md`.

**Trigger / input.** A **claude.ai artifact share link** (or exported standalone HTML, e.g. the
SDIAS Operations Hub standalone HTML in the repo root). One run = one project.

**Model handoff (revises "Claude plans/reviews, Codex codes").**

| Phase | Owner |
|-------|-------|
| Capture design link → full PRD → per-module feature plans → create + push new GitHub repo | **Claude Code** |
| Implement each plan → **review** → deploy branch preview → email URL | **Codex GPT-5.5** |

> Review moves Claude→Codex. Claude writes no app code (locked "Codex writes ALL code" holds —
> Claude pushes only the `.claude/` AI layer + PRD + plans, not app code).

**Lifecycle (one repo per project; modules are feature-plans implemented in sequence; one preview URL):**
```
design link
  └─ Claude:  INTAKE → GRILL (self-play → REQUIREMENTS.md) → PRD → per-module plans
              → gh repo create → push AI layer + PRD + plans
  └─ Codex:   for each module plan → implement → QA → review → (gates green?)
                                                                    └─ deploy feature branch (Vercel preview)
              all modules done → email the preview URL
  main: merged by a human offline, asynchronously (non-blocking, governance intact)
```

**Doubts (hard rule: zero human at runtime).** PO-agent auto-decides every doubt from BRIEF/POLICY;
low-confidence ones are decided anyway and appended to the **ASSUMPTIONS log** (+ PR body). Never pauses.

**Provisioning (ADR 0001).** Per run, create **only** the GitHub repo + Vercel preview. Supabase is a
**single shared project**; each project gets its own Postgres **schema + RLS** (`proj_<id>.*`). One-time
org tokens (GH PAT, VERCEL_TOKEN, SUPABASE_ACCESS_TOKEN) live in the conductor env — setup, not runtime.

**Email.** SendGrid (one HTTPS call to `mail/send`; no SMTP server). Recipient address from project config / BRIEF.

**Compulsory process (`docs/PROCESS.md`).** Pipeline = grill-with-docs → to-prd → to-issues →
implement (Matt Pocock, under Subagent-Driven Development) → verification-before-completion → ship +
finishing-a-development-branch. TDD mandatory (failing test first, every src edit). Between every impl
task: `spec-drift-check` + `backend-code-review`. grill-with-docs runs as PO-agent self-play in the
zero-human loop. Independent tasks dispatch to parallel subagents (efficient execution).

**New build-plan deltas (fold into §6):**
- [ ] **E — Provisioning** — `gh repo create`; Vercel API project+link+preview deploy; Supabase schema
      bootstrap (`proj_<id>` + RLS) into the shared project; org-token env contract.
- [ ] **E — Notify** — SendGrid send-URL step at end of loop.
- [ ] **A — ASSUMPTIONS log** — replace escalation-pause with auto-decide + append-only log writer.
- [ ] **C — flow** — INTAKE→PRD→PLAN→IMPLEMENT→QA→REVIEW→DEPLOY-PREVIEW→EMAIL; no merge gate in runtime.
- [ ] **Claude/Codex split** — PRD + plans on Claude runner; implement+review+deploy+email on Codex runner.

## 7. Open risks / caveats
- Judgment quality differs across models (PO-agent on GPT-5.5 vs Claude) → tune confidence threshold per runner.
- Non-asking runners (Codex) silently guess on gaps unless ELICIT + rich BRIEF are in place.
- MCP needed for tool-backed skills on non-Claude runners; verify each runner's MCP support per tool.
- Escalation is unavoidable for novel decisions — design the queue, don't pretend it away.
- Skill native-wrapper generation must be single-source → transpile, or drift kills it.
- **(2026-06-22) No pause = wrong builds can ship silently.** The ASSUMPTIONS log is now the *only*
  safety net for bad guesses — make it prominent, reviewed, and easy to diff per run.
- **(2026-06-22) Shared Supabase blast-radius (ADR 0001).** RLS correctness is load-bearing security;
  the review step must verify RLS on every generated schema. A bad migration hits all projects.
- **(2026-06-22) Programmatic provisioning is now critical-path** — `gh`/Vercel/Supabase token expiry
  or rate limits fail the whole run with no human to intervene; need retry + clear failure logging.
