# Permission Matrix — command × role

✅ = may run · ⚠️ = may run, output is non-merging/advisory · ❌ = not their role

| Command / action | BA | Auto (Codex) | QA | Developer |
|---|----|----|----|----|
| `/prime` | ✅ | ✅ | ✅ | ✅ |
| `/create-prd` | ✅ | ❌ | ❌ | ✅ |
| `/create-rules` | ✅ | ❌ | ❌ | ✅ |
| `/plan-feature` | ✅ | ❌ | ⚠️ | ✅ |
| `/implement-codex` (dispatch Codex) | ⚠️ | ✅ | ❌ | ✅ |
| `/qa-plan` | ⚠️ | ❌ | ✅ | ✅ |
| `/qa-run` | ❌ | ❌ | ✅ | ✅ |
| `/add-regression` | ❌ | ❌ | ✅ | ✅ |
| `/code-review` | ❌ | ❌ | ❌ | ✅ |
| `/commit` | ✅ | ✅ | ✅ | ✅ |
| **Approve PR / merge to `main`** | ❌ | ❌ | ❌ | ✅ |
| **`/deploy preview`** | ✅ | ✅ | ✅ | ✅ |
| **`/deploy prod` / `/rollback`** | ⚠️ trigger only | ❌ | ⚠️ trigger only | ✅ |
| **Edit AI layer** (`CLAUDE.md`, `.agents/reference/*`, commands) | ⚠️ propose | ❌ | ⚠️ propose | ✅ |

Notes:
- ⚠️ on `/implement-codex` for BA: a BA may kick off implementation of an approved plan, but the
  result is still a PR that only a developer can merge — so it's safe.
- ⚠️ on `/deploy prod`: BA/QA can trigger it, but the gate only passes for code a developer
  already merged. Triggering ≠ bypassing review.
- AI-layer edits are developer-owned by default (transcript: humans keep tight control of the AI
  layer); BA/QA *propose* changes via `/add-regression`'s evolve step.
- These are conventions; the hard guarantee is branch protection + CODEOWNERS (see `ROLES.md`).
