import * as cheerio from "cheerio";
import type { DailyChartRow, ScheduleEntry } from "./types";

function money(text: string): number {
  const n = Number(text.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function int(text: string): number {
  const n = Number(text.replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Parse a The Numbers daily box-office chart page.
 * Desktop table columns: Rank | Prev | Title | Gross | Daily% | Weekly% |
 * Theaters | Theater Avg | Total Gross | Days in Release.
 * Defensive: skips rows that don't have the expected cell count.
 */
export function parseDailyChart(html: string): DailyChartRow[] {
  const $ = cheerio.load(html);
  const rows: DailyChartRow[] = [];

  $("table.chart-desktop tr").each((_, tr) => {
    const cells = $(tr)
      .find("td")
      .map((__, td) => $(td).text().trim())
      .get();
    if (cells.length < 10) return; // header / spacer rows

    const rank = int(cells[0]);
    if (!rank) return;

    rows.push({
      rank,
      title: cells[2],
      gross: money(cells[3]),
      theaters: int(cells[6]),
      totalGross: money(cells[8]),
      daysInRelease: int(cells[9]),
    });
  });

  return rows;
}

/**
 * Parse a The Numbers "movies-in-theaters" / release-schedule page.
 * Schedule tables vary; we look for rows that contain a date and a title link.
 */
export function parseSchedule(html: string, year: number): ScheduleEntry[] {
  const $ = cheerio.load(html);
  const out: ScheduleEntry[] = [];
  let currentDate: string | null = null;

  $("table tr").each((_, tr) => {
    const $tr = $(tr);
    const cells = $tr
      .find("td")
      .map((__, td) => $(td).text().trim())
      .get();
    if (cells.length === 0) return;

    // A date header row like "June 19, 2026" or "June 19th, 2026".
    const dateCell = cells.find((c) => /\b[A-Z][a-z]+ \d{1,2}/.test(c));
    const parsed = dateCell ? parseDate(dateCell, year) : null;
    if (parsed) currentDate = parsed;

    const titleLink = $tr.find("a[href*='/movie/']").first().text().trim();
    if (titleLink && currentDate) {
      const theaters = cells
        .map((c) => c.match(/^([\d,]+)$/))
        .find((m) => m && int(m[1]) > 50);
      out.push({
        releaseDate: currentDate,
        title: titleLink,
        plannedTheaters: theaters ? int(theaters[1]) : null,
        distributor: null,
      });
    }
  });

  return out;
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

function parseDate(text: string, fallbackYear: number): string | null {
  const m = text.match(/([A-Z][a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?/);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  if (!month) return null;
  const day = Number(m[2]);
  const year = m[3] ? Number(m[3]) : fallbackYear;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
