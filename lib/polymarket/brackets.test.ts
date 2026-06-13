import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBracketLabel, winningBracket } from "./brackets";

test("parses bracket label forms", () => {
  assert.deepEqual(parseBracketLabel("<145m"), { loMillions: null, hiMillions: 145 });
  assert.deepEqual(parseBracketLabel(">184m"), { loMillions: 184, hiMillions: null });
  assert.deepEqual(parseBracketLabel("145-158m"), { loMillions: 145, hiMillions: 158 });
  assert.deepEqual(parseBracketLabel("$145-158M"), { loMillions: 145, hiMillions: 158 });
});

test("tie rule: boundary value resolves to the HIGHER bracket", () => {
  const brackets = [
    { label: "<145m", loMillions: null, hiMillions: 145 },
    { label: "145-158m", loMillions: 145, hiMillions: 158 },
    { label: ">158m", loMillions: 158, hiMillions: null },
  ];
  // Exactly 145 → higher bracket (145-158m), not <145m.
  assert.equal(winningBracket(145, brackets), "145-158m");
  // Exactly 158 → >158m, not 145-158m.
  assert.equal(winningBracket(158, brackets), ">158m");
  assert.equal(winningBracket(150, brackets), "145-158m");
  assert.equal(winningBracket(100, brackets), "<145m");
  assert.equal(winningBracket(200, brackets), ">158m");
});
