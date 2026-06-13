import { test } from "node:test";
import assert from "node:assert/strict";
import { extractJson, renormalize, validateAgentOutput } from "./schema";

const LABELS = ["<145m", "145-158m", ">158m"];

test("extractJson pulls the last fenced block", () => {
  const raw =
    'Here is my reasoning.\n```json\n{"a":1}\n```\nFinal:\n```json\n{"bracket_probs":{}}\n```';
  assert.deepEqual(extractJson(raw), { bracket_probs: {} });
});

test("renormalize forces sum to 1 over known labels", () => {
  const out = renormalize({ "<145m": 2, "145-158m": 2, ">158m": 0 }, LABELS);
  const sum = LABELS.reduce((s, l) => s + out[l], 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.ok(Math.abs(out["<145m"] - 0.5) < 1e-9);
});

test("renormalize falls back to uniform on degenerate input", () => {
  const out = renormalize({}, LABELS);
  LABELS.forEach((l) => assert.ok(Math.abs(out[l] - 1 / 3) < 1e-9));
});

test("validateAgentOutput accepts a well-formed response and renormalizes", () => {
  const raw =
    '```json\n{"bracket_probs":{"<145m":0.1,"145-158m":0.3,">158m":0.4},"confidence":"medium","key_evidence":["x"],"what_would_change_my_mind":"y"}\n```';
  const v = validateAgentOutput(raw, LABELS);
  assert.ok(v.ok, v.error);
  const sum = LABELS.reduce((s, l) => s + v.output!.bracket_probs[l], 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test("validateAgentOutput rejects missing bracket keys", () => {
  const raw =
    '```json\n{"bracket_probs":{"<145m":1},"confidence":"low","key_evidence":[],"what_would_change_my_mind":""}\n```';
  const v = validateAgentOutput(raw, LABELS);
  assert.equal(v.ok, false);
  assert.match(v.error!, /Missing/);
});

test("validateAgentOutput rejects non-JSON", () => {
  const v = validateAgentOutput("I cannot answer that.", LABELS);
  assert.equal(v.ok, false);
});
