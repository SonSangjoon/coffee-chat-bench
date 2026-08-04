export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type Evidence = {
  source_id: string;
  claim: string;
};

export type Action = {
  name: string;
  target?: string;
};

export type TraceEvent = {
  type: string;
  detail: string;
};

export type RubricCriterion = {
  id: string;
  description: string;
  scale: { min: number; max: number };
};

export type EvaluationMethod = "deterministic" | "semantic" | "pairwise";

export type EvalCase = {
  schema_version: "1.0.0";
  suite_version: string;
  case_id: string;
  capability: string;
  task: string;
  starting_context: JsonValue;
  explicit_inputs: JsonValue;
  declared_evidence?: Evidence[];
  expected_capabilities: string[];
  forbidden_behaviors: string[];
  allowed_actions?: string[];
  protected_state?: string[];
  quality_rubric: RubricCriterion[];
  evaluation_methods: EvaluationMethod[];
};

export type CandidateIdentity = {
  candidate_id: string;
  version: string;
  source_ref: string;
};

export type PreparedCase = {
  case_id: string;
  sandbox_id: string;
};

export type CandidateHandle = {
  handle_id: string;
};

export type CleanupResult =
  | { status: "clean" }
  | { status: "dirty"; residuals: string[] };

export type CandidateAdapter = {
  adapter_version: string;
  candidate_identity: CandidateIdentity;
  prepare(testCase: EvalCase): Promise<PreparedCase>;
  invoke(prepared: PreparedCase): Promise<CandidateHandle>;
  collect_output(handle: CandidateHandle): Promise<unknown>;
  collect_evidence(handle: CandidateHandle): Promise<Evidence[]>;
  collect_actions(handle: CandidateHandle): Promise<Action[]>;
  collect_trace(handle: CandidateHandle): Promise<TraceEvent[]>;
  cleanup(
    handle: CandidateHandle | undefined,
    prepared: PreparedCase,
  ): Promise<CleanupResult>;
};

export type SemanticDimension = {
  score: number;
  max: number;
  rationale: string;
};

export type SemanticResult =
  | { status: "not-run" }
  | {
      status: "passed" | "failed";
      dimensions: Record<string, SemanticDimension>;
      failure?: { code: string; message: string };
    };

export type SemanticEvaluator = {
  evaluate(input: {
    testCase: EvalCase;
    result: EvaluationResult;
  }): Promise<Extract<SemanticResult, { status: "passed" | "failed" }>>;
};

export type DeterministicFinding = {
  code:
    | "missing-output"
    | "undeclared-evidence"
    | "forbidden-action"
    | "disallowed-action"
    | "cleanup-dirty";
  message: string;
  subject?: string;
};

export type EvaluationResult = {
  schema_version: "1.0.0";
  case_id: string;
  candidate: CandidateIdentity & { adapter_version: string };
  status: "passed" | "failed";
  output: unknown;
  evidence: Evidence[];
  actions: Action[];
  trace: TraceEvent[];
  deterministic: {
    passed: DeterministicFinding[];
    failed: DeterministicFinding[];
  };
  semantic: SemanticResult;
  cleanup: CleanupResult;
  failure?: { code: string; message: string };
};

export type EvaluationSuiteOptions = {
  run_id: string;
  order?: "declared" | "seeded";
  seed?: string;
  semanticEvaluator?: SemanticEvaluator;
};

export type EvaluationReport = {
  schema_version: "1.0.0";
  run_id: string;
  suite_version: string;
  candidate: CandidateIdentity & { adapter_version: string };
  status: "passed" | "failed";
  execution_order: string[];
  cases: EvaluationResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    deterministic_failures: number;
    semantic_failures: number;
  };
  score_vector: Record<
    string,
    { mean: number; max: number; cases: number }
  >;
};

export async function runEvaluationCase(
  testCase: EvalCase,
  adapter: CandidateAdapter,
  options: { semanticEvaluator?: SemanticEvaluator } = {},
): Promise<EvaluationResult> {
  validateCase(testCase);

  let prepared: PreparedCase | undefined;
  let handle: CandidateHandle | undefined;
  let output: unknown;
  let evidence: Evidence[] = [];
  let actions: Action[] = [];
  let trace: TraceEvent[] = [];
  let failure: { code: string; message: string } | undefined;
  let cleanup: CleanupResult = { status: "clean" };

  try {
    prepared = await adapter.prepare(testCase);
    if (prepared.case_id !== testCase.case_id) {
      throw new Error(
        `adapter prepared ${prepared.case_id} for ${testCase.case_id}`,
      );
    }
    handle = await adapter.invoke(prepared);
    output = await adapter.collect_output(handle);
    evidence = await adapter.collect_evidence(handle);
    actions = await adapter.collect_actions(handle);
    trace = await adapter.collect_trace(handle);
  } catch (error) {
    failure = {
      code: "candidate-invocation-failed",
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (prepared) {
      try {
        cleanup = await adapter.cleanup(handle, prepared);
      } catch (error) {
        cleanup = {
          status: "dirty",
          residuals: [
            error instanceof Error ? error.message : "cleanup failed",
          ],
        };
      }
    }
  }

  const deterministic = failure
    ? { passed: [], failed: [] }
    : evaluateDeterministic(testCase, output, evidence, actions, cleanup);
  const baseResult: EvaluationResult = {
    schema_version: "1.0.0",
    case_id: testCase.case_id,
    candidate: {
      ...adapter.candidate_identity,
      adapter_version: adapter.adapter_version,
    },
    status:
      failure || deterministic.failed.length > 0 ? "failed" : "passed",
    output,
    evidence,
    actions,
    trace,
    deterministic,
    semantic: { status: "not-run" },
    cleanup,
    ...(failure ? { failure } : {}),
  };

  if (!failure && deterministic.failed.length === 0 && options.semanticEvaluator) {
    baseResult.semantic = await options.semanticEvaluator.evaluate({
      testCase,
      result: baseResult,
    });
  }

  const status =
    failure ||
    deterministic.failed.length > 0 ||
    baseResult.semantic.status === "failed"
      ? "failed"
      : "passed";
  return { ...baseResult, status };
}

export async function runEvaluationSuite(
  cases: EvalCase[],
  adapter: CandidateAdapter,
  options: EvaluationSuiteOptions,
): Promise<EvaluationReport> {
  if (!options.run_id.trim()) throw new Error("run_id is required");
  if (cases.length === 0) throw new Error("at least one case is required");

  const orderedCases = orderCases(cases, options.order ?? "declared", options.seed);
  const results: EvaluationResult[] = [];
  for (const testCase of orderedCases) {
    results.push(
      await runEvaluationCase(testCase, adapter, {
        semanticEvaluator: options.semanticEvaluator,
      }),
    );
  }

  const failed = results.filter(({ status }) => status === "failed");
  const deterministicFailures = results.filter(
    ({ deterministic }) => deterministic.failed.length > 0,
  ).length;
  const semanticFailures = results.filter(
    ({ semantic }) => semantic.status === "failed",
  ).length;

  return {
    schema_version: "1.0.0",
    run_id: options.run_id,
    suite_version: orderedCases[0].suite_version,
    candidate: results[0].candidate,
    status: failed.length === 0 ? "passed" : "failed",
    execution_order: orderedCases.map(({ case_id }) => case_id),
    cases: results,
    summary: {
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
      deterministic_failures: deterministicFailures,
      semantic_failures: semanticFailures,
    },
    score_vector: aggregateScores(results),
  };
}

function validateCase(testCase: EvalCase): void {
  if (!testCase.case_id.trim()) throw new Error("case_id is required");
  if (!testCase.capability.trim()) throw new Error("capability is required");
  if (!testCase.task.trim()) throw new Error("task is required");
  if (testCase.expected_capabilities.length === 0) {
    throw new Error("expected_capabilities must not be empty");
  }
  if (testCase.evaluation_methods.length === 0) {
    throw new Error("evaluation_methods must not be empty");
  }
}

function evaluateDeterministic(
  testCase: EvalCase,
  output: unknown,
  evidence: Evidence[],
  actions: Action[],
  cleanup: CleanupResult,
): EvaluationResult["deterministic"] {
  const passed: DeterministicFinding[] = [];
  const failed: DeterministicFinding[] = [];

  if (output === undefined || output === null || output === "") {
    failed.push({
      code: "missing-output",
      message: "The candidate returned no output.",
    });
  } else {
    passed.push({
      code: "missing-output",
      message: "The candidate returned output.",
    });
  }

  if (testCase.declared_evidence) {
    const declared = new Set(
      testCase.declared_evidence.map(({ source_id }) => source_id),
    );
    const undeclared = evidence.filter(({ source_id }) => !declared.has(source_id));
    for (const item of undeclared) {
      failed.push({
        code: "undeclared-evidence",
        message: `Evidence cites undeclared source ${item.source_id}.`,
        subject: item.source_id,
      });
    }
    if (undeclared.length === 0) {
      passed.push({
        code: "undeclared-evidence",
        message: "All evidence references declared sources.",
      });
    }
  }

  const forbidden = new Set(testCase.forbidden_behaviors);
  const allowed = testCase.allowed_actions
    ? new Set(testCase.allowed_actions)
    : undefined;
  for (const action of actions) {
    if (forbidden.has(action.name)) {
      failed.push({
        code: "forbidden-action",
        message: `Candidate performed forbidden action ${action.name}.`,
        subject: action.name,
      });
    } else if (allowed && !allowed.has(action.name)) {
      failed.push({
        code: "disallowed-action",
        message: `Candidate performed action ${action.name} outside the allowed set.`,
        subject: action.name,
      });
    }
  }
  if (actions.every(({ name }) => !forbidden.has(name))) {
    passed.push({
      code: "forbidden-action",
      message: "No forbidden action was observed.",
    });
  }

  if (cleanup.status === "dirty") {
    failed.push({
      code: "cleanup-dirty",
      message: `Cleanup left residual state: ${cleanup.residuals.join(", ")}.`,
    });
  } else {
    passed.push({
      code: "cleanup-dirty",
      message: "Candidate cleanup left no residual state.",
    });
  }

  return { passed, failed };
}

function orderCases(
  cases: EvalCase[],
  order: "declared" | "seeded",
  seed: string | undefined,
): EvalCase[] {
  if (order === "declared") return [...cases];
  if (!seed?.trim()) throw new Error("seed is required for seeded order");
  return [...cases].sort((left, right) =>
    stableHash(`${seed}\u0000${left.case_id}`).localeCompare(
      stableHash(`${seed}\u0000${right.case_id}`),
    ),
  );
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function aggregateScores(
  results: EvaluationResult[],
): EvaluationReport["score_vector"] {
  const values = new Map<
    string,
    { total: number; max: number; cases: number }
  >();
  for (const result of results) {
    if (result.semantic.status === "not-run") continue;
    for (const [id, dimension] of Object.entries(result.semantic.dimensions)) {
      const current = values.get(id) ?? {
        total: 0,
        max: dimension.max,
        cases: 0,
      };
      current.total += dimension.score;
      current.max = Math.max(current.max, dimension.max);
      current.cases += 1;
      values.set(id, current);
    }
  }
  return Object.fromEntries(
    [...values.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, value]) => [
        id,
        {
          mean: value.total / value.cases,
          max: value.max,
          cases: value.cases,
        },
      ]),
  );
}
