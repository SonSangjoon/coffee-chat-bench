import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import Ajv from "ajv/dist/2020.js";
import { PILOT_EPISODES } from "../src/pilot.ts";
import { toPublicTasteEpisode } from "../src/taste.ts";

function readSchema(name: string): Record<string, any> {
  return JSON.parse(
    readFileSync(new URL(`../schemas/${name}`, import.meta.url), "utf8"),
  ) as Record<string, any>;
}

describe("benchmark schema contracts", () => {
  it("uses claim consistently for generic evidence", () => {
    const schema = readSchema("eval-case.schema.json");
    const evidence = schema.$defs.evidence;

    assert.deepEqual(evidence.required, ["source_id", "claim"]);
    assert.equal("claim" in evidence.properties, true);
    assert.equal("content" in evidence.properties, false);
  });

  it("keeps the public Taste schema free of sealed judgment fields", () => {
    const publicSchema = readSchema("taste-episode.public.schema.json");

    assert.equal(publicSchema.required.includes("sealed_judgment"), false);
    assert.equal(publicSchema.required.includes("evaluation_split"), false);
    assert.equal("sealed_judgment" in publicSchema.properties, false);
    assert.equal("pair" in publicSchema.properties, false);
  });

  it("declares the generic report case shape instead of accepting arbitrary case objects", () => {
    const schema = readSchema("eval-report.schema.json");
    assert.deepEqual(schema.properties.cases.items, {
      $ref: "#/$defs/evaluation_result",
    });
    assert.equal("evaluation_result" in schema.$defs, true);
    assert.equal(schema.$defs.semantic_dimension.properties.measured.type, "boolean");
  });

  it("serializes failed results with explicit null output", () => {
    const schema = readSchema("eval-report.schema.json");
    const ajv = new Ajv({ strict: false });
    const valid = ajv.compile(schema);
    const report = {
      schema_version: "1.0.0",
      run_id: "failed-run",
      suite_version: "0.1.0",
      candidate: {
        candidate_id: "fixture",
        version: "0.1.0",
        source_ref: "fixture",
        adapter_version: "0.1.0",
      },
      status: "failed",
      execution_order: ["failed-case"],
      cases: [
        {
          schema_version: "1.0.0",
          case_id: "failed-case",
          candidate: {
            candidate_id: "fixture",
            version: "0.1.0",
            source_ref: "fixture",
            adapter_version: "0.1.0",
          },
          status: "failed",
          output: null,
          evidence: [],
          actions: [],
          trace: [],
          deterministic: { passed: [], failed: [] },
          semantic: {
            status: "passed",
            dimensions: {
              viewpoint_lift: {
                score: 0,
                max: 1,
                measured: false,
                rationale: "Control not supplied.",
              },
            },
          },
          cleanup: { status: "clean" },
        },
      ],
      summary: {
        total: 1,
        passed: 0,
        failed: 1,
        deterministic_failures: 0,
        semantic_failures: 0,
      },
      score_vector: {},
    };

    assert.equal(valid(report), true, JSON.stringify(ajv.errors));
  });

  it("validates representative full and public Taste episodes against their schemas", () => {
    const ajv = new Ajv({ strict: false });
    const fullValid = ajv.compile(readSchema("taste-episode.schema.json"));
    const publicValid = ajv.compile(readSchema("taste-episode.public.schema.json"));
    const episode = PILOT_EPISODES[0];

    assert.equal(fullValid(episode), true);
    assert.equal(publicValid(toPublicTasteEpisode(episode)), true);
  });
});
