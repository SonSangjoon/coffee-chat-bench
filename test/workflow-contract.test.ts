import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

const workflowRoot = join(import.meta.dirname, "..", ".github", "workflows");

test("required benchmark workflows are merge-queue aware and hardened", async () => {
  const names = (await readdir(workflowRoot)).filter((name) => name.endsWith(".yml"));
  assert.deepEqual(names.sort(), ["auto-merge.yml", "ci.yml", "codeql.yml", "security.yml"]);

  for (const name of names) {
    const source = await readFile(join(workflowRoot, name), "utf8");
    assert.match(source, /^permissions:\s*$/m, name);
    assert.doesNotMatch(source, /\bpull_request_target\b/, name);
    assert.doesNotMatch(source, /\$\{\{\s*secrets\./, name);
    for (const match of source.matchAll(/^\s*uses:\s*([^\s#]+)/gm)) {
      assert.match(match[1], /^[^@\s]+@[0-9a-f]{40}$/, `${name}: ${match[1]}`);
    }
  }

  for (const name of ["ci.yml", "codeql.yml", "security.yml"]) {
    assert.match(
      await readFile(join(workflowRoot, name), "utf8"),
      /\bmerge_group:\s*/,
      name,
    );
  }
});

test("the auto-merge controller is trusted and never executes candidate code", async () => {
  const source = await readFile(join(workflowRoot, "auto-merge.yml"), "utf8");
  assert.match(source, /workflow_run:/);
  assert.match(source, /gh pr checks[\s\S]*--required/);
  assert.match(source, /--auto --squash --match-head-commit/);
  assert.match(source, /merge-policy\.json\?ref=main/);
  assert.doesNotMatch(source, /actions\/(?:checkout|setup-node)@/);
});
