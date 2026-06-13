import { test } from "node:test";
import assert from "node:assert/strict";
import { brierScore, marketImpliedProbs } from "./brier";
import { fullKelly, quarterKelly, evPerShare } from "../sizing/kelly";

const LABELS = ["a", "b", "c"];

test("brier: perfect confident prediction scores 0", () => {
  assert.equal(brierScore({ a: 1, b: 0, c: 0 }, LABELS, "a"), 0);
});

test("brier: confident-and-wrong scores 2", () => {
  assert.equal(brierScore({ a: 1, b: 0, c: 0 }, LABELS, "b"), 2);
});

test("brier: uniform guess scores between", () => {
  const s = brierScore({ a: 1 / 3, b: 1 / 3, c: 1 / 3 }, LABELS, "a");
  // (1/3-1)^2 + (1/3)^2 + (1/3)^2 = 4/9 + 1/9 + 1/9 = 6/9
  assert.ok(Math.abs(s - 6 / 9) < 1e-9);
});

test("marketImpliedProbs renormalizes per-bracket mids", () => {
  const p = marketImpliedProbs({ a: 0.2, b: 0.2, c: 0.1 }, LABELS);
  const sum = LABELS.reduce((s, l) => s + p[l], 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.ok(Math.abs(p.a - 0.4) < 1e-9);
});

test("kelly: positive edge yields positive fraction; quarter is 1/4", () => {
  const full = fullKelly(0.6, 0.5);
  assert.ok(full > 0);
  assert.ok(Math.abs(quarterKelly(0.6, 0.5) - full / 4) < 1e-12);
});

test("kelly: no edge yields zero", () => {
  assert.equal(fullKelly(0.5, 0.5), 0);
  assert.equal(fullKelly(0.4, 0.5), 0);
});

test("evPerShare is prob minus price", () => {
  assert.ok(Math.abs(evPerShare(0.6, 0.45) - 0.15) < 1e-9);
});
