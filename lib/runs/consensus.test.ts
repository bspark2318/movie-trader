import { test } from "node:test";
import assert from "node:assert/strict";
import {
  medianAggregate,
  maxPairwiseDisagreement,
  topBracket,
} from "./consensus";
import type { AgentOutput } from "../agents/types";

const LABELS = ["a", "b", "c"];

function out(probs: Record<string, number>): AgentOutput {
  return {
    bracket_probs: probs,
    confidence: "medium",
    key_evidence: [],
    what_would_change_my_mind: "",
  };
}

test("medianAggregate takes per-bracket median, then renormalizes", () => {
  // One rogue distribution shouldn't swing the median.
  const ens = medianAggregate(
    [
      { bracket_probs: { a: 0.3, b: 0.4, c: 0.3 } },
      { bracket_probs: { a: 0.35, b: 0.35, c: 0.3 } },
      { bracket_probs: { a: 0.9, b: 0.05, c: 0.05 } }, // rogue
    ],
    LABELS,
  );
  const sum = LABELS.reduce((s, l) => s + ens[l], 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  // Median of a is 0.35 (not pulled to 0.9).
  assert.ok(ens.a < 0.45);
});

test("maxPairwiseDisagreement measures the spread on one bracket", () => {
  const d = maxPairwiseDisagreement(
    [out({ a: 0.2, b: 0.8 }), out({ a: 0.5, b: 0.5 }), out({ a: 0.21, b: 0.79 })],
    "a",
  );
  assert.ok(Math.abs(d - 0.3) < 1e-9); // 0.5 - 0.2
});

test("topBracket returns the argmax", () => {
  assert.deepEqual(topBracket({ a: 0.2, b: 0.5, c: 0.3 }), {
    label: "b",
    prob: 0.5,
  });
});
