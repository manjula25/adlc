---
name: to-prd
description: Turn the gathered REQUIREMENTS + design summary into a PRD. Synthesize what is already known — never interview a human. Adapted for the ADLC harness in the spirit of Matt Pocock's to-prd skill.
---

# to-prd

The PRD phase of `docs/PROCESS.md`. Takes the conversation context — the REQUIREMENTS
produced by `grill-with-docs`, the design summary from intake, plus the BRIEF/POLICY — and
synthesizes a PRD. Follows Matt Pocock's `to-prd` discipline: **do NOT interview anyone —
just write down what you already know.** In the zero-human loop any residual doubt is decided
from BRIEF/POLICY and logged, never asked.

## Input
- The REQUIREMENTS document from `grill-with-docs`.
- The design summary from `intake`.
- The BRIEF (decisions) and POLICY (rules), injected by the conductor.

## Process
1. Understand the current state of the (target) codebase if one exists; reuse its domain
   vocabulary and respect any ADRs in the area you touch.
2. Sketch the **seams** at which the feature will be tested. Prefer existing seams; pick the
   highest seam possible. Record the seams as decisions — there is no human to confirm them,
   so ground each choice in BRIEF/POLICY and log anything unresolved.
3. Write the PRD using the template below. Carry any `## UNRESOLVED` items from the
   REQUIREMENTS into `## Out of Scope` / `## Further Notes` — never silently drop them.

## Output — PRD document
- **Problem Statement** — the problem from the user's perspective.
- **Solution** — the solution from the user's perspective.
- **User Stories** — a long, numbered list: "As an <actor>, I want <feature>, so that <benefit>".
  Cover every aspect of the feature.
- **Implementation Decisions** — modules built/modified, their interfaces, architectural
  decisions, schema changes, API contracts. No file paths or code snippets (they go stale).
- **Testing Decisions** — what makes a good test (external behavior, not implementation),
  which modules are tested, prior art in the codebase.
- **Out of Scope** — what this PRD does not cover.
- **Further Notes** — anything else, including carried-over `## UNRESOLVED` assumptions.

## Hand off
The PRD feeds `to-issues`, which slices it into independently-grabbable tracer-bullet issues.
