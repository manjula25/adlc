# Headless Conductor B

This harness proves the autonomous-pipeline seam for Step B: when Claude calls `AskUserQuestion` through the Agent SDK, a `canUseTool` callback can answer from an in-memory BRIEF with zero terminal prompts.

The Product Owner oracle is deterministic and rule-based for this proof. It matches question text against `BRIEF.decisions`, chooses the matching option label, and returns answers keyed by the question text.

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
```

`npm run proof` exits with `SKIP` and status 0 when `ANTHROPIC_API_KEY` is unset. With an API key, it runs the integration proof and reports `asked`, `answered`, `deferred`, `promptedHuman`, and the first 200 characters of `finalText`.
