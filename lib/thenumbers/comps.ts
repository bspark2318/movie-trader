import { fetchDailyChart } from "./client";
import type { DailyChartRow } from "./types";

/** Add days to an ISO date, returning YYYY-MM-DD. */
function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface WeekendActuals {
  /** Fri+Sat+Sun three-day total in dollars (sum of per-title daily grosses). */
  threeDayTotalByTitle: Record<string, number>;
  /** Theater count seen on the Friday chart, by title. */
  fridayTheatersByTitle: Record<string, number>;
}

/**
 * Sum a movie's 3-day opening weekend from the Fri/Sat/Sun daily charts.
 * `fridayIso` is the Friday date (YYYY-MM-DD).
 */
export async function weekendActuals(fridayIso: string): Promise<WeekendActuals> {
  const days = [0, 1, 2].map((n) => addDays(fridayIso, n));
  const charts = await Promise.all(days.map((d) => fetchDailyChart(d)));

  const threeDayTotalByTitle: Record<string, number> = {};
  const fridayTheatersByTitle: Record<string, number> = {};

  charts.forEach((rows, i) => {
    for (const r of rows) {
      threeDayTotalByTitle[r.title] =
        (threeDayTotalByTitle[r.title] ?? 0) + r.gross;
      if (i === 0) fridayTheatersByTitle[r.title] = r.theaters;
    }
  });

  return { threeDayTotalByTitle, fridayTheatersByTitle };
}

/**
 * Top holdovers from the most recent completed weekend's Friday chart.
 * Walks back up to `maxBack` Fridays if a chart isn't published yet (404),
 * so a not-yet-posted recent date doesn't yield an empty list.
 */
export async function recentHoldovers(
  fridayIso: string,
  limit = 8,
  maxBack = 3,
): Promise<{ title: string; gross: number; theaters: number }[]> {
  let day = fridayIso;
  for (let i = 0; i <= maxBack; i++) {
    try {
      const rows = await fetchDailyChart(day);
      if (rows.length > 0) {
        return rows
          .filter((r: DailyChartRow) => r.daysInRelease > 3)
          .slice(0, limit)
          .map((r) => ({ title: r.title, gross: r.gross, theaters: r.theaters }));
      }
    } catch {
      /* chart not published — step back a week */
    }
    day = addDays(day, -7);
  }
  return [];
}

/** The Friday on or before a given date. */
export function priorFriday(fromIso: string): string {
  const d = new Date(`${fromIso}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const back = (dow - 5 + 7) % 7; // days since Friday
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}
