import {
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
import { evaluateTasteDecision } from "./taste-evaluator.ts";

export type TasteSemanticEvaluatorOptions = {
  extractDecision: (output: unknown) => TasteDecision;
  matched_control_utility?: number;
};

export type TasteSuiteOptions = TasteSemanticEvaluatorOptions & {
  run_id: string;
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
        id: "viewpoint_lift",
        description: "Target-specific utility above a matched control.",
        scale: { min: -1, max: 1 },
      },
      {
        id: "selection",
        description: "Agreement with the acceptable decision distribution.",
        scale: { min: 0, max: 1 },
      },
      {
        id: "hold_ask",
        description: "Appropriate epistemic hold or clarification.",
        scale: { min: 0, max: 1 },
      },
    ],
    evaluation_methods: ["deterministic", "semantic", "pairwise"],
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

  return runEvaluationSuite(
    episodes.map(tasteEpisodeToEvalCase),
    adapter,
    {
      run_id: options.run_id,
      order: options.order,
      seed: options.seed,
      semanticEvaluator,
    },
  );
}
