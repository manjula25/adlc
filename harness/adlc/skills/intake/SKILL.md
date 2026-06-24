---
name: intake
description: Normalize a design link (claude.ai artifact / standalone HTML) into a structured design summary the rest of the lifecycle can plan against.
---

# Intake: design link → structured design summary

The first lifecycle phase. The conductor has already fetched the design source and
extracted normalized text (see `harness/autonomous/src/intake.ts`). Your job is to turn
that raw extraction into a clean, structured summary — **without asking the user anything**.

## Input
- Normalized design text (passed in the task). If the input says `[BUNDLED SPA: ... read this
  file directly: <path>]`, open that file directly with your read/browser tools.

## Steps
1. Identify the product: name, one-line purpose, primary user(s).
2. List the screens / views and the key UI elements on each.
3. List the entities (data the app stores) and their apparent fields/relationships.
4. List the actions/flows a user can perform (CRUD, auth, search, exports, etc.).
5. Note integrations or external services implied by the design.
6. Flag anything genuinely ambiguous under a final `## UNRESOLVED` section — do NOT guess
   silently and do NOT stop. The PO-agent resolves these from BRIEF/POLICY.

## Output
A markdown `DESIGN SUMMARY` with the sections above. Keep it factual and grounded in the
design; no scope you cannot see in the input. End with `## UNRESOLVED` (may be empty).
