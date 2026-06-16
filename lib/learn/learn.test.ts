import { test } from "node:test";
import assert from "node:assert/strict";
import { brierToWeights } from "./index";
import {
  buildCalibrationMapping,
  applyCalibration,
  calibrateDistribution,
} from "./calibration";
import { tuneThresholds } from "./gate-tuning";

test("brierToWeights: lower Brier earns more weight, sums to 1", () => {
  const w = brierToWeights([0.1, 0.5, 1.0]);
  assert.ok(Math.abs(w.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.ok(w[0] > w[1] && w[1] > w[2]);
});

test("brierToWeights: equal Briers → equal weights", () => {
  const w = brierToWeights([0.3, 0.3, 0.3]);
  for (const x of w) assert.ok(Math.abs(x - 1 / 3) < 1e-9);
});

test("calibration: maps overconfident predictions toward realized rate", () => {
  // We say ~0.85 but it only happens half the time (all in one bin).
  const pairs = [
    { p: 0.85, o: 1 },
    { p: 0.85, o: 0 },
    { p: 0.85, o: 1 },
    { p: 0.85, o: 0 },
  ];
  const mapping = buildCalibrationMapping(pairs);
  assert.equal(applyCalibration(0.85, mapping), 0.5); // realized rate in that bin
});

test("applyCalibration: identity when no mapping", () => {
  assert.equal(applyCalibration(0.42, []), 0.42);
});

test("calibrateDistribution: renormalizes to sum 1", () => {
  const pairs = [
    { p: 0.6, o: 1 },
    { p: 0.61, o: 0 },
  ];
  const mapping = buildCalibrationMapping(pairs);
  const out = calibrateDistribution(
    { a: 0.6, b: 0.3, c: 0.1 },
    ["a", "b", "c"],
    mapping,
  );
  const sum = Object.values(out).reduce((x, y) => x + y, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test("tuneThresholds: returns null below the minimum sample", () => {
  const few = [{ edgePts: 10, agreementPts: 3, pnlPerShare: 0.2 }];
  assert.equal(tuneThresholds(few), null);
});

test("tuneThresholds: picks thresholds that select profitable trades", () => {
  // High-edge, low-disagreement trades win; the rest lose.
  const trades = [
    ...Array.from({ length: 6 }, () => ({
      edgePts: 12,
      agreementPts: 3,
      pnlPerShare: 0.4,
    })),
    ...Array.from({ length: 6 }, () => ({
      edgePts: 5,
      agreementPts: 12,
      pnlPerShare: -0.3,
    })),
  ];
  const t = tuneThresholds(trades, 4);
  assert.ok(t !== null);
  // The learned thresholds must admit the winners and reject the losers.
  const admits = (edge: number, agr: number) =>
    edge >= t!.edgeMin * 100 && agr <= t!.agreementMax * 100;
  assert.ok(admits(12, 3)); // winner passes
  assert.ok(!admits(5, 12)); // loser rejected
});
