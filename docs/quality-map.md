# Coffee Chat Bench Quality Map

Owner-maintained map for the candidate-agnostic benchmark repository.

## Owner

`coffee-chat-bench` repository maintainers.

## Scope and objective

This repository owns candidate-agnostic benchmark contracts, sealed judgment,
controls, baselines, scoring logic, and validity evidence. It does not own
Coffee Chat product implementation tests, candidate-specific private internals,
or the full evaluation report.

Primary objective: measure stakeholder-conditioned judgment under
underspecified objectives through observable, reproducible, candidate-agnostic
contracts.

## Quality dimensions

| Dimension | Requirement | Observable oracle |
|---|---|---|
| Contract integrity | Public candidate-visible inputs stay separate from sealed judgment and evaluator-only answers. | `test/taste-contract.test.ts`, `test/schema-consistency.test.ts`, `test/taste-runner.test.ts` |
| Task/reference/verifier/metric separation | Task prompt, factual references, verifier logic, and metric calculations remain distinct artifacts. | `src/taste.ts`, `src/taste-evaluator.ts`, `src/taste-runner.ts` and their tests |
| Candidate agnosticism | Cases, fixtures, and reports do not depend on Coffee Chat private internals or candidate-specific implementation hooks. | `README.md`, repository boundaries, generic runner tests |
| Control and baseline honesty | Matched controls, pair cases, and baselines stay explicit; absent comparisons remain unmeasured. | `test/taste-evaluator.test.ts`, `test/pilot.test.ts`, `test/taste-runner.test.ts` |
| Provenance and versioning | Schema version, suite version, candidate identity, and run/report metadata remain explicit and reproducible. | `schemas/*.json`, `src/runner.ts`, `test/schema-consistency.test.ts` |
| Status integrity | Missing, skipped, invalid, failed, conditional, and unmeasured states stay distinct and never collapse into zero or omission. | `src/runner.ts`, `src/taste-evaluator.ts`, `docs/engineering/provenance-and-versioning.md` |

## Acceptance criteria

1. Candidate-visible cases exclude sealed judgment fields and any evaluator-only
   answer key.
2. Sealed judgments define acceptable decisions, criterion anchors, candidate
   utility, and omission cost without leaking into public schemas.
3. Benchmark contract tests and fixture tests validate repository-owned rules;
   they do not count as actual candidate benchmark runs.
4. Controls, baselines, invariance pairs, and sensitivity pairs are explicit
   when a claim depends on them.
5. Metric calculations are independently testable and keep unmeasured
   comparisons unmeasured.
6. Result provenance includes versioned schemas/suites plus candidate and run
   identity fields needed for audit.
7. Missing, skipped, invalid, unavailable, failed, and unmeasured states remain
   explicit in code and reporting.

## Failure modes to prevent

| Failure mode | Why it matters | Prevention oracle |
|---|---|---|
| Sealed judgment leaks into candidate-visible inputs | Turns a benchmark into an answer-key handoff. | Public schema/runtime separation tests |
| Product-private internals influence benchmark credit | Breaks candidate agnosticism and eval independence. | Repository boundary rules and generic adapter tests |
| Contract/fixture tests are reported as benchmark performance | Overstates evidence tier. | This map, README status, and test classification |
| Missing control data becomes zero | Fabricates lift or regression. | Unmeasured control-lift tests |
| Verifier failure is merged into candidate failure | Obscures the failure boundary. | Runner failure-state tests |
| Missing/skipped/invalid/unmeasured results are omitted silently | Makes reports dishonest. | Result-state rules in runner/docs |
| Version/provenance fields drift or disappear | Breaks reproducibility and auditing. | Schema consistency tests |

## Observable oracles and evidence tiers

| Tier | What counts | What it proves | What it does not prove |
|---|---|---|---|
| Tier 1: contract tests | Schema/runtime validation, sealed/public separation, result-shape checks | Repository contracts are enforced locally. | Candidate capability or benchmark validity in the wild |
| Tier 2: fixture tests | Generic adapters, deterministic cleanup/failure, pilot fixtures, pair handling | Harness-facing benchmark behavior is stable and inspectable. | Real candidate performance |
| Tier 3: benchmark runs | Actual candidate executions against declared public cases with sealed evaluation | Candidate measurement on the benchmark construct | Product implementation correctness |
| Tier 4: validity evidence | Calibration, discriminant/incremental validity, real-world outcome linkage, cost/efficiency evidence | Whether the benchmark deserves portfolio-level trust | Internal implementation details |

Contract and fixture tests are repository QA evidence only. Actual candidate
runs require the complete measurement path and must remain separate from these
local checks.

## Representative suites

| Suite | Purpose |
|---|---|
| `test/taste-contract.test.ts` | Episode contract, runtime validation, sealed/public separation |
| `test/schema-consistency.test.ts` | Schema alignment, report shape, public schema exclusions |
| `test/taste-evaluator.test.ts` | Metric separation, control lift, hold handling, pairwise logic |
| `test/taste-runner.test.ts` | Candidate-visible projection, metric-vector preservation, pair reporting |
| `test/foundation.test.ts` | Deterministic runner failure boundaries and cleanup |
| `test/pilot.test.ts` | Representative public/control/hold/held-out fixtures and pair structure |
| `test/suite.test.ts` | Reproducible generic suite execution order and deterministic gates |

## Gates and cost

| Gate | Minimum evidence | Cost/notes |
|---|---|---|
| Owner-change gate | README/source/tests inspected; Quality Map updated when repository quality rules change | Low |
| Local verification gate | `npm test` and `npm run typecheck` pass in `coffee-chat-bench` | Low to medium |
| Benchmark activation gate | Coverage gap, narrower construct, sealed cases, controls/baselines, calibration, validity studies, reproducible execution, efficiency telemetry | High |
| Candidate-performance claim gate | Actual candidate run with sealed evaluation and preserved provenance | Medium to high |

## Benchmark contract tests versus candidate runs

- Benchmark contract/fixture tests:
  - validate schemas, runtime contracts, fixtures, scoring, cleanup, and
    failure boundaries;
  - may use controlled fake adapters or pilot episodes;
  - are not candidate scores and must not appear as benchmark performance.

- Actual candidate runs:
  - execute a real candidate through the public benchmark interface;
  - receive only candidate-visible inputs;
  - are judged with sealed evaluator-side references and metrics;
  - must preserve provenance, cost, and result state honestly.

## Separation rules

- Candidate-visible surface: task prompt, public factual evidence, allowed
  actions, candidate list, explicit public metadata.
- Sealed judgment surface: acceptable decisions, criterion tags, utility,
  omission cost, and evaluator-only comparison data.
- Task/reference/verifier/metric separation:
  - task = what the candidate is asked to do;
  - reference = declared public evidence and evaluator-side sealed judgment;
  - verifier = repository logic that validates and scores outputs;
  - metric = reported dimensions such as selection, exclusion, criterion,
    evidence support, utility, hold/ask, and control lift.

## Status handling rules

- `measured` means the required comparison actually ran.
- `unmeasured` means a comparison or metric was not available and must not
  become zero.
- `skipped` means execution intentionally did not run.
- `invalid` means malformed input/output or broken contract.
- `failed` means the candidate or harness hit an execution failure boundary.
- `conditional` and `not active` remain explicit portfolio/report states where
  applicable.

Missing or unavailable data must remain observable and explained rather than
silently dropped.
