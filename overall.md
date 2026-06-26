# ADLC Lifecycle Flow

## Planning (run once)

```
INTAKE → GRILL → PRD → ISSUES
```

- **INTAKE** (codex) — normalize the design link
- **GRILL** (codex) — requirement self-play → `REQUIREMENTS.md`
- **PRD** (codex, `allowEdits`, `requireMutation`) — `to-prd` skill → `docs/PRD.md`
- **ISSUES** (codex, `allowEdits`, `requireMutation`) — `to-issues` skill → `docs/ISSUES.md`, parsed into tracer-bullet slices

## Per-Issue Cycle (repeated once per parsed issue)

```
IMPLEMENT → REVIEW → VERIFY → QA → FINISH
```

| Phase | Gate | Remediation | Key flags |
|---|---|---|---|
| **IMPLEMENT** | `implementGate` | — (self-heals on retry, `allowEdits`) | `requireMutation: true` |
| **REVIEW** | `reviewGate` (APPROVE/REQUEST CHANGES) | `receiving-code-review` skill | `allowEdits: true` |
| **VERIFY** | `verifyGate` (PASS/FAIL) | — (self-heals on retry, `allowEdits`) | `allowEdits: true` |
| **QA** | `qaGate` (PASS/FAIL) | — (self-heals on retry, `allowEdits`) | `allowEdits: true` |
| **FINISH** | `finishGate` (PASS/FAIL) | — | `allowEdits: true` |

Each phase retries up to `retryCap` (default 2). On gate failure:
- If a `remediate` step exists (REVIEW only), it runs the remediation skill with the failing report, then re-runs the gate
- If no remediation step (IMPLEMENT, VERIFY, QA, FINISH), the phase simply re-runs with `allowEdits: true` so it can self-heal
- After exhausting retries, the phase is marked FAILED, an assumption is logged, and **the pipeline halts** — no downstream phases run

## Global Tail (orchestrator, after all cycles green)

```
provision-repo → provision-supabase → provision-vercel → open-PR → (email disabled)
```

- If any lifecycle phase failed, the orchestrator **withholds deploy** and returns `ok: false`

---

# Architecture Assessment: TS Harness vs MD-Driven Approach

## What exists today: two layers

**Layer 1 — MD instructions** (`adlc/skills/`, `adlc/commands/`, `adlc/subagents/`): 34 markdown files that tell agents *what to do* — intake, grill, implement, review, deploy. This is the domain knowledge.

**Layer 2 — TS orchestration** (`harness/autonomous/src/`): 73 files of TypeScript that programmatically drive the pipeline — spawning `codex exec`, managing state machine phases, retry logic, provisioning, quality gates.

## The real-world landscape

| Approach | Who | How |
|---|---|---|
| **Heavy code orchestration** | Devin, Factory.ai, OpenHands, SWE-agent | Python/TS framework spawns LLM calls, manages state, tools |
| **Lightweight MD + thin shell** | Claude Code (`-p`), Aider, Cursor, GitHub Copilot Workspace | MD instructions + CLI invocation, agent self-manages |
| **Direct generation** | v0, bolt.new, Lovable | No orchestration — prompt → output |

Our harness is in the **heavy orchestration** camp. That's where Devin and OpenHands live. It's a legitimate approach, but with a core tension:

## The core problem with the TS layer

`orchestrator.ts` is essentially a **state machine wrapper around CLI tools** (`codex exec`, `claude -p`). It manages:
- Phase sequencing (intake → grill → implement → review → ...)
- Retry with exponential backoff
- Quality gates (pass/fail → halt or continue)
- Multi-runner abstraction (codex, opencode, claude)
- Cloud provisioning (GitHub, Supabase, Vercel)

But `codex exec` and `claude -p` are **increasingly capable of multi-step reasoning themselves**. They can read a markdown plan and execute 10 steps autonomously. The TS layer is duplicating reasoning that the agent already does internally.

**Specific pain points in the current approach:**
- `codex.ts` spawns a child process, manages stdin/stdout, temp files, timeouts — brittle, hard to debug
- The state machine in `issue-loop.ts` re-implements what a good agent prompt already handles (try → check → fix → retry)
- 73 TS files to maintain for what is fundamentally "run these markdown skills in order"
- Every time `codex exec` changes its CLI flags, the harness breaks

## What actually works in practice

The **MD layer is the crown jewel**. The skills, commands, and subagents encode domain knowledge that no framework provides. That's the real value.

The TS layer should be **as thin as possible** — a shell script that:
1. Runs `codex exec` (or `claude -p`) with the right skill markdown as the prompt
2. Checks the output / exit code
3. Moves to the next phase
4. Handles provisioning (this part genuinely needs code — GitHub API, Vercel API, Supabase API)

## Recommendation

**Keep the MD layer. Drastically simplify the TS layer.**

```
What to keep as TS (genuinely needs code):
  - provision/repo.ts, provision/supabase.ts, provision/vercel.ts  (API calls)
  - notify.ts  (email API)
  - A thin main.ts that sequences phases (50 lines, not 300+)

What to collapse into MD:
  - The state machine / retry logic → let the agent handle via skill instructions
  - The runner abstraction → just call codex exec directly, or claude -p
  - The quality gate logic → the review/verify skills already define pass/fail criteria
```

A ~100-line shell script + 34 markdown files would do 90% of what 73 TS files do today, and be far easier to maintain and debug.

## The honest truth about "design link → deployed Vercel"

No one has fully solved this autonomously yet — not Devin, not Factory, not OpenHands. The hard parts aren't orchestration; they are:
1. **Design interpretation** (INTAKE/GRILL phases — good approach)
2. **Quality gates that actually catch bugs** (REVIEW/VERIFY/QA — correct in principle, hard in practice)
3. **Provisioning glue** (provision/*.ts — this is real engineering, not agent work)

The MD skills address #1 and #2. The TS code addresses #3. The overlap in between is where the over-engineering lives.

**Bottom line:** MD files explaining step-by-step what agents should do is the right instinct. The TS orchestration should be thin glue, not a framework. The real world is converging on "good prompts + thin shell," not "heavy framework around LLM calls."
