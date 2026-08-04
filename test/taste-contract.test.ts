import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  toPublicTasteEpisode,
  validateTasteDecision,
  validateTasteEpisode,
  type TasteDecision,
  type TasteEpisode,
} from "../src/taste.ts";

const selectDecision: TasteDecision = {
  action: "select",
  selected_ids: ["candidate-a"],
  excluded_ids: ["candidate-b"],
  criterion_tags: ["quiet-detail"],
  evidence_refs: ["target-1", "fact-a", "fact-b"],
};

const episode: TasteEpisode = {
  schema_version: "1.0.0",
  suite_version: "0.1.0",
  episode_id: "selection-contrast-anchor",
  capability: "viewpoint-conditioned-value-selection",
  task: "Choose the most useful option for the stated context.",
  context: {
    audience: "a reader with limited attention",
    purpose: "make a shortlist",
    stakes: "medium",
  },
  factual_evidence: [
    { source_id: "fact-a", claim: "Candidate A is available today." },
    { source_id: "fact-b", claim: "Candidate B is available today." },
  ],
  target_evidence: [
    { source_id: "target-1", claim: "The target repeatedly removes noisy options." },
  ],
  candidates: [
    {
      candidate_id: "candidate-a",
      label: "Option A",
      evidence_refs: ["fact-a"],
    },
    {
      candidate_id: "candidate-b",
      label: "Option B",
      evidence_refs: ["fact-b"],
    },
  ],
  control: {
    condition: "taste",
    matched_case_id: "selection-contrast-knowledge-only",
    evidence_budget: 1,
  },
  allowed_actions: ["select", "rank", "exclude", "hold", "ask"],
  pair: {
    pair_id: "selection-contrast",
    role: "anchor",
    perturbation: "none",
    expected_relation: "independent",
  },
  sealed_judgment: {
    acceptable_decisions: [
      {
        decision_id: "quiet-detail-choice",
        decision: selectDecision,
        utility: 0.9,
      },
      {
        decision_id: "reasonable-alternative",
        decision: {
          ...selectDecision,
          selected_ids: ["candidate-b"],
          excluded_ids: ["candidate-a"],
          criterion_tags: ["availability-first"],
        },
        utility: 0.7,
      },
    ],
    criterion_tags: ["quiet-detail", "availability-first"],
    candidate_utility: {
      "candidate-a": 0.9,
      "candidate-b": 0.7,
    },
    omission_cost: {
      "candidate-a": 0.2,
      "candidate-b": 0.1,
    },
  },
};

describe("Taste episode contract", () => {
  it("accepts a fact-matched episode and strips sealed judgments from public input", () => {
    assert.doesNotThrow(() => validateTasteEpisode(episode));

    const publicEpisode = toPublicTasteEpisode(episode);
    assert.equal("sealed_judgment" in publicEpisode, false);
    assert.equal(publicEpisode.episode_id, episode.episode_id);
    assert.deepEqual(publicEpisode.candidates, episode.candidates);
  });

  it("requires the fields implied by each decision action", () => {
    assert.doesNotThrow(() =>
      validateTasteDecision({
        action: "hold",
        criterion_tags: [],
        evidence_refs: ["target-1"],
      }, ["candidate-a", "candidate-b"]),
    );
    assert.throws(
      () =>
        validateTasteDecision(
          {
            action: "select",
            criterion_tags: [],
            evidence_refs: [],
          },
          ["candidate-a", "candidate-b"],
        ),
      /selected_ids must contain at least one candidate/,
    );
  });

  it("rejects candidate evidence that is not declared by the episode", () => {
    const invalid = structuredClone(episode);
    invalid.candidates[0].evidence_refs = ["fact-missing"];

    assert.throws(
      () => validateTasteEpisode(invalid),
      /candidate candidate-a references undeclared evidence fact-missing/,
    );
  });
});
