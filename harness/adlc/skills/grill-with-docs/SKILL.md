---
name: grill-with-docs
description: Requirement-gathering as PO-agent self-play over the design summary. Surfaces every ambiguity, resolves what the BRIEF allows, logs the rest. Produces REQUIREMENTS.md. Adapted for the ADLC harness in the spirit of Matt Pocock's grilling/requirement skills.
---

# Grill With Docs: stress-test the design into firm requirements

The GRILL phase. This follows Matt Pocock's grilling discipline — interview the design
relentlessly, resolving each branch of the decision tree before moving on — but adapts it for
the **zero-human autonomous loop** as **PO-agent self-play**: you both ask the sharp clarifying
questions a senior engineer would ask, and answer them from the BRIEF/POLICY. No human is
prompted; the BRIEF/POLICY is the Decision Oracle that stands in for the human Matt would grill.

## Input
- The DESIGN SUMMARY from the intake phase (passed in the task).
- The BRIEF (decisions) and POLICY (rules), injected by the conductor.

## Steps
1. For each feature/entity/flow in the design, ask: what is underspecified? (states,
   edge cases, validation, permissions, empty/error states, data lifecycle, limits).
2. For each question, attempt to resolve it from the BRIEF decisions and POLICY rules.
3. Resolved items become firm requirement statements.
4. Anything not answerable from BRIEF/POLICY goes under `## UNRESOLVED` (the conductor
   auto-decides it, logs it to `ASSUMPTIONS.md`, and continues — never blocks).

## Output
A `REQUIREMENTS` document:
- **Functional requirements** — numbered, testable statements ("The system shall …").
- **Data requirements** — entities, fields, relationships, constraints.
- **Non-functional** — auth, security/RLS, performance, regions (grounded in POLICY).
- `## UNRESOLVED` — questions the BRIEF could not answer (may be empty).
