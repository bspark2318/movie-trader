import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateGate } from "./index";
import type { BoxOfficeEvent, Bracket } from "../polymarket/types";
import type { AgentOutput } from "../agents/types";

function bracket(p: Partial<Bracket> & { label: string }): Bracket {
  return {
    polymarketMarketId: "m",
    label: p.label,
    loMillions: p.loMillions ?? null,
    hiMillions: p.hiMillions ?? null,
    yesPrice: p.yesPrice ?? 0.5,
    bestBid: p.bestBid ?? 0.5,
    bestAsk: p.bestAsk ?? 0.5,
    mid: p.mid ?? 0.5,
    spread: p.spread ?? 0.02,
    liquidity: p.liquidity ?? 500,
    volume24hr: 0,
    clobTokenIds: [],
  };
}

function ev(brackets: Bracket[], hoursOut = 72): BoxOfficeEvent {
  return {
    polymarketEventId: "e",
    slug: "s",
    title: "t",
    movieTitle: "Test",
    resolutionRules: "",
    endDate: new Date(Date.now() + hoursOut * 3_600_000).toISOString(),
    weekendType: "3-day",
    weekendDates: null,
    liquidity: 1000,
    volume24hr: 0,
    brackets,
  };
}

function out(probs: Record<string, number>): AgentOutput {
  return {
    bracket_probs: probs,
    confidence: "high",
    key_evidence: [],
    what_would_change_my_mind: "",
  };
}

test("emits a BET when all four conditions pass", () => {
  const brackets = [
    bracket({ label: "lo", bestAsk: 0.2, liquidity: 500, spread: 0.02 }),
    bracket({ label: "hi", bestAsk: 0.3, liquidity: 500, spread: 0.02 }),
  ];
  // lo: ensemble 0.55 vs ask 0.20 → edge 0.35 (largest). Agreement tight on lo.
  const ensemble = { lo: 0.55, hi: 0.45 };
  const consensus = [
    out({ lo: 0.56, hi: 0.44 }),
    out({ lo: 0.55, hi: 0.45 }),
    out({ lo: 0.54, hi: 0.46 }),
  ];
  const g = evaluateGate(ev(brackets), ensemble, consensus);
  assert.ok(g.emit, JSON.stringify(g.checks));
  // Candidate is the bracket with the largest YES edge vs its ask.
  assert.equal(g.candidate?.bracketLabel, "lo");
  assert.ok(g.candidate!.quarterKellyFraction > 0);
});

test("NO BET when models disagree on the candidate", () => {
  const brackets = [
    bracket({ label: "lo", bestAsk: 0.2 }),
    bracket({ label: "hi", bestAsk: 0.3 }),
  ];
  const ensemble = { lo: 0.5, hi: 0.5 };
  const consensus = [
    out({ lo: 0.2, hi: 0.8 }),
    out({ lo: 0.6, hi: 0.4 }),
    out({ lo: 0.7, hi: 0.3 }),
  ];
  const g = evaluateGate(ev(brackets), ensemble, consensus);
  assert.equal(g.emit, false);
  assert.equal(g.checks.agreement.pass, false);
});

test("NO BET when edge below 8 pts", () => {
  const brackets = [bracket({ label: "hi", bestAsk: 0.48 })];
  const ensemble = { hi: 0.5 };
  const consensus = [out({ hi: 0.5 }), out({ hi: 0.5 }), out({ hi: 0.5 })];
  const g = evaluateGate(ev(brackets), ensemble, consensus);
  assert.equal(g.checks.edge.pass, false);
  assert.equal(g.emit, false);
});

test("NO BET inside 24h to resolution", () => {
  const brackets = [
    bracket({ label: "lo", bestAsk: 0.2 }),
    bracket({ label: "hi", bestAsk: 0.3 }),
  ];
  const ensemble = { lo: 0.45, hi: 0.55 };
  const consensus = [out({ lo: 0.45, hi: 0.55 }), out({ lo: 0.45, hi: 0.55 }), out({ lo: 0.45, hi: 0.55 })];
  const g = evaluateGate(ev(brackets, 12), ensemble, consensus);
  assert.equal(g.checks.timing.pass, false);
  assert.equal(g.emit, false);
});
