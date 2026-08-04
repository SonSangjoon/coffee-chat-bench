# Coffee Chat Bench

Candidate-agnostic benchmark for [Coffee Chat](https://github.com/SonSangjoon/coffee-chat)
and other AI systems.

Public subtitle: **Benchmarking viewpoint-conditioned value selection in AI
systems.**

The benchmark asks whether a candidate can infer a target's value boundary from
sparse evidence and turn many factually valid alternatives into a useful,
context-conditioned selection, exclusion, ranking, or hold decision. It is
separate from Coffee Chat implementation tests: those verify internal product
contracts, while this repository measures external value, utility, and
efficiency.

The canonical repository and remote are `coffee-chat-bench`.

## Implemented benchmark foundation

The first vertical slice now measures **viewpoint-conditioned value
selection** through a candidate-agnostic contract:

- `src/taste.ts` defines factually supported candidates, target evidence,
  controls, select/rank/exclude/hold/ask decisions, and sealed judgment data.
- `src/taste-evaluator.ts` reports selection, exclusion, hold/ask, criterion,
  evidence support, utility, utility-surface, viewpoint-lift, and pairwise
  contrast dimensions separately. Unavailable control comparisons are marked
  unmeasured rather than treated as zero.
- `src/taste-runner.ts` projects sealed episodes into public generic cases,
  runs them through the existing lifecycle runner, and attaches pairwise
  invariance/sensitivity scores to the generic report.
- `src/pilot.ts` contains generic selection, control, hold, contrast, and
  held-out transfer fixtures.

The candidate receives only the public episode projection. Sealed acceptable
decisions, utility values, and omission costs remain evaluator-side. A valid
choice that ignores the target can still be factually correct, but it does not
receive the same viewpoint lift as a target-matched choice.

This is a measurement foundation, not yet a validated public leaderboard. Human
panel calibration, independent real-world outcome validation, and efficiency
instrumentation remain required before making a broad Taste claim.

Run the foundation checks with:

```text
npm install
npm test
npm run typecheck
```
