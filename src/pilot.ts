import type { Evidence } from "./runner.ts";
import type {
  TasteAcceptableDecision,
  TasteDecision,
  TasteEpisode,
} from "./taste.ts";

const selectionFacts: Evidence[] = [
  { source_id: "selection-fact-a", claim: "Option A is available today." },
  { source_id: "selection-fact-b", claim: "Option B is available today." },
];

const selectionCandidates = [
  { candidate_id: "option-a", label: "Quiet detail", evidence_refs: ["selection-fact-a"] },
  { candidate_id: "option-b", label: "Bright novelty", evidence_refs: ["selection-fact-b"] },
];

const selectA: TasteDecision = {
  action: "select",
  selected_ids: ["option-a"],
  excluded_ids: ["option-b"],
  criterion_tags: ["quiet-detail"],
  evidence_refs: ["selection-target", "selection-fact-a"],
};

const selectB: TasteDecision = {
  action: "select",
  selected_ids: ["option-b"],
  excluded_ids: ["option-a"],
  criterion_tags: ["novelty-under-time"],
  evidence_refs: ["selection-target", "selection-fact-b"],
};

const selectionJudgment = (
  acceptableDecisions: TasteAcceptableDecision[],
  candidateUtility: Record<string, number>,
) => ({
  acceptable_decisions: acceptableDecisions,
  criterion_tags: ["quiet-detail", "novelty-under-time"],
  candidate_utility: candidateUtility,
  omission_cost: { "option-a": 0.2, "option-b": 0.15 },
});

const selectionAcceptable = [
  { decision_id: "quiet-detail-choice", decision: selectA, utility: 0.9 },
  { decision_id: "novelty-choice", decision: selectB, utility: 0.65 },
];

function makeSelectionEpisode(
  episode_id: string,
  evaluation_split: TasteEpisode["evaluation_split"],
  condition: "taste" | "knowledge-only" | "retrieval-only" | "explicit-rule" | "style",
  context: Record<string, string>,
  target_evidence: Evidence[],
  acceptable_decisions = selectionAcceptable,
  pair?: TasteEpisode["pair"],
): TasteEpisode {
  const declaredAcceptableDecisions = acceptable_decisions.map((acceptable) =>
    condition === "knowledge-only"
      ? {
          ...acceptable,
          decision: {
            ...acceptable.decision,
            evidence_refs: acceptable.decision.evidence_refs.filter((reference) =>
              reference.startsWith("selection-fact-"),
            ),
          },
        }
      : acceptable,
  );
  return {
    schema_version: "1.0.0",
    suite_version: "0.1.0",
    episode_id,
    evaluation_split,
    capability: "viewpoint-conditioned-value-selection",
    task: "Choose the most useful option for the target and context.",
    context,
    factual_evidence: selectionFacts,
    target_evidence,
    candidates: selectionCandidates,
    control: {
      condition,
      matched_case_id: condition === "knowledge-only" ? "pilot-selection-taste" : "pilot-selection-knowledge-only",
      evidence_budget: target_evidence.length,
    },
    allowed_actions: ["select", "rank", "exclude", "hold", "ask"],
    pair,
    sealed_judgment: selectionJudgment(declaredAcceptableDecisions, {
      "option-a": declaredAcceptableDecisions[0].decision.selected_ids?.includes("option-a") ? declaredAcceptableDecisions[0].utility : 0.65,
      "option-b": declaredAcceptableDecisions[0].decision.selected_ids?.includes("option-b") ? declaredAcceptableDecisions[0].utility : 0.65,
    }),
  };
}

const selectionTarget: Evidence[] = [
  {
    source_id: "selection-target",
    claim: "The target repeatedly removes noisy options when attention is limited.",
  },
];

const holdDecision: TasteDecision = {
  action: "hold",
  criterion_tags: [],
  evidence_refs: ["hold-target"],
  uncertainty: { level: "high", note: "The target criterion is underdetermined." },
};

function makeHoldEpisode(): TasteEpisode {
  return {
    schema_version: "1.0.0",
    suite_version: "0.1.0",
    episode_id: "pilot-hold",
    evaluation_split: "public",
    capability: "viewpoint-conditioned-value-selection",
    task: "Decide whether the evidence is sufficient to make a useful choice.",
    context: { purpose: "avoid an unjustified recommendation", stakes: "medium" },
    factual_evidence: [
      { source_id: "hold-fact-a", claim: "Option A meets the functional requirement." },
      { source_id: "hold-fact-b", claim: "Option B meets the functional requirement." },
    ],
    target_evidence: [
      { source_id: "hold-target", claim: "The available examples disagree about the target's trade-off." },
    ],
    candidates: [
      { candidate_id: "hold-a", label: "Functional option A", evidence_refs: ["hold-fact-a"] },
      { candidate_id: "hold-b", label: "Functional option B", evidence_refs: ["hold-fact-b"] },
    ],
    control: { condition: "taste", evidence_budget: 1 },
    allowed_actions: ["select", "rank", "exclude", "hold", "ask"],
    sealed_judgment: {
      acceptable_decisions: [{ decision_id: "epistemic-hold", decision: holdDecision, utility: 0.85 }],
      criterion_tags: [],
      candidate_utility: { "hold-a": 0.4, "hold-b": 0.4 },
      omission_cost: { "hold-a": 0.3, "hold-b": 0.3 },
    },
  };
}

function makeHeldOutEpisode(): TasteEpisode {
  const facts: Evidence[] = [
    { source_id: "transfer-fact-c", claim: "Option C is compact and durable." },
    { source_id: "transfer-fact-d", claim: "Option D is vivid and fragile." },
  ];
  const decision: TasteDecision = {
    action: "select",
    selected_ids: ["option-c"],
    excluded_ids: ["option-d"],
    criterion_tags: ["quiet-detail"],
    evidence_refs: ["transfer-target", "transfer-fact-c"],
  };
  return {
    schema_version: "1.0.0",
    suite_version: "0.1.0",
    episode_id: "pilot-transfer-held-out",
    evaluation_split: "held-out",
    capability: "viewpoint-conditioned-value-selection",
    task: "Apply the inferred criterion to a novel candidate pair.",
    context: { purpose: "held-out transfer" },
    factual_evidence: facts,
    target_evidence: [
      { source_id: "transfer-target", claim: "The target prefers restrained detail over fragile novelty." },
    ],
    candidates: [
      { candidate_id: "option-c", label: "Compact durable option", evidence_refs: ["transfer-fact-c"] },
      { candidate_id: "option-d", label: "Vivid fragile option", evidence_refs: ["transfer-fact-d"] },
    ],
    control: { condition: "taste", matched_case_id: "pilot-selection-taste", evidence_budget: 1 },
    allowed_actions: ["select", "rank", "exclude", "hold", "ask"],
    sealed_judgment: {
      acceptable_decisions: [{ decision_id: "transfer-restraint", decision, utility: 0.9 }],
      criterion_tags: ["quiet-detail"],
      candidate_utility: { "option-c": 0.9, "option-d": 0.35 },
      omission_cost: { "option-c": 0.25, "option-d": 0.1 },
    },
  };
}

export const PILOT_EPISODES: TasteEpisode[] = [
  makeSelectionEpisode("pilot-selection-taste", "public", "taste", {
    audience: "limited attention",
    purpose: "make a shortlist",
  }, selectionTarget),
  makeSelectionEpisode("pilot-selection-knowledge-only", "public", "knowledge-only", {
    audience: "limited attention",
    purpose: "make a shortlist",
  }, []),
  makeSelectionEpisode("pilot-selection-retrieval-only", "public", "retrieval-only", {
    audience: "limited attention",
    purpose: "make a shortlist",
  }, selectionTarget),
  makeSelectionEpisode("pilot-selection-explicit-rule", "public", "explicit-rule", {
    audience: "limited attention",
    purpose: "make a shortlist",
  }, selectionTarget),
  makeSelectionEpisode("pilot-selection-style", "public", "style", {
    audience: "limited attention",
    purpose: "make a shortlist",
  }, selectionTarget),
  makeSelectionEpisode("pilot-invariance-anchor", "public", "taste", {
    audience: "limited attention",
    purpose: "make a shortlist",
  }, selectionTarget, selectionAcceptable, {
    pair_id: "pilot-invariance",
    role: "anchor",
    perturbation: "none",
    expected_relation: "same-decision",
  }),
  makeSelectionEpisode("pilot-invariance-contrast", "public", "taste", {
    audience: "limited attention",
    purpose: "make a shortlist",
    irrelevant_display_detail: "blue",
  }, selectionTarget, selectionAcceptable, {
    pair_id: "pilot-invariance",
    role: "contrast",
    perturbation: "irrelevant",
    expected_relation: "same-decision",
  }),
  makeSelectionEpisode("pilot-sensitivity-anchor", "public", "taste", {
    audience: "limited attention",
    purpose: "make a shortlist",
  }, selectionTarget, selectionAcceptable, {
    pair_id: "pilot-sensitivity",
    role: "anchor",
    perturbation: "none",
    expected_relation: "different-decision",
  }),
  makeSelectionEpisode("pilot-sensitivity-contrast", "public", "taste", {
    audience: "limited attention",
    purpose: "choose a vivid option quickly",
  }, selectionTarget, selectionAcceptable.map((acceptable) =>
    acceptable.decision === selectA
      ? { decision_id: "novelty-choice", decision: selectB, utility: 0.9 }
      : { decision_id: "quiet-detail-choice", decision: selectA, utility: 0.55 },
  ), {
    pair_id: "pilot-sensitivity",
    role: "contrast",
    perturbation: "decision-relevant",
    expected_relation: "different-decision",
  }),
  makeHoldEpisode(),
  makeHeldOutEpisode(),
];
