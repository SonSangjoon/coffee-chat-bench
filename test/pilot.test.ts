import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PILOT_EPISODES } from "../src/pilot.ts";
import { evaluateTasteContrast } from "../src/taste-evaluator.ts";
import { validateTasteEpisode } from "../src/taste.ts";

describe("generic Taste pilot corpus", () => {
  it("contains valid public, control, hold, and held-out episodes", () => {
    assert.ok(PILOT_EPISODES.length >= 5);
    assert.equal(new Set(PILOT_EPISODES.map(({ episode_id }) => episode_id)).size, PILOT_EPISODES.length);
    assert.ok(PILOT_EPISODES.some(({ control }) => control.condition === "taste"));
    for (const condition of ["knowledge-only", "retrieval-only", "explicit-rule", "style"] as const) {
      assert.ok(PILOT_EPISODES.some(({ control }) => control.condition === condition));
    }
    assert.ok(PILOT_EPISODES.some(({ evaluation_split }) => evaluation_split === "held-out"));

    for (const episode of PILOT_EPISODES) {
      assert.doesNotThrow(() => validateTasteEpisode(episode));
    }
  });

  it("includes a valid epistemic hold case", () => {
    const holdCase = PILOT_EPISODES.find(({ episode_id }) => episode_id === "pilot-hold");
    assert.ok(holdCase);
    assert.ok(
      holdCase.sealed_judgment.acceptable_decisions.some(
        ({ decision }) => decision.action === "hold" || decision.action === "ask",
      ),
    );
  });

  it("encodes irrelevant invariance and relevant sensitivity as pair cases", () => {
    const pairCases = new Map<string, typeof PILOT_EPISODES>();
    for (const episode of PILOT_EPISODES) {
      if (!episode.pair) continue;
      const existing = pairCases.get(episode.pair.pair_id) ?? [];
      existing.push(episode);
      pairCases.set(episode.pair.pair_id, existing);
    }

    const invariantPair = pairCases.get("pilot-invariance");
    const sensitivePair = pairCases.get("pilot-sensitivity");
    assert.ok(invariantPair && invariantPair.length === 2);
    assert.ok(sensitivePair && sensitivePair.length === 2);

    const evaluatePair = (pair: typeof PILOT_EPISODES) => {
      const anchor = pair.find(({ pair: metadata }) => metadata?.role === "anchor");
      const contrast = pair.find(({ pair: metadata }) => metadata?.role === "contrast");
      assert.ok(anchor && contrast);
      return evaluateTasteContrast(
        {
          episode: anchor,
          decision: anchor.sealed_judgment.acceptable_decisions[0].decision,
        },
        {
          episode: contrast,
          decision: contrast.sealed_judgment.acceptable_decisions[0].decision,
        },
      );
    };

    assert.equal(evaluatePair(invariantPair).score, 1);
    assert.equal(evaluatePair(sensitivePair).score, 1);
  });
});
