import { parseDailyChart, parseSchedule } from "./parse";
import type { DailyChartRow, ScheduleEntry } from "./types";

const BASE = "https://www.the-numbers.com";
const UA =
  "movie-edge-research/0.1 (personal research; contact bspark2317@gmail.com)";

// Politeness: serialize all requests through a promise chain enforcing >=1s gaps.
let lastRequest = Promise.resolve(0);

function politeFetch(url: string, revalidateSeconds: number): Promise<string> {
  const run = lastRequest.then(async (prevAt) => {
    const now = Date.now();
    const wait = Math.max(0, 1000 - (now - prevAt));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      next: { revalidate: revalidateSeconds },
    });
    if (!res.ok) throw new Error(`The Numbers ${url} → ${res.status}`);
    const html = await res.text();
    return { html, at: Date.now() };
  });
  // Advance the chain with the completion timestamp (ignore errors for pacing).
  lastRequest = run.then(
    (r) => r.at,
    () => Date.now(),
  );
  return run.then((r) => r.html);
}

const DAY = 60 * 60 * 24;
const HOUR = 60 * 60;

/**
 * Fetch a daily box-office chart. Charts older than ~14 days are final and
 * cached for a day; recent charts revise (studio estimates) so cache 1h.
 */
export async function fetchDailyChart(
  date: string /* YYYY-MM-DD */,
): Promise<DailyChartRow[]> {
  const [y, m, d] = date.split("-");
  const url = `${BASE}/box-office-chart/daily/${y}/${m}/${d}`;
  const ageDays = (Date.now() - Date.parse(date)) / (1000 * DAY);
  const revalidate = ageDays > 14 ? DAY : HOUR;
  const html = await politeFetch(url, revalidate);
  return parseDailyChart(html);
}

/** Fetch the wide-release schedule for a year. */
export async function fetchSchedule(year: number): Promise<ScheduleEntry[]> {
  const url = `${BASE}/movies/release-schedule/${year}`;
  const html = await politeFetch(url, DAY);
  return parseSchedule(html, year);
}
