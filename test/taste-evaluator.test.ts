import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateTasteContrast,
  evaluateTasteDecision,
} from "../src/taste-evaluator.ts";
import type { TasteDecision, TasteEpisode } from "../src/taste.ts";

const selectedA: TasteDecision = {
  action: "select",
  selected_ids: ["a"],
  excluded_ids: ["b"],
  criterion_tags: ["quiet-detail"],
  evidence_refs: ["target-1", "fact-a"],
};

const selectedB: TasteDecision = {
  action: "select",
  selected_ids: ["b"],
  excluded_ids: ["a"],
  criterion_tags: ["availability-first"],
  evidence_refs: ["target-1", "fact-b"],
};

function makeEpisode(
  decision: TasteDecision = selectedA,
  pair?: TasteEpisode["pair"],
): TasteEpisode {
  return {
    schema_version: "1.0.0",
    suite_version: "0.1.0",
    episode_id: "evaluator-case",
    evaluation_split: "public",
    capability: "viewpoint-conditioned-value-selection",
    task: "Choose a useful option.",
    context: { purpose: "shortlist" },
    factual_evidence: [
      { source_id: "fact-a", claim: "A is available." },
      { source_id: "fact-b", claim: "B is available." },
    ],
    target_evidence: [
      { source_id: "target-1", claim: "The target removes noisy options." },
    ],
    candidates: [
      { candidate_id: "a", label: "A", evidence_refs: ["fact-a"] },
      { candidate_id: "b", label: "B", evidence_refs: ["fact-b"] },
    ],
    control: {
      condition: "taste",
      matched_case_id: "evaluator-control",
      evidence_budget: 1,
    },
    allowed_actions: ["select", "rank", "exclude", "hold", "ask"],
    pair,
    sealed_judgment: {
      acceptable_decisions: [
        { decision_id: "quiet-choice", decision, utility: decision === selectedA ? 0.9 : 0.7 },
      ],
      criterion_tags: decision === selectedA ? ["quiet-detail"] : ["availability-first"],
      candidate_utility: { a: 0.9, b: 0.7 },
      omission_cost: { a: 0.2, b: 0.1 },
    },
  };
}

describe("Taste metric evaluator", () => {
  it("reports selection, criterion, evidence, utility, and control lift separately", () => {
    const evaluation = evaluateTasteDecision(makeEpisode(), selectedA, {
      matched_control_utility: 0.6,
    });

    assert.equal(evaluation.dimensions.selection.score, 1);
    assert.equal(evaluation.dimensions.exclusion.score, 1);
    assert.equal(evaluation.dimensions.hold_ask.score, 1);
    assert.equal(evaluation.dimensions.criterion.score, 1);
    assert.equal(evaluation.dimensions.evidence_support.score, 1);
    assert.equal(evaluation.dimensions.utility.score, 0.9);
    assert.ok(Math.abs(evaluation.dimensions.viewpoint_lift.score - 0.3) < 1e-9);
  });

  it("does not give a generic valid choice the same viewpoint lift as the target-matched choice", () => {
    const evaluation = evaluateTasteDecision(makeEpisode(), selectedB, {
      matched_control_utility: 0.6,
    });

    assert.equal(evaluation.dimensions.selection.score, 0);
    assert.ok(evaluation.dimensions.viewpoint_lift.score < 0.1);
    assert.ok(evaluation.dimensions.utility.score < 0.9);
  });

  it("treats a justified hold as a valid decision instead of a missing selection", () => {
    const hold: TasteDecision = {
      action: "hold",
      criterion_tags: [],
      evidence_refs: ["target-1"],
      uncertainty: { level: "high", note: "The evidence is underdetermined." },
    };
    const episode = makeEpisode(hold);
    const evaluation = evaluateTasteDecision(episode, hold);

    assert.equal(evaluation.dimensions.hold_ask.score, 1);
    assert.equal(evaluation.dimensions.selection.score, 1);
  });

  it("measures invariant and sensitive changes from pair metadata", () => {
    const anchor = {
      episode: makeEpisode(selectedA, {
        pair_id: "pair-1",
        role: "anchor",
        perturbation: "none",
        expected_relation: "same-decision",
      }),
      decision: selectedA,
    };
    const irrelevant = {
      episode: makeEpisode(selectedA, {
        pair_id: "pair-1",
        role: "contrast",
        perturbation: "irrelevant",
        expected_relation: "same-decision",
      }),
      decision: selectedA,
    };
    const relevant = {
      episode: makeEpisode(selectedB, {
        pair_id: "pair-1",
        role: "contrast",
        perturbation: "decision-relevant",
        expected_relation: "different-decision",
      }),
      decision: selectedB,
    };

    assert.equal(evaluateTasteContrast(anchor, irrelevant).score, 1);
    assert.equal(evaluateTasteContrast(anchor, relevant).score, 1);
  });
});
