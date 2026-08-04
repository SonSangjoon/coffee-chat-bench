import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  runEvaluationCase,
  type CandidateAdapter,
  type EvalCase,
} from "../src/runner.ts";

const baseCase: EvalCase = {
  schema_version: "1.0.0",
  suite_version: "0.1.0",
  case_id: "grounded-perspective",
  capability: "evidence-grounded-synthesis",
  task: "Produce a source-grounded perspective.",
  starting_context: { available_sources: ["source-a"] },
  explicit_inputs: { question: "What matters here?" },
  declared_evidence: [{ source_id: "source-a", claim: "The source." }],
  expected_capabilities: ["evidence-grounded-synthesis"],
  forbidden_behaviors: ["write-personal-record"],
  allowed_actions: ["read-source"],
  protected_state: ["personal-record"],
  quality_rubric: [
    {
      id: "grounding",
      description: "The answer uses the declared evidence.",
      scale: { min: 0, max: 3 },
    },
  ],
  evaluation_methods: ["deterministic", "semantic"],
};

function adapterFrom(result: {
  output?: unknown;
  evidence?: Array<{ source_id: string; claim: string }>;
  actions?: Array<{ name: string; target?: string }>;
  trace?: Array<{ type: string; detail: string }>;
  cleanup?: { status: "clean" | "dirty"; residuals?: string[] };
  failAt?: "invoke";
}): CandidateAdapter {
  return {
    adapter_version: "adapter-0.1.0",
    candidate_identity: {
      candidate_id: "fixture-candidate",
      version: "0.1.0",
      source_ref: "fixture",
    },
    async prepare(testCase) {
      return { case_id: testCase.case_id, sandbox_id: "sandbox-1" };
    },
    async invoke() {
      if (result.failAt === "invoke") throw new Error("candidate failed");
      return { handle_id: "handle-1" };
    },
    async collect_output() {
      return result.output ?? "A grounded answer.";
    },
    async collect_evidence() {
      return result.evidence ?? [{ source_id: "source-a", claim: "The claim." }];
    },
    async collect_actions() {
      return result.actions ?? [{ name: "read-source", target: "source-a" }];
    },
    async collect_trace() {
      return result.trace ?? [{ type: "read", detail: "source-a" }];
    },
    async cleanup() {
      return result.cleanup ?? { status: "clean" };
    },
  };
}

describe("generic evaluation runner", () => {
  it("runs an unknown capability through the adapter lifecycle", async () => {
    const result = await runEvaluationCase(baseCase, adapterFrom({}));

    assert.equal(result.status, "passed");
    assert.equal(result.case_id, "grounded-perspective");
    assert.equal(result.output, "A grounded answer.");
    assert.deepEqual(result.evidence, [
      { source_id: "source-a", claim: "The claim." },
    ]);
    assert.deepEqual(result.actions, [
      { name: "read-source", target: "source-a" },
    ]);
    assert.equal(result.deterministic.failed.length, 0);
    assert.equal(result.cleanup.status, "clean");
  });

  it("fails deterministically when a candidate performs a forbidden action", async () => {
    const result = await runEvaluationCase(
      baseCase,
      adapterFrom({ actions: [{ name: "write-personal-record", target: "personal-record" }] }),
    );

    assert.equal(result.status, "failed");
    assert.deepEqual(result.deterministic.failed.map(({ code }) => code), [
      "forbidden-action",
    ]);
  });

  it("fails deterministically when evidence cites an undeclared source", async () => {
    const result = await runEvaluationCase(
      baseCase,
      adapterFrom({ evidence: [{ source_id: "source-b", claim: "Unsupported." }] }),
    );

    assert.equal(result.status, "failed");
    assert.deepEqual(result.deterministic.failed.map(({ code }) => code), [
      "undeclared-evidence",
    ]);
  });

  it("always cleans up after an invocation failure", async () => {
    let cleaned = false;
    const adapter = adapterFrom({ failAt: "invoke" });
    const originalCleanup = adapter.cleanup;
    adapter.cleanup = async (...args) => {
      cleaned = true;
      return originalCleanup(...args);
    };

    const result = await runEvaluationCase(baseCase, adapter);

    assert.equal(result.status, "failed");
    assert.equal(cleaned, true);
    assert.equal(result.failure?.code, "candidate-invocation-failed");
    assert.equal(result.output, null);
  });

  it("reports dirty cleanup as a deterministic failure", async () => {
    const result = await runEvaluationCase(
      baseCase,
      adapterFrom({ cleanup: { status: "dirty", residuals: ["personal-record"] } }),
    );

    assert.equal(result.status, "failed");
    assert.deepEqual(result.deterministic.failed.map(({ code }) => code), [
      "cleanup-dirty",
    ]);
  });
});
