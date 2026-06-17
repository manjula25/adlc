# Plan: Headless Conductor — Step B (prove canUseTool answers a skill headless)

## Goal
Prove the autonomous-pipeline seam: when Claude (via the Agent SDK) calls `AskUserQuestion`,
a `canUseTool` callback answers it from a BRIEF with **zero terminal prompts**. Low-confidence
questions return the `defer` decision (escalation hatch). This is the smallest proof that
lifecycle skills can run with no human. Boundary = Headless-to-PR (conductor never merges/deploys).

## Scope (create these files under `harness/autonomous/`)
ONLY these. Do not touch anything outside `harness/autonomous/`.

1. `package.json`
   - name `@adlc/autonomous`, private, type `module`.
   - deps: `@anthropic-ai/claude-agent-sdk` (latest).
   - devDeps: `typescript`, `tsx`, `@types/node`, `vitest`.
   - scripts: `"proof": "tsx src/proof.ts"`, `"proof:unit": "vitest run"`, `"typecheck": "tsc --noEmit"`.

2. `tsconfig.json` — strict, `module`/`moduleResolution` = `NodeNext`, `target` ES2022,
   `esModuleInterop`, `skipLibCheck`, `noEmit`, include `src`.

3. `.gitignore` — `node_modules/`, `dist/`, `*.log`.

4. `src/brief.ts` — the Oracle source for the proof. Export:
   ```ts
   export interface Brief { decisions: Record<string, string>; project: string }
   export const BRIEF: Brief
   ```
   Populate `decisions` with a few keyword→answer hints, e.g.
   `{ "format": "Summary", "database": "Postgres", "auth": "email + password" }`.
   `project`: one-line description string. Keep it a plain in-memory fixture for B.

5. `src/po-agent.ts` — stub Product-Owner / Decision Oracle. Export:
   ```ts
   export interface AskQuestion {
     question: string; header: string;
     options: { label: string; description: string }[];
     multiSelect?: boolean;
   }
   export interface PoAnswer { answers: Record<string, string | string[]>; confident: boolean }
   export function answerQuestions(questions: AskQuestion[], brief: Brief): PoAnswer
   ```
   Logic (rule-based, deterministic — NO LLM call in B):
   - For each question, try to match by lowercased `header` or `question` text against
     `brief.decisions` keys (substring match). If a hint matches an option `label`
     (case-insensitive), select that label. Else select the first option's label.
   - `confident` = true only if EVERY question matched a brief hint to an actual option.
     If any question fell back to "first option", `confident = false`.
   - For `multiSelect` questions return an array (single element is fine for B).
   - Key of `answers` = the question's `question` field. Value = selected option `label`(s).

6. `src/conductor.ts` — the headless driver. Export `runConductor(prompt: string): Promise<ConductorResult>`.
   - Import `query` (and types) from `@anthropic-ai/claude-agent-sdk`.
   - Build options:
     - `permissionMode: "bypassPermissions"`
     - `canUseTool: async (toolName, input) => { ... }`
   - canUseTool contract (CRITICAL — verified against docs.claude.com 2026-06-17):
     - If `toolName === "AskUserQuestion"`:
       - `input.questions` is the array of `AskQuestion`.
       - Call `answerQuestions(input.questions, BRIEF)`.
       - If `confident`: return
         `{ behavior: "allow", updatedInput: { questions: input.questions, answers } }`
         (TS equivalent of Python `PermissionResultAllow(updated_input={questions, answers})`;
         key = question text, value = chosen option label, array for multiSelect).
       - If NOT confident: return the **defer** decision so the process can exit and resume
         (escalation hatch). Use the SDK's defer/permission-deny-with-defer shape — consult the
         installed `@anthropic-ai/claude-agent-sdk` TypeScript types for the exact return object
         (e.g. `{ behavior: "deny", ... }` or a defer result); pick the one that maps to the
         documented `defer` hook decision. Record that an escalation occurred in the result.
     - Else (any other tool): return `{ behavior: "allow", updatedInput: input }`.
   - Track and return: `{ asked: number; answered: number; deferred: number; promptedHuman: boolean; finalText: string }`.
     `promptedHuman` MUST be false on success (no terminal prompt ever shown — the callback
     answers programmatically).
   - Stream the async iterator from `query()`, capture the final result text.
   - Guard: if `process.env.ANTHROPIC_API_KEY` is unset, throw a clear error telling the caller
     to set it (the integration run needs it).

7. `src/proof.ts` — entry (`npm run proof`).
   - Calls `runConductor` with a prompt in PLAN MODE that naturally induces a clarifying question,
     e.g. ask Claude to plan a small feature with an intentionally ambiguous choice (output format /
     database) so it calls `AskUserQuestion`. Add `permissionMode: "plan"` for this run if that makes
     AskUserQuestion more likely (plan mode is where clarifying questions are common per docs).
   - Print a PROOF REPORT: asked / answered / deferred / promptedHuman / first 200 chars of finalText.
   - Exit 0 if `promptedHuman === false` AND `answered + deferred === asked` AND `asked >= 0`.
     Exit 1 otherwise. If no API key, print SKIP and exit 0 (unit test still covers the seam).

8. `src/po-agent.test.ts` — vitest unit proof (deterministic, NO API key needed). This is the
   guaranteed evidence:
   - Given a single-select question whose header matches a BRIEF hint pointing to an existing
     option label → `answerQuestions` returns that label as the answer and `confident === true`.
   - Given a question with NO matching BRIEF hint → falls back to first option AND `confident === false`
     (this is what triggers `defer`).
   - Given a `multiSelect` question → answer value is an array.
   - Assert the `answers` map is keyed by the question's `question` text.

9. `README.md` — explain: what B proves, the canUseTool→answers contract (with the
   `{ behavior: "allow", updatedInput: { questions, answers } }` snippet), how defer = escalation,
   the Headless-to-PR boundary, and how to run (`npm i`, `npm run proof:unit`, `npm run proof`).

## Validation (run these, fix until green)
- `npm install`
- `npm run typecheck`  → no errors
- `npm run proof:unit` → all vitest tests pass (this is the deterministic proof gate)
- `npm run proof`      → if ANTHROPIC_API_KEY set: completes with `promptedHuman: false`;
                         if unset: prints SKIP and exits 0.

## Rules
- Touch ONLY `harness/autonomous/`. Do NOT commit, push, or merge — leave changes in the working
  tree for review. Do NOT add a real LLM call inside po-agent for B (keep it rule-based/deterministic).
- Verify the exact `canUseTool` return types against the INSTALLED `@anthropic-ai/claude-agent-sdk`
  TypeScript type definitions — do not invent field names. The `answers`-in-`updatedInput` mechanism
  for AskUserQuestion and the `defer` decision are both documented; match the SDK's actual types.
