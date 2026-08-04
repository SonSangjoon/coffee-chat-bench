export type TasteJsonValue =
  | string
  | number
  | boolean
  | null
  | TasteJsonValue[]
  | { [key: string]: TasteJsonValue };

export type Evidence = {
  source_id: string;
  claim: string;
};

export type TasteEvidence = Evidence;

export type Candidate = {
  candidate_id: string;
  label: string;
  factually_admissible: true;
  evidence: Evidence[];
};

export type TasteCandidate = Candidate;
export type TargetEvidence = Evidence;

export type TasteContext = {
  audience?: string;
  purpose?: string;
  stakes?: string;
  time?: string;
  variables?: Record<string, TasteJsonValue>;
};

export const TASTE_CONTROL_CONDITIONS = [
  "knowledge-only",
  "retrieval-only",
  "explicit-rule",
  "style",
] as const;

export type ControlKind = (typeof TASTE_CONTROL_CONDITIONS)[number];

export type ControlCondition = {
  kind: ControlKind;
  description?: string;
};

export const TASTE_DECISION_ACTIONS = [
  "select",
  "rank",
  "exclude",
  "hold",
  "ask",
] as const;

export type DecisionAction = (typeof TASTE_DECISION_ACTIONS)[number];

export type DecisionArtifact = {
  action: DecisionAction;
  candidate_ids?: string[];
  criterion?: string;
  trade_off?: string;
  evidence_refs: string[];
  uncertainty?: string;
  question?: string;
  artifact?: TasteJsonValue;
};

export type TasteDecision = DecisionArtifact;

export type SealedJudgmentMetadata = {
  status: "sealed";
  package_id: string;
  version: string;
  digest: string;
};

export type SealedJudgment = SealedJudgmentMetadata;
export type JudgmentPackage = SealedJudgmentMetadata;

export type TasteEpisode = {
  schema_version: "1.0.0";
  suite_version: string;
  episode_id: string;
  task: string;
  factual_evidence: Evidence[];
  candidates: Candidate[];
  target_evidence: TargetEvidence[];
  context: TasteContext;
  control_condition: ControlCondition;
  allowed_actions: DecisionAction[];
  decision?: DecisionArtifact;
  sealed_judgment: SealedJudgmentMetadata;
};
