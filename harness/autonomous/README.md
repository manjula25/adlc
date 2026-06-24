# Headless Conductor B

This harness proves the autonomous-pipeline seam for Step B across runner backends. A conductor loads skill markdown, injects a BRIEF proactively, parses a final `## UNRESOLVED` section, answers residual questions from the Product Owner oracle when possible, and escalates deterministic gaps without prompting a human.

The Product Owner oracle is deterministic and rule-based for this proof. It matches question text against `BRIEF.decisions`, chooses the matching option label, and returns answers keyed by the question text.

## Runners

| Runner | Adapter | Model config | Headless path |
| --- | --- | --- | --- |
| Codex | `src/runners/codex.ts` | `gpt-5.5` | `codex exec` with `--output-last-message` |
| opencode | `src/runners/opencode.ts` | `openai/gpt-5.5` | `opencode run --format json` |
| Claude | `src/runners/claude.ts` | existing SDK auth | wraps `runConductor` |

`runners.config.json` defines the runner priority, model names, and repo-root-relative `skillsDir`. The default skills directory is `.claude/skills`, but callers can point at any compatible skill folder. The GPT proof uses `harness/autonomous/fixtures/mini-plan/SKILL.md`.

Codex and opencode reach Claude-style skills through the portability layer: `loadSkill` reads `SKILL.md` and the doubt loop inlines the skill instructions into the runner prompt. Claude can still use the existing conductor path. opencode may also run against native `.claude` skills because `skillsDir` is configurable.

## Doubt Loop

The runner-neutral flow is:

1. Proactive inject: skill markdown + task + serialized BRIEF.
2. ELICIT: parse bullets under a final `## UNRESOLVED` heading.
3. PO answer: `poAnswerOne` substring-matches unresolved questions against `brief.decisions`.
4. Inject: if all residuals are answered, rerun once with `## INJECTED PO ANSWERS`.
5. Escalate: if any residual is not answerable from the BRIEF, stop and report it.

## canUseTool Contract

For a confident `AskUserQuestion` decision, the callback returns the answers directly in `updatedInput`:

```ts
return {
  behavior: "allow",
  updatedInput: { questions, answers },
};
```

`answers` is keyed by each question's `question` text. The value is the chosen option label for single-select questions and an array of labels for `multiSelect`.

Low-confidence questions return the SDK-supported deny decision with `interrupt: true`. In this proof that is the defer/escalation hatch: the conductor records `deferred` instead of prompting a human in the terminal.

## Boundary

This is Headless-to-PR only. The conductor can prove that lifecycle questions are answered programmatically, but it never merges or deploys.

## Run

```sh
npm i
npm run proof:unit
npm run typecheck
npm run proof
npm run proof:gpt
```

`npm run proof` exits with `SKIP` and status 0 when `ANTHROPIC_API_KEY` is unset. With an API key, it runs the integration proof and reports `asked`, `answered`, `deferred`, `promptedHuman`, and the first 200 characters of `finalText`.

`npm run proof:gpt` forces the Codex runner with GPT-5.5 against the mini-plan fixture. It reports `ranOn`, `elicited`, `answered`, `escalated`, `ok`, and the first 300 characters of model text. If Codex or GPT-5.5 auth is unavailable, it prints `SKIP` and exits 0.
