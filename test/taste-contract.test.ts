import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import {
  TASTE_CONTROL_CONDITIONS,
  TASTE_DECISION_ACTIONS,
  type DecisionArtifact,
  type TasteEpisode,
} from "../src/taste.ts";

const schemaPath = resolve(
  import.meta.dirname,
  "../schemas/taste-episode.schema.json",
);

const holdDecision: DecisionArtifact = {
  action: "hold",
  evidence_refs: ["target-unknown"],
  uncertainty: "The target criterion is not established by the available evidence.",
};

const episode: TasteEpisode = {
  schema_version: "1.0.0",
  suite_version: "0.1.0",
  episode_id: "insufficient-context",
  task: "Choose a defensible option for the stated target.",
  factual_evidence: [
    { source_id: "option-a", claim: "Option A is available this week." },
    { source_id: "option-b", claim: "Option B is available this week." },
  ],
  candidates: [
    {
      candidate_id: "candidate-a",
      label: "Option A",
      factually_admissible: true,
      evidence: [{ source_id: "option-a", claim: "Option A is available this week." }],
    },
    {
      candidate_id: "candidate-b",
      label: "Option B",
      factually_admissible: true,
      evidence: [{ source_id: "option-b", claim: "Option B is available this week." }],
    },
  ],
  target_evidence: [
    { source_id: "target-unknown", claim: "The target's priority is not stated." },
  ],
  context: {
    audience: "a general decision-maker",
    purpose: "make a useful recommendation",
    stakes: "moderate",
    time: "this week",
    variables: { channel: "written", urgency: 2 },
  },
  control_condition: {
    kind: "retrieval-only",
    description: "The candidate receives the factual evidence without a target criterion.",
  },
  allowed_actions: ["select", "rank", "exclude", "hold", "ask"],
  decision: holdDecision,
  sealed_judgment: {
    status: "sealed",
    package_id: "judgment-insufficient-context-v1",
    version: "1.0.0",
    digest: "sha256:sealed-judgment-digest",
  },
};

describe("generic Taste episode contract", () => {
  it("models factually admissible alternatives, target evidence, context, and controls", () => {
    assert.equal(episode.candidates.length, 2);
    assert.equal(
      episode.candidates.every(({ factually_admissible }) => factually_admissible),
      true,
    );
    assert.equal(episode.target_evidence[0]?.claim, "The target's priority is not stated.");
    assert.equal(episode.context.purpose, "make a useful recommendation");
    assert.deepEqual(TASTE_CONTROL_CONDITIONS, [
      "knowledge-only",
      "retrieval-only",
      "explicit-rule",
      "style",
    ]);
    assert.deepEqual(episode.allowed_actions, TASTE_DECISION_ACTIONS);
  });

  it("allows every decision action without requiring a selected item", () => {
    const decisions: DecisionArtifact[] = [
      {
        action: "select",
        candidate_ids: ["candidate-a", "candidate-b"],
        evidence_refs: ["option-a", "option-b"],
        criterion: "Both options satisfy the declared need.",
      },
      {
        action: "rank",
        candidate_ids: ["candidate-b", "candidate-a"],
        evidence_refs: ["option-a", "option-b"],
        criterion: "Option B has the stronger fit.",
      },
      {
        action: "exclude",
        candidate_ids: ["candidate-b"],
        evidence_refs: ["option-b"],
        trade_off: "Option B is less suitable for the stated constraint.",
      },
      { action: "hold", evidence_refs: [], uncertainty: "Need the target criterion." },
      { action: "ask", evidence_refs: [], question: "What matters most to the target?" },
    ];

    assert.deepEqual(
      decisions.map(({ action }) => action),
      ["select", "rank", "exclude", "hold", "ask"],
    );
    assert.equal(holdDecision.candidate_ids, undefined);
    assert.equal(episode.decision?.action, "hold");
  });

  it("keeps evidence claims consistent and seals judgment metadata", async () => {
    const allEvidence = [
      ...episode.factual_evidence,
      ...episode.target_evidence,
      ...episode.candidates.flatMap(({ evidence }) => evidence),
    ];
    assert.equal(allEvidence.every((item) => "claim" in item), true);
    assert.equal(allEvidence.some((item) => "content" in item), false);
    assert.equal(episode.sealed_judgment.status, "sealed");
    assert.equal(episode.sealed_judgment.digest.startsWith("sha256:"), true);

    const schema = JSON.parse(await readFile(schemaPath, "utf8")) as {
      required: string[];
      properties: Record<string, { $ref?: string }>;
      $defs: Record<string, {
        required?: string[];
        properties?: Record<string, { enum?: string[]; const?: unknown; minItems?: number }>;
      }>;
    };

    assert.deepEqual(schema.properties.sealed_judgment, {
      $ref: "#/$defs/sealed_judgment",
    });
    assert.equal(schema.required.includes("factual_evidence"), true);
    assert.equal(schema.required.includes("candidates"), true);
    assert.equal(schema.required.includes("target_evidence"), true);
    assert.equal(schema.required.includes("context"), true);
    assert.equal(schema.required.includes("control_condition"), true);
    assert.equal(schema.required.includes("allowed_actions"), true);
    assert.deepEqual(schema.$defs.decision_artifact?.properties?.action?.enum, [
      "select",
      "rank",
      "exclude",
      "hold",
      "ask",
    ]);
    assert.equal(schema.$defs.decision_artifact?.properties?.candidate_ids?.minItems, undefined);
    assert.deepEqual(schema.$defs.control_condition?.properties?.kind?.enum, [
      "knowledge-only",
      "retrieval-only",
      "explicit-rule",
      "style",
    ]);
    assert.equal(schema.$defs.sealed_judgment?.properties?.status?.const, "sealed");
    assert.deepEqual(schema.$defs.evidence?.required, ["source_id", "claim"]);
    assert.equal(schema.$defs.evidence?.properties?.claim?.const, undefined);
  });
});
