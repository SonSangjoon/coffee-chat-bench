import {
  aggregateScoreVector,
  runEvaluationCase,
  runEvaluationSuite,
  type EvalCase,
  type CandidateAdapter,
  type EvaluationReport,
  type SemanticEvaluator,
} from "./runner.ts";
import {
  toPublicTasteEpisode,
  validateTasteEpisode,
  type TasteDecision,
  type TasteEpisode,
} from "./taste.ts";
import {
  evaluateTasteContrast,
  evaluateTasteDecision,
} from "./taste-evaluator.ts";

export type TasteSemanticEvaluatorOptions = {
  extractDecision: (output: unknown) => TasteDecision;
  matched_control_utility?: number;
};

export type TasteSuiteOptions = {
  run_id: string;
  extractDecision: (output: unknown) => TasteDecision;
  matched_control_utility?: Record<string, number>;
  order?: "declared" | "seeded";
  seed?: string;
};

export function tasteEpisodeToEvalCase(episode: TasteEpisode): EvalCase {
  validateTasteEpisode(episode);
  return {
    schema_version: "1.0.0",
    suite_version: episode.suite_version,
    case_id: episode.episode_id,
    capability: episode.capability,
    task: episode.task,
    starting_context: episode.context,
    explicit_inputs: toPublicTasteEpisode(episode),
    declared_evidence: [
      ...episode.factual_evidence,
      ...episode.target_evidence,
    ],
    expected_capabilities: [episode.capability],
    forbidden_behaviors: [],
    allowed_actions: episode.allowed_actions,
    protected_state: [],
    quality_rubric: [
      {
        id: "decision-contract",
        description: "Return a source-grounded decision that fits the task context and available evidence.",
        scale: { min: 0, max: 1 },
      },
    ],
    evaluation_methods: [
      "deterministic",
      "semantic",
      ...(episode.pair ? ["pairwise" as const] : []),
    ],
  };
}

export function createTasteSemanticEvaluator(
  episode: TasteEpisode,
  options: TasteSemanticEvaluatorOptions,
): SemanticEvaluator {
  validateTasteEpisode(episode);
  return {
    async evaluate({ result }) {
      try {
        const decision = options.extractDecision(result.output);
        const evaluation = evaluateTasteDecision(episode, decision, {
          matched_control_utility: options.matched_control_utility,
        });
        return {
          status: "passed",
          dimensions: evaluation.dimensions,
        };
      } catch (error) {
        return {
          status: "failed",
          dimensions: {},
          failure: {
            code: "taste-decision-invalid",
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
    },
  };
}

export async function runTasteEpisode(
  episode: TasteEpisode,
  adapter: CandidateAdapter,
  options: TasteSemanticEvaluatorOptions,
) {
  return runEvaluationCase(tasteEpisodeToEvalCase(episode), adapter, {
    semanticEvaluator: createTasteSemanticEvaluator(episode, options),
  });
}

export async function runTasteSuite(
  episodes: TasteEpisode[],
  adapter: CandidateAdapter,
  options: TasteSuiteOptions,
): Promise<EvaluationReport> {
  if (episodes.length === 0) throw new Error("at least one Taste episode is required");
  const byId = new Map(episodes.map((episode) => [episode.episode_id, episode]));
  validateMatchedControlUtilities(episodes, options.matched_control_utility);
  const semanticEvaluator: SemanticEvaluator = {
    async evaluate({ testCase, result }) {
      const episode = byId.get(testCase.case_id);
      if (!episode) {
        return {
          status: "failed",
          dimensions: {},
          failure: {
            code: "taste-episode-not-found",
            message: `No Taste episode found for ${testCase.case_id}.`,
          },
        };
      }
      try {
        const decision = options.extractDecision(result.output);
        const evaluation = evaluateTasteDecision(episode, decision, {
          matched_control_utility: options.matched_control_utility?.[episode.episode_id],
        });
        return { status: "passed", dimensions: evaluation.dimensions };
      } catch (error) {
        return {
          status: "failed",
          dimensions: {},
          failure: {
            code: "taste-decision-invalid",
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
    },
  };

  const report = await runEvaluationSuite(
    episodes.map(tasteEpisodeToEvalCase),
    adapter,
    {
      run_id: options.run_id,
      order: options.order,
      seed: options.seed,
      semanticEvaluator,
    },
  );

  attachPairwiseMetrics(report, episodes, options.extractDecision);
  return report;
}

function validateMatchedControlUtilities(
  episodes: TasteEpisode[],
  utilities: Record<string, number> | undefined,
): void {
  if (!utilities) return;
  const episodeIds = new Set(episodes.map(({ episode_id }) => episode_id));
  for (const [episodeId, utility] of Object.entries(utilities)) {
    if (!episodeIds.has(episodeId)) {
      throw new Error(`matched control utility references unknown episode ${episodeId}`);
    }
    if (!Number.isFinite(utility) || utility < 0 || utility > 1) {
      throw new Error(`matched control utility for ${episodeId} must be between 0 and 1`);
    }
  }
}

function attachPairwiseMetrics(
  report: EvaluationReport,
  episodes: TasteEpisode[],
  extractDecision: (output: unknown) => TasteDecision,
): void {
  const episodesByPair = new Map<string, TasteEpisode[]>();
  for (const episode of episodes) {
    if (!episode.pair) continue;
    const members = episodesByPair.get(episode.pair.pair_id) ?? [];
    members.push(episode);
    episodesByPair.set(episode.pair.pair_id, members);
  }

  const resultsByCase = new Map(
    report.cases.map((result) => [result.case_id, result]),
  );
  for (const [pairId, members] of episodesByPair) {
    const anchor = members.find(({ pair }) => pair?.role === "anchor");
    const contrast = members.find(({ pair }) => pair?.role === "contrast");
    if (!anchor || !contrast || members.length !== 2) {
      throw new Error(`pair ${pairId} must contain exactly one anchor and one contrast`);
    }

    const anchorResult = resultsByCase.get(anchor.episode_id);
    const contrastResult = resultsByCase.get(contrast.episode_id);
    if (!anchorResult || !contrastResult) {
      throw new Error(`pair ${pairId} is missing an evaluation result`);
    }
    if (
      anchorResult.semantic.status !== "passed" ||
      contrastResult.semantic.status !== "passed"
    ) {
      continue;
    }

    const pairEvaluation = evaluateTasteContrast(
      {
        episode: anchor,
        decision: extractDecision(anchorResult.output),
      },
      {
        episode: contrast,
        decision: extractDecision(contrastResult.output),
      },
    );
    contrastResult.semantic.dimensions.pairwise = {
      score: pairEvaluation.score,
      max: 1,
      rationale: pairEvaluation.rationale,
    };
  }

  report.score_vector = aggregateScoreVector(report.cases);
}
