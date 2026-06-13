export interface DailyChartRow {
  rank: number;
  title: string;
  /** Single-day gross in dollars. */
  gross: number;
  theaters: number;
  /** Cumulative gross to date in dollars. */
  totalGross: number;
  daysInRelease: number;
}

export interface ScheduleEntry {
  /** ISO date (YYYY-MM-DD) of the wide release. */
  releaseDate: string;
  title: string;
  /** Planned theater count if listed, else null. */
  plannedTheaters: number | null;
  distributor: string | null;
}
