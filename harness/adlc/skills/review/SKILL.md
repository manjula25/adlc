---
name: review
description: Two-axis review (Standards + Spec) of the feature diff, run as parallel isolated reviewers then aggregated. Adapted for the ADLC harness in the spirit of Matt Pocock's review skill. Replaces the old code-review command in the pipeline.
---

# review

The REVIEW phase of `docs/PROCESS.md`. Reviews the diff between `HEAD` and a fixed point along
two deliberately separate axes:

- **Standards** — does the code conform to this repo's documented coding standards?
- **Spec** — does the code faithfully implement the originating PRD / issue?

The two axes run as **parallel sub-agents** (e.g. the `reviewer` subagent) so they don't pollute
each other's context; this skill then aggregates their findings without reranking across axes.

## Process
1. **Pin the fixed point** — a commit SHA / branch / `main` / merge-base. In the autonomous loop
   this is the feature branch's base. Capture the diff once: `git diff <fixed-point>...HEAD`
   (three-dot) plus the commit list. Fail fast if the ref is bad or the diff is empty.
2. **Identify the spec source** — issue references in commit messages, the PRD from `to-prd`, or
   a spec file under `docs/`. If none exists, the Spec axis reports "no spec available".
3. **Identify the standards sources** — `CODING_STANDARDS.md`, `CONTRIBUTING.md`, ADRs, POLICY.
4. **Spawn both reviewers in parallel:**
   - **Standards** — every place the diff violates a documented standard; cite the rule;
     distinguish hard violations from judgement calls; skip anything tooling enforces.
   - **Spec** — (a) required behavior missing/partial; (b) behavior not asked for (scope creep);
     (c) requirements implemented wrongly. Quote the spec line per finding.
   - **Spawn parameter rule:** when spawning sub-agents (e.g. via `SpawnAgent`), **omit
     `agent_type`, `model`, and `reasoning_effort`** — full-history forked agents inherit these
     from the parent and the codex tool router rejects spawns that specify them. Alternatively,
     spawn without a full-history fork. Failing to follow this causes:
     `ERROR codex_core::tools::router: error=Full-history forked agents inherit the parent
     agent type, model, and reasoning effort; omit agent_type, model, and reasoning_effort,
     or spawn without a full-history fork.`
5. **Aggregate** under `## Standards` and `## Spec` headings. Do NOT merge or rerank — keeping
   the axes separate stops one from masking the other.

## Why two axes
Code can follow every standard but implement the wrong thing (Standards pass, Spec fail), or do
exactly what the issue asked while breaking conventions (Spec pass, Standards fail).

## Verdict (machine-readable — the conductor's gate reads this)
After aggregating, end with exactly one line:
```
Review verdict: APPROVE
```
or
```
Review verdict: REQUEST CHANGES — <worst finding per axis>
```
REQUEST CHANGES withholds deploy/ship; in the zero-human loop, groundable findings are fixed via
`codex-bridge`, ungroundable ones decided + logged to `ASSUMPTIONS.md`. Never pause.

## Structured output rule (required even for APPROVE)
**Always emit `## Standards` and `## Spec` sections**, even when there are no findings.  Use "No
findings." as the body when an axis is clean.  The `receiving-code-review` skill parses these
headings to build its fix list — if they are absent and the verdict is later REQUEST CHANGES, the
remediator has nothing to parse and silently no-ops.

## Hard rules for the autonomous loop

- **Never ask the user questions.** This skill runs headless — there is no human to answer.
  Asking anything kills the pipeline. If something is unclear, make the best call and note it
  in a finding.
- **Always emit exactly one `Review verdict:` line**, even if git commands fail or the diff is
  empty. If you cannot obtain a diff, emit:
  `Review verdict: REQUEST CHANGES — diff unavailable; read source files directly against spec`
  then re-attempt the review by reading the relevant source files with the file-read tool.
- **Fallback when `git diff` is unavailable:** read the source files directly (use the Read or
  Bash read tools) and compare their content against the acceptance criteria in the task.
  A missing diff is not a reason to stop — it is a reason to use a different evidence source.
