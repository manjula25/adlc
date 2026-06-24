---
name: to-issues
description: Break the PRD/plan into independently-grabbable issues as vertical slices (tracer bullets). Adapted for the ADLC harness in the spirit of Matt Pocock's to-issues skill. Replaces the old plan-feature step.
---

# to-issues

The PLAN/ISSUES phase of `docs/PROCESS.md`. Breaks the PRD from `to-prd` into **tracer-bullet**
issues. Follows Matt Pocock's `to-issues` discipline: each issue is a thin vertical slice that
cuts through ALL layers end-to-end, not a horizontal slice of one layer. In the zero-human loop
the "quiz the user" step is run as PO-agent self-play: critique the breakdown against BRIEF/POLICY
yourself, decide, and log — never pause.

## Input
- The PRD from `to-prd` (or an issue/plan reference passed in the task).
- The BRIEF (decisions) and POLICY (rules), injected by the conductor.

## Process
1. **Gather context** from the PRD and conversation. If an issue/plan reference is passed,
   read its full body.
2. **Explore** the target codebase (if any). Use its domain vocabulary; respect ADRs.
3. **Draft vertical slices** — tracer bullets:
   - Each slice delivers a narrow but COMPLETE path through every layer (schema, API, UI, tests).
   - A completed slice is demoable/verifiable on its own.
   - Prefer many thin slices over few thick ones.
   - Mark each slice `AFK` (implementable+mergeable headless) or `HITL` (needs a human decision/
     design review). Prefer AFK. In the autonomous loop, HITL decisions are resolved from
     BRIEF/POLICY and logged to `ASSUMPTIONS.md`.
4. **Self-critique** (the autonomous stand-in for "quiz the user"): is the granularity right?
   Are the `Blocked by` dependencies correct? Should any slice be split/merged? Resolve from
   BRIEF/POLICY; log unresolved calls.
5. **Emit the issues** in dependency order (blockers first) using the template below.

## Issue template
- **Parent** — reference to the PRD/parent issue (omit if none).
- **What to build** — the end-to-end behavior of this slice (no file paths / code snippets).
- **Acceptance criteria** — a testable checklist.
- **Blocked by** — blocking slices, or "None — can start immediately".

## Hand off
The ordered issues feed `implement`, which drives each slice to green test-first.
