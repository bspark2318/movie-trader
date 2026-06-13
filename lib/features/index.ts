import type { BoxOfficeEvent } from "@/lib/polymarket/types";
import { calendarFor, type CalendarFeature } from "./calendar";
import { weatherFor, type WeatherFeature } from "./weather";
import { recentHoldovers, priorFriday } from "@/lib/thenumbers/comps";
import { fetchSchedule } from "@/lib/thenumbers/client";

export interface ReleaseFeature {
  /** ISO release date if we could match the movie in the schedule. */
  releaseDate: string | null;
  daysUntilRelease: number | null;
  plannedTheaters: number | null;
  /** Other wide releases the same weekend. */
  sameWeekendReleases: string[];
}

export interface CompetitionFeature {
  topHoldovers: { title: string; lastWeekendGrossM: number }[];
}

export interface FeaturesJson {
  movieTitle: string;
  weekendType: string;
  weekendDates: { start: string; end: string } | null;
  calendar: CalendarFeature;
  weather: WeatherFeature;
  release: ReleaseFeature;
  competition: CompetitionFeature;
  market: {
    snapshotAt: string;
    brackets: {
      label: string;
      mid: number;
      bestAsk: number;
      spread: number;
    }[];
  };
}

/** Resolve the opening-weekend anchor date (the market end date, ~ the Sunday). */
function weekendAnchor(ev: BoxOfficeEvent): string {
  return ev.endDate ? ev.endDate.slice(0, 10) : new Date().toISOString().slice(0, 10);
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function buildFeatures(ev: BoxOfficeEvent): Promise<FeaturesJson> {
  const anchor = weekendAnchor(ev);
  const friday = priorFriday(anchor);

  const calendar = calendarFor(anchor);
  const weather = await weatherFor(anchor);

  // Holdovers: top titles from the PREVIOUS completed weekend's Friday chart.
  let topHoldovers: CompetitionFeature["topHoldovers"] = [];
  try {
    const prevFriday = priorFriday(
      new Date(Date.parse(friday) - 7 * 86400000).toISOString().slice(0, 10),
    );
    const holds = await recentHoldovers(prevFriday);
    topHoldovers = holds.map((h) => ({
      title: h.title,
      lastWeekendGrossM: Math.round((h.gross / 1e6) * 10) / 10,
    }));
  } catch {
    /* scraper best-effort */
  }

  // Release schedule: find this movie + same-weekend wide releases.
  const release: ReleaseFeature = {
    releaseDate: null,
    daysUntilRelease: null,
    plannedTheaters: null,
    sameWeekendReleases: [],
  };
  try {
    const year = Number(anchor.slice(0, 4));
    const sched = await fetchSchedule(year);
    const movieKey = norm(ev.movieTitle);
    const self = sched.find((s) => norm(s.title) === movieKey);
    if (self) {
      const days =
        (Date.parse(self.releaseDate) - Date.now()) / (1000 * 86400);
      release.releaseDate = self.releaseDate;
      release.daysUntilRelease = Math.round(days);
      release.plannedTheaters = self.plannedTheaters;
      release.sameWeekendReleases = sched
        .filter(
          (s) =>
            s.releaseDate === self.releaseDate && norm(s.title) !== movieKey,
        )
        .map((s) => s.title);
    }
  } catch {
    /* scraper best-effort */
  }

  return {
    movieTitle: ev.movieTitle,
    weekendType: ev.weekendType,
    weekendDates: ev.weekendDates,
    calendar,
    weather,
    release,
    competition: { topHoldovers },
    market: {
      snapshotAt: new Date().toISOString(),
      brackets: ev.brackets.map((b) => ({
        label: b.label,
        mid: b.mid,
        bestAsk: b.bestAsk,
        spread: b.spread,
      })),
    },
  };
}
