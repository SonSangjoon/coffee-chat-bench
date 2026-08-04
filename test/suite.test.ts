import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  runEvaluationSuite,
  type CandidateAdapter,
  type EvalCase,
  type SemanticEvaluator,
} from "../src/runner.ts";

const makeCase = (caseId: string, capability: string): EvalCase => ({
  schema_version: "1.0.0",
  suite_version: "0.1.0",
  case_id: caseId,
  capability,
  task: `Task ${caseId}`,
  starting_context: {},
  explicit_inputs: { case_id: caseId },
  declared_evidence: [{ source_id: "source-a", content: "Evidence." }],
  expected_capabilities: [capability],
  forbidden_behaviors: [],
  allowed_actions: ["read-source"],
  quality_rubric: [
    {
      id: capability,
      description: `Score ${capability}.`,
      scale: { min: 0, max: 3 },
    },
  ],
  evaluation_methods: ["deterministic", "semantic"],
});

const adapter: CandidateAdapter = {
  adapter_version: "adapter-0.1.0",
  candidate_identity: {
    candidate_id: "suite-candidate",
    version: "0.1.0",
    source_ref: "fixture",
  },
  async prepare(testCase) {
    return { case_id: testCase.case_id, sandbox_id: testCase.case_id };
  },
  async invoke() {
    return { handle_id: "handle" };
  },
  async collect_output() {
    return "output";
  },
  async collect_evidence() {
    return [{ source_id: "source-a", claim: "Supported." }];
  },
  async collect_actions() {
    return [{ name: "read-source", target: "source-a" }];
  },
  async collect_trace() {
    return [{ type: "read", detail: "source-a" }];
  },
  async cleanup() {
    return { status: "clean" };
  },
};

describe("generic evaluation suite", () => {
  it("runs semantic evaluation only after deterministic gates pass", async () => {
    const calls: string[] = [];
    const semanticEvaluator: SemanticEvaluator = {
      async evaluate({ testCase }) {
        calls.push(testCase.case_id);
        return {
          status: "passed",
          dimensions: {
            [testCase.capability]: {
              score: 3,
              max: 3,
              rationale: "The fixture preserves the capability.",
            },
          },
        };
      },
    };

    const report = await runEvaluationSuite(
      [makeCase("case-a", "grounding"), makeCase("case-b", "context-fit")],
      adapter,
      { run_id: "run-1", semanticEvaluator },
    );

    assert.equal(report.status, "passed");
    assert.deepEqual(calls, ["case-a", "case-b"]);
    assert.deepEqual(report.summary, {
      total: 2,
      passed: 2,
      failed: 0,
      deterministic_failures: 0,
      semantic_failures: 0,
    });
    assert.deepEqual(report.score_vector, {
      "context-fit": { mean: 3, max: 3, cases: 1 },
      grounding: { mean: 3, max: 3, cases: 1 },
    });
  });

  it("uses a reproducible seeded order without knowing capability names", async () => {
    const order: string[] = [];
    const recordingAdapter: CandidateAdapter = {
      ...adapter,
      async prepare(testCase) {
        order.push(testCase.case_id);
        return { case_id: testCase.case_id, sandbox_id: testCase.case_id };
      },
    };

    const cases = [
      makeCase("case-a", "one"),
      makeCase("case-b", "two"),
      makeCase("case-c", "three"),
      makeCase("case-d", "four"),
    ];
    const first = await runEvaluationSuite(cases, recordingAdapter, {
      run_id: "run-2",
      order: "seeded",
      seed: "fixed-seed",
    });
    const firstOrder = [...order];
    order.length = 0;
    const second = await runEvaluationSuite(cases, recordingAdapter, {
      run_id: "run-3",
      order: "seeded",
      seed: "fixed-seed",
    });

    assert.deepEqual(order, firstOrder);
    assert.deepEqual(first.execution_order, second.execution_order);
  });
});
