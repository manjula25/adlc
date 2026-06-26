---
name: receiving-code-review
description: Act on REVIEW findings — fix every requested change in the working tree, then hand back for re-review. The remediation half of the review loop. Adapted for the ADLC harness in the spirit of Matt Pocock's receiving-code-review skill.
---

# receiving-code-review

The remediation step the conductor runs when the REVIEW gate returns **REQUEST CHANGES**. The
`review` skill only judges; this skill *acts on* its verdict so the next REVIEW pass can pass.

Input task carries the prior reviewer's report (its `## Standards` and `## Spec` findings) under a
`=== REVIEW FINDINGS ===` block. Treat each "Request changes" item as a defect to fix now.

## Process
1. **Parse the findings** — enumerate every blocking item from the `## Spec` and `## Standards`
   sections. Non-blocking "judgement calls" are optional; blocking "Request changes" are mandatory.
2. **Fix each one in code** — edit the working tree to satisfy the spec line / standard the finding
   cites. Do not argue the verdict; if a finding is genuinely wrong, fix the *spec ambiguity* or
   leave a one-line note, but never no-op a blocking item.
3. **Commit the implementation** — `git add -A && git commit -m "fix(review): apply review findings"`.
   The reviewer runs `git diff <base>...HEAD` (three-dot, committed history only) — staged-but-uncommitted
   changes are completely invisible to it and read as "nothing was fixed". If git is unavailable or
   the working tree is clean, note it in the output and skip.
4. **Keep the change minimal** — fix only what the findings name. No scope creep; that just earns a
   fresh Spec finding.
5. **Re-run local checks** if the sandbox allows (type-check / tests). Report what passed.

## Output
End with a short list of each finding and how it was addressed:
```
- [Spec] <finding> → <what changed>
- [Standards] <finding> → <what changed>
```
This is informational — there is no machine gate on this skill. The conductor re-runs the `review`
skill afterward; that re-review is the real gate.
