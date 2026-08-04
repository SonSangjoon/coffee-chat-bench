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
    assert.equal("sealed_judgment" in publicSchema.properties, false);
  });

  it("declares the generic report case shape instead of accepting arbitrary case objects", () => {
    const schema = readSchema("eval-report.schema.json");
    assert.deepEqual(schema.properties.cases.items, {
      $ref: "#/$defs/evaluation_result",
    });
    assert.equal("evaluation_result" in schema.$defs, true);
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
