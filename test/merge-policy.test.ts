import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyChangedPaths } from "../.github/merge-policy.mjs";

test("ordinary benchmark documentation uses the auto lane", () => {
  assert.deepEqual(classifyChangedPaths(["README.md", "test/suite.test.ts"]), {
    classification: "auto",
    protectedPaths: [],
    paths: ["README.md", "test/suite.test.ts"],
  });
});

test("benchmark construct and verifier changes use the protected lane", () => {
  const result = classifyChangedPaths([
    "src/taste-evaluator.ts",
    "benchmarks/case-001.json",
    "README.md",
  ]);
  assert.equal(result.classification, "protected");
  assert.deepEqual(result.protectedPaths, [
    "src/taste-evaluator.ts",
    "benchmarks/case-001.json",
  ]);
});
