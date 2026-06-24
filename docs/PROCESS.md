# PROCESS — compulsory ADLC pipeline

Canonical, binding process for every run. Essential files point here; do not fork it.
Maps onto the lifecycle phases in `docs/ADLC-AUTONOMY-PLAN.md` §8.

## The pipeline (in order)

| # | Stage | Skill | Layer | Lifecycle phase |
|---|-------|-------|-------|-----------------|
| 1 | Stress-test design/plan | `grill-with-docs` | Claude | INTAKE |
| 2 | PRD | `to-prd` | Claude | PRD |
| 3 | Issues / per-module plans | `to-issues` | Claude | PLAN |
| 4 | Implement | `implement` (Matt Pocock) under **Subagent-Driven Development** | Codex | IMPLEMENT |
| 5 | Verify it works | `verification-before-completion` | Codex | QA |
| 6 | Ship | `ship` + `finishing-a-development-branch` | Codex | REVIEW→DEPLOY→EMAIL |

> `grill-with-docs` (stage 1) is dialogic. In the **zero-human** loop it runs as PO-agent
> **self-play**: doubts are auto-decided from BRIEF/POLICY and appended to the ASSUMPTIONS log
> — never a human Q&A, never a pause (CONTEXT.md → Escalation, Zero-human).

## Compulsory rules (non-negotiable)

1. **TDD is mandatory.** Every src change follows red→green→refactor: a failing test FIRST, then
   the minimum code to pass, then refactor. Per-edit discipline = `backend-test-driven-development`.
   No implementation task is "done" without its test. No exceptions, including one-liners with logic.

2. **Subagent-Driven Development with reviews between steps.** Implementation (stage 4) runs under
   `subagent-driven-development`: dispatch independent tasks to parallel subagents (efficient
   execution — never serialize work that has no dependency). **Between each task**, run BOTH:
   - **spec review** — `spec-drift-check` (did the change drift from PRD/issue/design?)
   - **code review** — `backend-code-review`
   Review findings + any doubt → auto-decide + log to ASSUMPTIONS (never pause).

3. **Verify before complete.** `verification-before-completion` gate must pass before ship — prove
   behavior, don't assert it. A green claim without a runnable proof is not done.

4. **Ship = deploy-from-branch, not merge.** `ship`/`finishing-a-development-branch` deploy the
   feature branch as a Vercel preview and email the URL. They do NOT merge to `main`; `main` is
   merged by a human offline, asynchronously (governance intact — ADLC-AUTONOMY-PLAN §2).

## Skill availability

`implement` and `ship` ship with this harness at `harness/adlc/skills/{implement,ship}/SKILL.md`
(symlinked into `.claude/skills/`), adapted in the spirit of Matt Pocock's skills. If a runner can't
load them, fall back to `superpowers:executing-plans` (impl) and `backend-finishing-a-development-branch`
(ship) — the compulsory rules above still bind regardless of which skill drives the stage.
