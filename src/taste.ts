import type { Evidence, JsonValue } from "./runner.ts";

export type TasteContext = JsonValue;

export const TASTE_CONTROL_CONDITIONS = [
  "taste",
  "knowledge-only",
  "retrieval-only",
  "explicit-rule",
  "style",
] as const;

export type TasteControlCondition =
  (typeof TASTE_CONTROL_CONDITIONS)[number];

export type TasteControl = {
  condition: TasteControlCondition;
  matched_case_id?: string;
  evidence_budget?: number;
};

export const TASTE_DECISION_ACTIONS = [
  "select",
  "rank",
  "exclude",
  "hold",
  "ask",
] as const;

export type TasteDecisionAction = (typeof TASTE_DECISION_ACTIONS)[number];

export type TasteCandidate = {
  candidate_id: string;
  label: string;
  evidence_refs: string[];
  attributes?: JsonValue;
};

export type TastePair = {
  pair_id: string;
  role: "anchor" | "contrast";
  perturbation: "none" | "irrelevant" | "decision-relevant";
  expected_relation: "same-decision" | "different-decision" | "independent";
};

export type TasteUncertainty = {
  level: "low" | "medium" | "high";
  note?: string;
};

type TasteDecisionBase = {
  criterion_tags: string[];
  criterion?: string;
  evidence_refs: string[];
  uncertainty?: TasteUncertainty;
  rationale?: string;
};

export type TasteDecision =
  | (TasteDecisionBase & {
      action: "select";
      selected_ids: string[];
      excluded_ids?: string[];
      ordered_ids?: never;
      question?: never;
    })
  | (TasteDecisionBase & {
      action: "rank";
      ordered_ids: string[];
      selected_ids?: never;
      excluded_ids?: never;
      question?: never;
    })
  | (TasteDecisionBase & {
      action: "exclude";
      excluded_ids: string[];
      selected_ids?: never;
      ordered_ids?: never;
      question?: never;
    })
  | (TasteDecisionBase & {
      action: "hold";
      selected_ids?: never;
      excluded_ids?: never;
      ordered_ids?: never;
      question?: never;
    })
  | (TasteDecisionBase & {
      action: "ask";
      question: string;
      selected_ids?: never;
      excluded_ids?: never;
      ordered_ids?: never;
    });

/*
 * Keep the discriminated union above as the public shape. Runtime validation
 * below remains necessary because episodes and candidate outputs cross a
 * process boundary as JSON.
 */
type UnvalidatedTasteDecision = {
  action: TasteDecisionAction;
  selected_ids?: string[];
  excluded_ids?: string[];
  ordered_ids?: string[];
  criterion_tags: string[];
  criterion?: string;
  evidence_refs: string[];
  uncertainty?: TasteUncertainty;
  question?: string;
  rationale?: string;
};

export type TasteAcceptableDecision = {
  decision_id: string;
  decision: TasteDecision;
  utility: number;
};

export type TasteJudgmentPackage = {
  acceptable_decisions: TasteAcceptableDecision[];
  criterion_tags: string[];
  candidate_utility: Record<string, number>;
  omission_cost: Record<string, number>;
};

export type TasteEpisode = {
  schema_version: "1.0.0";
  suite_version: string;
  episode_id: string;
  evaluation_split: "public" | "held-out" | "sealed";
  capability: string;
  task: string;
  context: TasteContext;
  factual_evidence: Evidence[];
  target_evidence: Evidence[];
  candidates: TasteCandidate[];
  control: TasteControl;
  allowed_actions: TasteDecisionAction[];
  pair?: TastePair;
  sealed_judgment: TasteJudgmentPackage;
};

export type PublicTasteEpisode = Omit<
  TasteEpisode,
  "sealed_judgment" | "pair" | "evaluation_split"
>;

export function toPublicTasteEpisode(
  episode: TasteEpisode,
): PublicTasteEpisode {
  const {
    sealed_judgment: _sealedJudgment,
    pair: _pair,
    evaluation_split: _evaluationSplit,
    ...publicEpisode
  } = episode;
  return publicEpisode;
}

export function validateTasteEpisode(episode: TasteEpisode): void {
  assertKnownKeys(
    episode,
    [
      "schema_version",
      "suite_version",
      "episode_id",
      "evaluation_split",
      "capability",
      "task",
      "context",
      "factual_evidence",
      "target_evidence",
      "candidates",
      "control",
      "allowed_actions",
      "pair",
      "sealed_judgment",
    ],
    "episode",
  );
  requireText(episode.episode_id, "episode_id");
  requireText(episode.suite_version, "suite_version");
  requireText(episode.capability, "capability");
  requireText(episode.task, "task");

  if (episode.schema_version !== "1.0.0") {
    throw new Error("schema_version must be 1.0.0");
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(episode.episode_id)) {
    throw new Error("episode_id must match lowercase kebab-case");
  }
  if (!["public", "held-out", "sealed"].includes(episode.evaluation_split)) {
    throw new Error("evaluation_split must be public, held-out, or sealed");
  }
  if (episode.candidates.length < 2) {
    throw new Error("candidates must contain at least two alternatives");
  }

  const candidateIds = uniqueText(
    episode.candidates.map(({ candidate_id }) => candidate_id),
    "candidate_id",
  );
  const factualSourceIds = uniqueText(
    episode.factual_evidence.map(({ source_id }) => source_id),
    "factual evidence source_id",
  );
  const targetSourceIds = uniqueText(
    episode.target_evidence.map(({ source_id }) => source_id),
    "target evidence source_id",
  );
  validateEvidence(episode.factual_evidence);
  validateEvidence(episode.target_evidence);
  const declaredEvidenceIds = new Set([
    ...factualSourceIds,
    ...targetSourceIds,
  ]);

  for (const candidate of episode.candidates) {
    assertKnownKeys(
      candidate,
      ["candidate_id", "label", "evidence_refs", "attributes"],
      `candidate ${candidate.candidate_id}`,
    );
    requireText(candidate.label, `candidate ${candidate.candidate_id} label`);
    if (candidate.evidence_refs.length === 0) {
      throw new Error(
        `candidate ${candidate.candidate_id} must cite at least one factual evidence source`,
      );
    }
    uniqueText(candidate.evidence_refs, `candidate ${candidate.candidate_id} evidence reference`);
    for (const evidenceRef of candidate.evidence_refs) {
      if (!factualSourceIds.includes(evidenceRef)) {
        if (targetSourceIds.includes(evidenceRef)) {
          throw new Error(
            `candidate ${candidate.candidate_id} must cite factual evidence only`,
          );
        }
        throw new Error(
          `candidate ${candidate.candidate_id} references undeclared evidence ${evidenceRef}`,
        );
      }
    }
  }

  if (!TASTE_CONTROL_CONDITIONS.includes(episode.control.condition)) {
    throw new Error(
      `unsupported control condition ${episode.control.condition}`,
    );
  }
  assertKnownKeys(
    episode.control,
    ["condition", "matched_case_id", "evidence_budget"],
    "control",
  );
  if (episode.control.matched_case_id !== undefined) {
    requireText(episode.control.matched_case_id, "matched_case_id");
  }
  if (
    episode.control.evidence_budget !== undefined &&
    (!Number.isInteger(episode.control.evidence_budget) ||
      episode.control.evidence_budget < 0)
  ) {
    throw new Error("control evidence_budget must be a non-negative integer");
  }

  const allowedActions = uniqueText(episode.allowed_actions, "allowed action");
  for (const action of allowedActions) {
    if (!TASTE_DECISION_ACTIONS.includes(action as TasteDecisionAction)) {
      throw new Error(`unsupported decision action ${action}`);
    }
  }

  if (episode.pair) validateTastePair(episode.pair);

  assertKnownKeys(
    episode.sealed_judgment,
    ["acceptable_decisions", "criterion_tags", "candidate_utility", "omission_cost"],
    "sealed_judgment",
  );
  if (episode.sealed_judgment.acceptable_decisions.length === 0) {
    throw new Error("sealed_judgment must contain an acceptable decision");
  }
  for (const acceptable of episode.sealed_judgment.acceptable_decisions) {
    assertKnownKeys(
      acceptable,
      ["decision_id", "decision", "utility"],
      "acceptable decision",
    );
    requireText(acceptable.decision_id, "acceptable decision_id");
    assertUtility(acceptable.utility, "acceptable decision utility");
    validateTasteDecision(
      acceptable.decision,
      candidateIds,
      declaredEvidenceIds,
      new Set(allowedActions),
    );
  }
  validateTagList(episode.sealed_judgment.criterion_tags, "criterion_tags");
  validateCandidateScores(
    episode.sealed_judgment.candidate_utility,
    candidateIds,
    "candidate_utility",
  );
  validateCandidateScores(
    episode.sealed_judgment.omission_cost,
    candidateIds,
    "omission_cost",
  );
}

export function validateTasteDecision(
  decision: TasteDecision,
  candidateIds: string[],
  declaredEvidenceIds: Set<string>,
  allowedActions?: ReadonlySet<TasteDecisionAction>,
): void {
  assertKnownKeys(
    decision,
    [
      "action",
      "selected_ids",
      "excluded_ids",
      "ordered_ids",
      "criterion_tags",
      "criterion",
      "evidence_refs",
      "uncertainty",
      "question",
      "rationale",
    ],
    "decision",
  );
  if (!TASTE_DECISION_ACTIONS.includes(decision.action)) {
    throw new Error(`unsupported decision action ${decision.action}`);
  }
  if (allowedActions && !allowedActions.has(decision.action)) {
    throw new Error(`sealed decision action ${decision.action} is not allowed`);
  }
  if (decision.evidence_refs.length === 0) {
    throw new Error("decision must cite at least one evidence source");
  }
  validateTagList(decision.criterion_tags, "criterion_tags");
  uniqueText(decision.evidence_refs, "evidence reference");
  for (const evidenceRef of decision.evidence_refs) {
    if (!declaredEvidenceIds.has(evidenceRef)) {
      throw new Error(`decision references undeclared evidence ${evidenceRef}`);
    }
  }

  const candidateSet = new Set(candidateIds);
  const validateIds = (ids: string[] | undefined, field: string): void => {
    if (!ids || ids.length === 0) {
      throw new Error(`${field} must contain at least one candidate`);
    }
    uniqueText(ids, field);
    for (const id of ids) {
      if (!candidateSet.has(id)) {
        throw new Error(`${field} references unknown candidate ${id}`);
      }
    }
  };

  if (decision.action === "select") {
    validateIds(decision.selected_ids, "selected_ids");
    if (decision.excluded_ids !== undefined) {
      validateIds(decision.excluded_ids, "excluded_ids");
    }
    if (decision.ordered_ids || decision.question) {
      throw new Error("select decisions must not include ordered_ids or question");
    }
  }
  if (decision.action === "rank") {
    validateIds(decision.ordered_ids, "ordered_ids");
    if (decision.selected_ids || decision.excluded_ids || decision.question) {
      throw new Error("rank decisions must not include selected, excluded, or question fields");
    }
  }
  if (decision.action === "exclude") {
    validateIds(decision.excluded_ids, "excluded_ids");
    if (decision.selected_ids || decision.ordered_ids || decision.question) {
      throw new Error("exclude decisions must not include selected, ordered, or question fields");
    }
  }
  if (decision.action === "hold") {
    if (decision.selected_ids || decision.excluded_ids || decision.ordered_ids || decision.question) {
      throw new Error("hold decisions must not include candidate ids or question");
    }
  }
  if (decision.action === "ask") {
    requireText(decision.question, "question");
    if (decision.selected_ids || decision.excluded_ids || decision.ordered_ids) {
      throw new Error("ask decisions must not include candidate ids");
    }
  }
  if (decision.uncertainty) {
    assertKnownKeys(decision.uncertainty, ["level", "note"], "uncertainty");
    if (!["low", "medium", "high"].includes(decision.uncertainty.level)) {
      throw new Error("uncertainty level must be low, medium, or high");
    }
  }
  if (decision.criterion !== undefined && !decision.criterion.trim()) {
    throw new Error("criterion must be non-empty when provided");
  }
  if (decision.rationale !== undefined && !decision.rationale.trim()) {
    throw new Error("rationale must be non-empty when provided");
  }
  if (decision.uncertainty?.note !== undefined) {
    requireText(decision.uncertainty.note, "uncertainty note");
  }
}

function validateTastePair(pair: TastePair): void {
  assertKnownKeys(
    pair,
    ["pair_id", "role", "perturbation", "expected_relation"],
    "pair",
  );
  requireText(pair.pair_id, "pair_id");
  if (!["anchor", "contrast"].includes(pair.role)) {
    throw new Error(`unsupported pair role ${pair.role}`);
  }
  if (!["none", "irrelevant", "decision-relevant"].includes(pair.perturbation)) {
    throw new Error(`unsupported pair perturbation ${pair.perturbation}`);
  }
  if (!["same-decision", "different-decision", "independent"].includes(pair.expected_relation)) {
    throw new Error(`unsupported pair expected_relation ${pair.expected_relation}`);
  }
}

function validateEvidence(evidence: Evidence[]): void {
  for (const item of evidence) {
    assertKnownKeys(item, ["source_id", "claim"], "evidence");
    requireText(item.source_id, "evidence source_id");
    requireText(item.claim, "evidence claim");
  }
}

function validateCandidateScores(
  scores: Record<string, number>,
  candidateIds: string[],
  field: string,
): void {
  for (const [candidateId, score] of Object.entries(scores)) {
    if (!candidateIds.includes(candidateId)) {
      throw new Error(`${field} references unknown candidate ${candidateId}`);
    }
    assertUtility(score, `${field}.${candidateId}`);
  }
}

function assertUtility(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${field} must be between 0 and 1`);
  }
}

function validateTagList(tags: string[], field: string): void {
  uniqueText(tags, field);
}

function uniqueText(values: string[], field: string): string[] {
  for (const value of values) requireText(value, field);
  const unique = new Set(values);
  if (unique.size !== values.length) throw new Error(`${field} must be unique`);
  return values;
}

function requireText(value: string | undefined, field: string): void {
  if (!value?.trim()) throw new Error(`${field} is required`);
}

function assertKnownKeys(
  value: object,
  allowed: string[],
  field: string,
): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${field} contains unknown property ${key}`);
    }
  }
}
