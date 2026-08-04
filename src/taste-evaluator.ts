import {
  validateTasteDecision,
  validateTasteEpisode,
  type TasteDecision,
  type TasteEpisode,
} from "./taste.ts";

export type TasteMetricDimension = {
  score: number;
  max: number;
  rationale: string;
};

export type TasteDecisionEvaluation = {
  episode_id: string;
  dimensions: {
    selection: TasteMetricDimension;
    exclusion: TasteMetricDimension;
    hold_ask: TasteMetricDimension;
    criterion: TasteMetricDimension;
    evidence_support: TasteMetricDimension;
    utility: TasteMetricDimension;
    viewpoint_lift: TasteMetricDimension;
  };
};

export type TasteDecisionEvaluationOptions = {
  matched_control_utility?: number;
};

export type TasteContrastEvaluation = {
  pair_id: string;
  expected_relation: "same-decision" | "different-decision" | "independent";
  observed_relation: "same-decision" | "different-decision";
  score: number;
  rationale: string;
};

export function evaluateTasteDecision(
  episode: TasteEpisode,
  decision: TasteDecision,
  options: TasteDecisionEvaluationOptions = {},
): TasteDecisionEvaluation {
  validateTasteEpisode(episode);
  validateTasteDecision(
    decision,
    episode.candidates.map(({ candidate_id }) => candidate_id),
    new Set([
      ...episode.factual_evidence.map(({ source_id }) => source_id),
      ...episode.target_evidence.map(({ source_id }) => source_id),
    ]),
  );

  const match = bestAcceptableMatch(episode, decision);
  const expectedHoldAsk = episode.sealed_judgment.acceptable_decisions.some(
    ({ decision: acceptable }) =>
      acceptable.action === "hold" || acceptable.action === "ask",
  );
  const candidateHoldAsk = decision.action === "hold" || decision.action === "ask";
  const holdAskScore = expectedHoldAsk === candidateHoldAsk ? 1 : 0;
  const expectedTags = episode.sealed_judgment.criterion_tags;
  const criterionScore = f1(decision.criterion_tags, expectedTags);
  const declaredEvidence = new Set([
    ...episode.factual_evidence.map(({ source_id }) => source_id),
    ...episode.target_evidence.map(({ source_id }) => source_id),
  ]);
  const evidenceSupport =
    decision.evidence_refs.length === 0
      ? 0
      : decision.evidence_refs.filter((reference) =>
          declaredEvidence.has(reference),
        ).length / decision.evidence_refs.length;
  const utility = match.utility * match.similarity;

  const viewpointLift =
    options.matched_control_utility === undefined
      ? {
          score: 0,
          max: 1,
          rationale: "No matched control utility was supplied.",
        }
      : {
          score: utility - options.matched_control_utility,
          max: 1,
          rationale: `Taste utility ${utility.toFixed(3)} minus matched control utility ${options.matched_control_utility.toFixed(3)}.`,
        };

  return {
    episode_id: episode.episode_id,
    dimensions: {
      selection: {
        score: match.similarity,
        max: 1,
        rationale: match.rationale,
      },
      exclusion: {
        score: bestExclusionSimilarity(episode, decision),
        max: 1,
        rationale: "Compares the candidate's excluded set with the acceptable judgment distribution.",
      },
      hold_ask: {
        score: holdAskScore,
        max: 1,
        rationale: expectedHoldAsk
          ? "The case expects epistemic hold or clarification."
          : "The case expects a substantive decision rather than hold or clarification.",
      },
      criterion: {
        score: criterionScore,
        max: 1,
        rationale: "F1 overlap between structured criterion tags and sealed criterion anchors.",
      },
      evidence_support: {
        score: evidenceSupport,
        max: 1,
        rationale: "Fraction of cited decision evidence declared by the episode.",
      },
      utility: {
        score: utility,
        max: 1,
        rationale: "Best acceptable-decision utility weighted by decision similarity.",
      },
      viewpoint_lift: viewpointLift,
    },
  };
}

export function evaluateTasteContrast(
  left: { episode: TasteEpisode; decision: TasteDecision },
  right: { episode: TasteEpisode; decision: TasteDecision },
): TasteContrastEvaluation {
  validateTasteEpisode(left.episode);
  validateTasteEpisode(right.episode);
  if (!left.episode.pair || !right.episode.pair) {
    throw new Error("contrast evaluation requires pair metadata on both episodes");
  }
  if (left.episode.pair.pair_id !== right.episode.pair.pair_id) {
    throw new Error("contrast episodes must share pair_id");
  }
  validateTasteDecision(
    left.decision,
    left.episode.candidates.map(({ candidate_id }) => candidate_id),
    episodeEvidenceIds(left.episode),
  );
  validateTasteDecision(
    right.decision,
    right.episode.candidates.map(({ candidate_id }) => candidate_id),
    episodeEvidenceIds(right.episode),
  );

  const same = decisionsEquivalent(left.decision, right.decision);
  const expected = right.episode.pair.expected_relation;
  const observed = same ? "same-decision" : "different-decision";
  const score =
    expected === "independent"
      ? 1
      : expected === observed
        ? 1
        : 0;

  return {
    pair_id: left.episode.pair.pair_id,
    expected_relation: expected,
    observed_relation: observed,
    score,
    rationale:
      expected === "independent"
        ? "The pair is diagnostic only; no invariance or sensitivity expectation is scored."
        : `Expected ${expected}; observed ${observed}.`,
  };
}

function episodeEvidenceIds(episode: TasteEpisode): Set<string> {
  return new Set([
    ...episode.factual_evidence.map(({ source_id }) => source_id),
    ...episode.target_evidence.map(({ source_id }) => source_id),
  ]);
}

function bestAcceptableMatch(
  episode: TasteEpisode,
  decision: TasteDecision,
): { similarity: number; utility: number; rationale: string } {
  return episode.sealed_judgment.acceptable_decisions.reduce(
    (best, acceptable) => {
      const similarity = decisionSimilarity(decision, acceptable.decision);
      if (similarity > best.similarity) {
        return {
          similarity,
          utility: acceptable.utility,
          rationale: `Best match is ${acceptable.decision_id} at similarity ${similarity.toFixed(3)}.`,
        };
      }
      return best;
    },
    {
      similarity: 0,
      utility: 0,
      rationale: "No acceptable decision matched.",
    },
  );
}

function bestExclusionSimilarity(
  episode: TasteEpisode,
  decision: TasteDecision,
): number {
  return Math.max(
    ...episode.sealed_judgment.acceptable_decisions.map(({ decision: acceptable }) =>
      jaccard(decision.excluded_ids ?? [], acceptable.excluded_ids ?? []),
    ),
  );
}

function decisionSimilarity(left: TasteDecision, right: TasteDecision): number {
  if (left.action !== right.action) return 0;
  if (left.action === "hold" || left.action === "ask") return 1;
  if (left.action === "select") {
    const selected = jaccard(left.selected_ids ?? [], right.selected_ids ?? []);
    const excluded = jaccard(left.excluded_ids ?? [], right.excluded_ids ?? []);
    return (selected + excluded) / 2;
  }
  if (left.action === "exclude") {
    return jaccard(left.excluded_ids ?? [], right.excluded_ids ?? []);
  }
  return orderedOverlap(left.ordered_ids ?? [], right.ordered_ids ?? []);
}

function decisionsEquivalent(left: TasteDecision, right: TasteDecision): boolean {
  return (
    left.action === right.action &&
    sameSet(left.selected_ids, right.selected_ids) &&
    sameSet(left.excluded_ids, right.excluded_ids) &&
    sameSequence(left.ordered_ids, right.ordered_ids)
  );
}

function sameSet(left: string[] | undefined, right: string[] | undefined): boolean {
  return jaccard(left ?? [], right ?? []) === 1;
}

function sameSequence(
  left: string[] | undefined,
  right: string[] | undefined,
): boolean {
  return JSON.stringify(left ?? []) === JSON.stringify(right ?? []);
}

function orderedOverlap(left: string[], right: string[]): number {
  if (left.length === 0 && right.length === 0) return 1;
  const length = Math.max(left.length, right.length);
  let matches = 0;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    if (left[index] === right[index]) matches += 1;
  }
  return matches / length;
}

function jaccard(left: string[], right: string[]): number {
  if (left.length === 0 && right.length === 0) return 1;
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const intersection = [...leftSet].filter((value) => rightSet.has(value)).length;
  const union = new Set([...leftSet, ...rightSet]).size;
  return union === 0 ? 1 : intersection / union;
}

function f1(left: string[], right: string[]): number {
  if (left.length === 0 && right.length === 0) return 1;
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const overlap = [...leftSet].filter((value) => rightSet.has(value)).length;
  if (overlap === 0) return 0;
  const precision = overlap / leftSet.size;
  const recall = overlap / rightSet.size;
  return (2 * precision * recall) / (precision + recall);
}
