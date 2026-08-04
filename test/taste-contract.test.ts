import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  evaluation_split: "public",
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
    assert.equal("pair" in publicEpisode, false);
    assert.equal("evaluation_split" in publicEpisode, false);
    assert.equal(publicEpisode.episode_id, episode.episode_id);
    assert.deepEqual(publicEpisode.candidates, episode.candidates);

    publicEpisode.candidates[0].label = "mutated by candidate";
    assert.equal(episode.candidates[0].label, "Option A");
  });

  it("requires the fields implied by each decision action", () => {
    assert.doesNotThrow(() =>
      validateTasteDecision({
        action: "hold",
        criterion_tags: [],
        evidence_refs: ["target-1"],
      }, ["candidate-a", "candidate-b"], new Set(["target-1"])),
    );
    assert.throws(
      () =>
        validateTasteDecision(
          {
            action: "select",
            criterion_tags: [],
            evidence_refs: ["fact-a"],
          },
          ["candidate-a", "candidate-b"],
          new Set(["fact-a"]),
        ),
      /selected_ids must contain at least one candidate/,
    );
    assert.doesNotThrow(() =>
      validateTasteDecision(
        {
          action: "rank",
          ordered_ids: ["candidate-a", "candidate-b"],
          criterion_tags: [],
          evidence_refs: ["fact-a"],
        },
        ["candidate-a", "candidate-b"],
        new Set(["fact-a", "fact-b"]),
      ),
    );
    assert.doesNotThrow(() =>
      validateTasteDecision(
        {
          action: "exclude",
          excluded_ids: ["candidate-b"],
          criterion_tags: [],
          evidence_refs: ["fact-b"],
        },
        ["candidate-a", "candidate-b"],
        new Set(["fact-b"]),
      ),
    );
    assert.doesNotThrow(() =>
      validateTasteDecision(
        {
          action: "ask",
          question: "Which trade-off matters more?",
          criterion_tags: [],
          evidence_refs: ["target-1"],
        },
        ["candidate-a", "candidate-b"],
        new Set(["target-1"]),
      ),
    );
    assert.throws(
      () =>
        validateTasteDecision(
          {
            action: "hold",
            selected_ids: ["candidate-a"],
            criterion_tags: [],
            evidence_refs: ["target-1"],
          },
          ["candidate-a", "candidate-b"],
          new Set(["target-1"]),
        ),
      /hold decisions must not include candidate ids/,
    );
    assert.throws(
      () =>
        validateTasteDecision(
          {
            action: "select",
            selected_ids: ["candidate-a"],
            excluded_ids: [],
            criterion_tags: [],
            evidence_refs: ["fact-a"],
          },
          ["candidate-a", "candidate-b"],
          new Set(["fact-a"]),
        ),
      /excluded_ids must contain at least one candidate/,
    );
    assert.throws(
      () =>
        validateTasteDecision(
          {
            action: "select",
            selected_ids: ["candidate-a"],
            excluded_ids: ["candidate-b", "candidate-b"],
            criterion_tags: [],
            evidence_refs: ["fact-a"],
          },
          ["candidate-a", "candidate-b"],
          new Set(["fact-a"]),
        ),
      /excluded_ids must be unique/,
    );
    assert.throws(
      () =>
        validateTasteDecision(
          {
            action: "select",
            selected_ids: ["candidate-a"],
            excluded_ids: ["candidate-missing"],
            criterion_tags: [],
            evidence_refs: ["fact-a"],
          },
          ["candidate-a", "candidate-b"],
          new Set(["fact-a"]),
        ),
      /excluded_ids references unknown candidate candidate-missing/,
    );
    assert.throws(
      () =>
        validateTasteDecision(
          {
            action: "select",
            selected_ids: ["candidate-a"],
            criterion_tags: [],
            criterion: "",
            rationale: "",
            evidence_refs: ["fact-a"],
          },
          ["candidate-a", "candidate-b"],
          new Set(["fact-a"]),
        ),
      /criterion must be non-empty when provided/,
    );
    assert.throws(
      () =>
        validateTasteDecision(
          {
            action: "hold",
            criterion_tags: [],
            evidence_refs: ["target-1"],
            question: "",
          } as TasteDecision,
          ["candidate-a", "candidate-b"],
          new Set(["target-1"]),
        ),
      /hold decisions must not include candidate ids or question/,
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

  it("requires every candidate to cite factual evidence only", () => {
    const empty = structuredClone(episode);
    empty.candidates[0].evidence_refs = [];
    assert.throws(
      () => validateTasteEpisode(empty),
      /candidate candidate-a must cite at least one factual evidence source/,
    );

    const targetOnly = structuredClone(episode);
    targetOnly.candidates[0].evidence_refs = ["target-1"];
    assert.throws(
      () => validateTasteEpisode(targetOnly),
      /candidate candidate-a must cite factual evidence only/,
    );
  });

  it("requires sealed decisions to use an allowed action", () => {
    const invalid = structuredClone(episode);
    invalid.allowed_actions = ["hold"];
    assert.throws(
      () => validateTasteEpisode(invalid),
      /sealed decision action select is not allowed/,
    );
  });

  it("rejects empty optional control metadata and unknown JSON properties", () => {
    const emptyControl = structuredClone(episode);
    emptyControl.control.matched_case_id = "";
    assert.throws(() => validateTasteEpisode(emptyControl), /matched_case_id is required/);

    const extra = structuredClone(episode) as TasteEpisode & { unexpected: true };
    extra.unexpected = true;
    assert.throws(() => validateTasteEpisode(extra), /episode contains unknown property unexpected/);
  });

  it("keeps public schema separate from sealed judgment metadata", () => {
    const publicSchema = JSON.parse(
      readFileSync(new URL("../schemas/taste-episode.public.schema.json", import.meta.url), "utf8"),
    ) as { required: string[]; properties: Record<string, unknown> };
    assert.equal(publicSchema.required.includes("sealed_judgment"), false);
    assert.equal("sealed_judgment" in publicSchema.properties, false);
    assert.equal("sealed_judgment" in toPublicTasteEpisode(episode), false);
  });

  it("rejects schema-invalid identifiers, claims, and uncertainty levels at runtime", () => {
    const invalidId = structuredClone(episode);
    invalidId.episode_id = "Not Valid";
    assert.throws(() => validateTasteEpisode(invalidId), /episode_id must match/);

    const invalidClaim = structuredClone(episode);
    invalidClaim.factual_evidence[0].claim = "";
    assert.throws(() => validateTasteEpisode(invalidClaim), /evidence claim is required/);

    const missingContext = structuredClone(episode) as TasteEpisode & {
      context?: unknown;
    };
    delete missingContext.context;
    assert.throws(() => validateTasteEpisode(missingContext), /context is required/);

    const invalidUncertainty = structuredClone(episode) as TasteEpisode & {
      sealed_judgment: { acceptable_decisions: Array<{ decision: TasteDecision }> };
    };
    invalidUncertainty.sealed_judgment.acceptable_decisions[0].decision.uncertainty = {
      level: "unknown" as "low",
    };
    assert.throws(
      () => validateTasteEpisode(invalidUncertainty),
      /uncertainty level must be low, medium, or high/,
    );
  });

  it("rejects an unknown evaluation split", () => {
    const invalid = structuredClone(episode) as TasteEpisode & {
      evaluation_split: string;
    };
    invalid.evaluation_split = "unknown";

    assert.throws(
      () => validateTasteEpisode(invalid),
      /evaluation_split must be public, held-out, or sealed/,
    );
  });
});
