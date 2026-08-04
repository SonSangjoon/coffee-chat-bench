import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  runEvaluationCase,
  type CandidateAdapter,
} from "../src/runner.ts";
import {
  createTasteSemanticEvaluator,
  runTasteSuite,
  tasteEpisodeToEvalCase,
} from "../src/taste-runner.ts";
import { PILOT_EPISODES } from "../src/pilot.ts";
import type { TasteDecision } from "../src/taste.ts";

const episode = PILOT_EPISODES.find(({ episode_id }) => episode_id === "pilot-selection-taste")!;
const expectedDecision = episode.sealed_judgment.acceptable_decisions[0].decision;

describe("Taste runner integration", () => {
  it("passes only the public episode to a generic candidate adapter", async () => {
    const testCase = tasteEpisodeToEvalCase(episode);
    let observedInput: unknown;
    const adapter: CandidateAdapter = {
      adapter_version: "fixture-0.1.0",
      candidate_identity: {
        candidate_id: "taste-fixture",
        version: "0.1.0",
        source_ref: "fixture",
      },
      async prepare(candidateCase) {
        observedInput = candidateCase.explicit_inputs;
        return { case_id: candidateCase.case_id, sandbox_id: "taste-sandbox" };
      },
      async invoke() {
        return { handle_id: "taste-handle" };
      },
      async collect_output() {
        return expectedDecision;
      },
      async collect_evidence() {
        return expectedDecision.evidence_refs.map((source_id) => ({
          source_id,
          claim: "fixture evidence",
        }));
      },
      async collect_actions() {
        return [];
      },
      async collect_trace() {
        return [{ type: "decision", detail: expectedDecision.action }];
      },
      async cleanup() {
        return { status: "clean" };
      },
    };

    const result = await runEvaluationCase(testCase, adapter, {
      semanticEvaluator: createTasteSemanticEvaluator(episode, {
        matched_control_utility: 0.6,
        extractDecision: (output) => output as TasteDecision,
      }),
    });

    assert.equal("sealed_judgment" in (observedInput as object), false);
    assert.equal(
      JSON.stringify(testCase.quality_rubric).includes("viewpoint_lift"),
      false,
    );
    assert.equal(result.semantic.status, "passed");
    if (result.semantic.status === "passed") {
      assert.ok(Math.abs(result.semantic.dimensions.viewpoint_lift.score - 0.3) < 1e-9);
      assert.equal(result.semantic.dimensions.selection.score, 1);
    }
  });

  it("runs a candidate-agnostic suite and preserves the metric vector", async () => {
    const episodes = PILOT_EPISODES.filter(({ episode_id }) =>
      ["pilot-selection-taste", "pilot-selection-knowledge-only", "pilot-hold"].includes(episode_id),
    );
    const decisions = new Map(
      episodes.map((candidateEpisode) => [
        candidateEpisode.episode_id,
        candidateEpisode.sealed_judgment.acceptable_decisions[0].decision,
      ]),
    );
    let currentCaseId = "";
    const adapter: CandidateAdapter = {
      adapter_version: "suite-fixture-0.1.0",
      candidate_identity: {
        candidate_id: "taste-suite-fixture",
        version: "0.1.0",
        source_ref: "fixture",
      },
      async prepare(candidateCase) {
        currentCaseId = candidateCase.case_id;
        return { case_id: candidateCase.case_id, sandbox_id: currentCaseId };
      },
      async invoke() {
        return { handle_id: currentCaseId };
      },
      async collect_output() {
        return decisions.get(currentCaseId);
      },
      async collect_evidence() {
        return [];
      },
      async collect_actions() {
        return [];
      },
      async collect_trace() {
        return [{ type: "decision", detail: currentCaseId }];
      },
      async cleanup() {
        return { status: "clean" };
      },
    };

    const report = await runTasteSuite(episodes, adapter, {
      run_id: "taste-pilot-run",
      extractDecision: (output) => output as TasteDecision,
      matched_control_utility: {
        "pilot-selection-taste": 0.6,
        "pilot-selection-knowledge-only": 0.6,
        "pilot-hold": 0.4,
      },
    });

    assert.equal(report.summary.total, 3);
    assert.equal(report.status, "passed");
    assert.equal(report.score_vector.selection.cases, 3);
    assert.equal(report.score_vector.viewpoint_lift.cases, 3);
  });

  it("adds pairwise invariance and sensitivity to the generic report", async () => {
    const episodes = PILOT_EPISODES.filter(({ episode_id }) =>
      [
        "pilot-invariance-anchor",
        "pilot-invariance-contrast",
        "pilot-sensitivity-anchor",
        "pilot-sensitivity-contrast",
      ].includes(episode_id),
    );
    const decisions = new Map(
      episodes.map((candidateEpisode) => [
        candidateEpisode.episode_id,
        candidateEpisode.sealed_judgment.acceptable_decisions[0].decision,
      ]),
    );
    let currentCaseId = "";
    const adapter: CandidateAdapter = {
      adapter_version: "pair-fixture-0.1.0",
      candidate_identity: {
        candidate_id: "pair-fixture",
        version: "0.1.0",
        source_ref: "fixture",
      },
      async prepare(candidateCase) {
        currentCaseId = candidateCase.case_id;
        return { case_id: currentCaseId, sandbox_id: currentCaseId };
      },
      async invoke() {
        return { handle_id: currentCaseId };
      },
      async collect_output() {
        return decisions.get(currentCaseId);
      },
      async collect_evidence() {
        return [];
      },
      async collect_actions() {
        return [];
      },
      async collect_trace() {
        return [{ type: "decision", detail: currentCaseId }];
      },
      async cleanup() {
        return { status: "clean" };
      },
    };

    const report = await runTasteSuite(episodes, adapter, {
      run_id: "pair-fixture-run",
      extractDecision: (output) => output as TasteDecision,
    });

    assert.equal(report.score_vector.pairwise.cases, 2);
    assert.equal(report.score_vector.pairwise.mean, 1);
  });
});
