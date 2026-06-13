import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDailyChart } from "./parse";

const fixture = readFileSync(
  join(__dirname, "__fixtures__", "daily-2026-06-05.html"),
  "utf8",
);

test("parses the daily chart into ranked rows", () => {
  const rows = parseDailyChart(fixture);
  assert.ok(rows.length >= 10, `expected >=10 rows, got ${rows.length}`);

  const top = rows[0];
  assert.equal(top.rank, 1);
  assert.equal(top.title, "Scary Movie");
  assert.equal(top.gross, 24815543);
  assert.equal(top.theaters, 3490);
  assert.equal(top.daysInRelease, 1);

  // Ranks should be strictly increasing from 1.
  rows.forEach((r, i) => assert.equal(r.rank, i + 1));
});
