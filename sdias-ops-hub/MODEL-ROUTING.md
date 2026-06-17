# Model Routing — best outcome / cost (ADLC hybrid)

**Hard rule: Claude writes NO code — app code or test code. Every line is produced by Codex
GPT-5.5.** Claude only plans, dispatches, reviews diffs, and writes corrective prompts. Fixes,
including one-liners, go back through Codex.

Principle: spend expensive **judgment** tokens (Claude) on planning + review where a wrong
decision costs hundreds of code lines; spend cheap **throughput** tokens (Codex GPT-5.5) on
bulk implementation, where the rich plan has already removed ambiguity.

> One bad line of code = one bad line. One bad line of plan = ~100 bad lines of code.
> So pay for the plan and the review; economize on the typing.

## Routing table

| Lifecycle stage | Command | Model | Why |
|-----------------|---------|-------|-----|
| Prime | `/prime` | Claude **Sonnet** | fast context load, low stakes |
| PRD / architecture | `/create-prd`, `/create-rules` | Claude **Opus 4.8** | highest-leverage judgment; fewest bad-plan lines |
| Feature planning | `/plan-feature` | **Opus** (complex) / **Sonnet** (routine) | plan quality gates everything downstream |
| **Implement (code)** | `/implement-codex` | **Codex GPT-5.5** | cheap coding throughput; plan removes ambiguity |
| QA test design | `/qa-plan` | Claude **Sonnet** | reasoning over journeys, moderate stakes |
| QA regression run | `/qa-run` | **none (Playwright/vitest)** | deterministic, zero LLM tokens in CI |
| Test discovery (cases only) | `qa-agent` (agent-browser) | Claude **Sonnet** | discovers journeys; the Playwright spec *code* is written by Codex |
| Code review (gate) | `/code-review` | Claude **Opus/Sonnet** | catches what Codex misses; cheap insurance |
| Cheap mechanical edits | `/implement-codex` | **Codex GPT-5.5** | even one-liners — Claude never edits code |
| **Design generation** | (Figma/Claude design) | Claude design | **expensive — batch on weekends, capture once as `.dc.html`, never regenerate weekdays** |

## Config
- Codex model id: env `CODEX_MODEL` (default `gpt-5.5-codex`). Verify the id exists in your
  `codex` install before relying on it; do not silently fall back to a weaker model.
- Claude model per stage: set by whoever runs the command (Opus for hard, Sonnet for routine).

## Cost levers (why this is cheap)
1. **Plan once, implement cheap** — Opus writes a plan so complete that Codex one-passes it.
2. **Regression = $0 tokens** — Playwright/vitest run in CI deterministically; only initial
   test *authoring* costs LLM tokens.
3. **Design captured, not regenerated** — design artifacts (`.dc.html`/Figma) are produced in
   weekend batches and reused as functional-requirements input; weekday builds read them, never
   re-prompt the expensive design model.
4. **Review is insurance, not rework** — a cheap Claude review pass prevents expensive
   multi-round Codex rebuilds.
