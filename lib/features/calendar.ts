import calendarData from "./data/us-calendar.json";

export type SchoolStatus =
  | "in-session"
  | "summer"
  | "winter-break"
  | "spring-break";

export interface CalendarFeature {
  isHolidayWeekend: boolean;
  holidayName: string | null;
  /** Whether the bracketing holiday makes this a 4-day weekend. */
  fourDayWeekend: boolean;
  schoolStatus: SchoolStatus;
}

const holidays = calendarData.holidays;
const schoolBreaks = calendarData.schoolBreaks;

/** Resolve calendar context for an opening weekend, given any date within it. */
export function calendarFor(weekendDateIso: string): CalendarFeature {
  const target = Date.parse(weekendDateIso);

  // Holiday within 3 days on either side counts as a holiday weekend.
  let holidayName: string | null = null;
  let fourDayWeekend = false;
  for (const h of holidays) {
    const diff = Math.abs(Date.parse(h.date) - target) / (1000 * 60 * 60 * 24);
    if (diff <= 3) {
      holidayName = h.name;
      fourDayWeekend = h.fourDayWeekend;
      break;
    }
  }

  let schoolStatus: SchoolStatus = "in-session";
  for (const b of schoolBreaks) {
    if (target >= Date.parse(b.start) && target <= Date.parse(b.end)) {
      schoolStatus = b.status as SchoolStatus;
      break;
    }
  }

  return {
    isHolidayWeekend: holidayName !== null,
    holidayName,
    fourDayWeekend,
    schoolStatus,
  };
}
