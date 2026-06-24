# Plan: Build B — Runner abstraction + doubt loop + GPT-5.5 proof

## Goal
Make the ADLC lifecycle run on ANY runner/model. Prove GPT-5.5 (via Codex, OpenAI-only auth) runs a
Claude skill headless: conductor loads the skill markdown → injects BRIEF (proactive) → model
self-resolves → ELICIT catches residual doubts → PO-agent answers from BRIEF / escalates → zero human.
Skills path is CONFIGURABLE (default `.claude/skills`) so a later move to a neutral `adlc/` folder is trivial.

## Scope — create ONLY under `harness/autonomous/`. Do not touch anything else.

### Runner layer
1. `src/runners/runner.ts`
   - `export interface RunResult { text: string; ok: boolean; runner: string }`
   - `export interface RunOpts { cwd: string; allowEdits?: boolean }`
   - `export interface Runner { name: string; runHeadless(prompt: string, opts: RunOpts): Promise<RunResult> }`

2. `src/runners/codex.ts` — `export class CodexRunner implements Runner` (name `"codex"`).
   - Constructor takes `{ model: string }` (default `"gpt-5.5"`).
   - `runHeadless`: spawn (node `child_process.spawn`, NOT shell-string) :
     `codex exec -m <model> -s workspace-write -C <cwd> --output-last-message <tmpfile> <prompt>`.
     If `allowEdits === false`, use `-s read-only` instead of `workspace-write`.
     Read the tmpfile for final text; `ok` = exit code 0 and non-empty text. Capture stderr on failure.
     Use a tmp path under `os.tmpdir()` unique per call (index/label, NOT Date/random).

3. `src/runners/opencode.ts` — `export class OpencodeRunner implements Runner` (name `"opencode"`).
   - Constructor `{ model: string }` e.g. `"openai/gpt-5.5"` or `"openrouter/moonshotai/kimi-k2"`.
   - `runHeadless`: spawn `opencode run -m <model> --dangerously-skip-permissions --format json --dir <cwd> <prompt>`.
     Parse JSON event stream; concatenate the final assistant text. `ok` = exit 0 and non-empty text.

4. `src/runners/claude.ts` — `export class ClaudeRunner implements Runner` (name `"claude"`).
   - Wraps the existing `runConductor` from `../conductor.js`. `runHeadless` calls it with the prompt;
     map `ConductorResult.finalText` → `text`, `ok` = finalText non-empty. Throws clear error if no
     `ANTHROPIC_API_KEY` (inherited from conductor).

### Skills loader (the portability layer for non-`.claude` runners)
5. `src/skills.ts`
   - `export function loadSkill(name: string, skillsDir: string): string` — reads
     `<skillsDir>/<name>/SKILL.md`, returns its markdown. Throw if missing.
   - `export function listSkills(skillsDir: string): string[]`.
   - Default `skillsDir` resolved relative to repo root; callers pass it from config.

### Doubt loop (runner-neutral)
6. `src/doubt-loop.ts`
   - `export function buildProactivePrompt(skillText: string, task: string, brief: Brief): string`
     — compose: the skill instructions + the task + a serialized BRIEF + the directive:
     "Resolve every decision from the BRIEF above. Do NOT ask the user. If a decision is genuinely
     not answerable from the BRIEF, list it under a final `## UNRESOLVED` section; do not guess."
   - `export interface ElicitResult { unresolved: string[]; text: string }`
   - `export function parseUnresolved(modelText: string): string[]` — extract bullet lines under an
     `## UNRESOLVED` heading (empty array if none).
   - `export async function runSkillWithDoubts(args): Promise<DoubtRunResult>` where args =
     `{ runner: Runner; skillName: string; skillsDir: string; task: string; brief: Brief; poAnswer: (q: string, brief: Brief) => { answer?: string; confident: boolean }; cwd: string }`.
     Flow:
       a. proactive prompt → `runner.runHeadless` → text.
       b. `parseUnresolved(text)` → residual questions.
       c. for each residual: call `poAnswer(q, brief)`. If `confident` and `answer` → collect; else → escalate.
       d. if any answered residuals: re-run once with answers appended (INJECT). If any escalations:
          mark `escalated` and STOP (do not guess).
     Return `{ ranOn: runner.name; elicited: number; answered: number; escalated: string[]; text: string; ok: boolean }`.

### PO-agent (extend existing)
7. `src/po-agent.ts` — keep existing `answerQuestions`. ADD:
   - `export function poAnswerOne(question: string, brief: Brief): { answer?: string; confident: boolean }`
     — substring-match the question against `brief.decisions` keys; if matched return the decision value
     + `confident: true`; else `{ confident: false }` (→ triggers escalation). Deterministic, no LLM in B.

### Router + config
8. `runners.config.json` (repo-root-relative `skillsDir`):
   ```json
   {
     "skillsDir": ".claude/skills",
     "priority": ["codex", "opencode", "claude"],
     "runners": {
       "codex":    { "kind": "codex",    "model": "gpt-5.5" },
       "opencode": { "kind": "opencode", "model": "openai/gpt-5.5" },
       "claude":   { "kind": "claude" }
     },
     "budgets": { "codex": null, "opencode": null, "claude": null }
   }
   ```
9. `src/router.ts`
   - `export function buildRunner(name, config): Runner` (factory by kind).
   - `export async function runWithFallback(task, skillName, config, brief, cwd): Promise<DoubtRunResult>`
     — iterate `config.priority`; build runner; `runSkillWithDoubts`; if it throws or `ok===false`
     (e.g. quota/auth), log and try the next; return the first success. If all fail, throw with a summary.

### Proof entry (the live GPT-5.5 demonstration)
10. `src/proof-gpt.ts` (`npm run proof:gpt`)
    - Build a BRIEF with SOME decisions present and ONE intentionally absent, e.g.
      `{ decisions: { format: "Summary", storage: "Postgres" }, project: "notes feature" }`.
    - task = "Plan a small notes feature: decide output format, storage, and retention policy."
      (format+storage resolvable from BRIEF; retention is the intentional gap → must escalate.)
    - Force the codex (GPT-5.5) runner directly (not fallback) to PROVE GPT-5.5 specifically.
      Use a tiny inline skill if no real skill is suitable: create `harness/autonomous/fixtures/mini-plan/SKILL.md`
      with brief planning instructions, and point `skillsDir` at `harness/autonomous/fixtures` for the proof.
    - Run `runSkillWithDoubts` with `poAnswerOne`. Print PROOF REPORT: ranOn, elicited, answered,
      escalated[], ok, first 300 chars of text.
    - Exit 0 if `ranOn === "codex"` AND it ran with no human prompt AND (answered>0 OR escalated.length>0)
      — i.e., GPT-5.5 ran a skill headless and the doubt loop functioned. If `codex` unavailable/auth
      fails, print SKIP and exit 0.

### Tests (deterministic, no network) `src/*.test.ts`
11. `src/doubt-loop.test.ts` — `parseUnresolved` extracts bullets under `## UNRESOLVED`; returns [] when absent.
12. `src/po-agent.test.ts` — keep existing 3; ADD: `poAnswerOne` returns answer+confident for a matched
    key, and `{confident:false}` for an unmatched question.
13. `src/skills.test.ts` — `loadSkill` reads a fixture SKILL.md; throws on missing.

### Docs
14. Update `harness/autonomous/README.md`: add the runner table, the doubt loop (proactive→ELICIT→answer→
    escalate), `runners.config.json`, how Codex/opencode reach Claude skills (conductor inline; opencode
    native `.claude`; configurable `skillsDir`), and how to run `npm run proof:gpt`.

## package.json scripts to add
- `"proof:gpt": "tsx src/proof-gpt.ts"`
- keep `proof`, `proof:unit` (vitest now covers new tests too), `typecheck`.

## Validation (run, fix until green)
- `npm install`
- `npm run typecheck`
- `npm run proof:unit`  (all vitest pass)
- `npm run proof:gpt`   (if codex+gpt-5.5 reachable: runs live, ranOn=codex; else SKIP)

## Rules
- Touch ONLY `harness/autonomous/`. Do NOT commit/push/merge. Use `child_process.spawn` with arg arrays
  (no shell string interpolation of the prompt). No `Date.now()`/`Math.random()` for tmp names — derive
  from a passed label/index. Keep po-agent deterministic (no real LLM call) for B.
- Verify SDK/types against installed packages. If npm has no network, author all files correctly and note it.
