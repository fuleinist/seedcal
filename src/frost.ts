import {
  dateInYear,
  dayOfYear,
  diffDays,
  formatDay,
  isLeapYear,
  monthDayFromDoy,
  quantile,
} from "./dates.js";
import type { DailySeries, FrostEvent, FrostStats } from "./types.js";

export interface SeasonAnchors {
  year: number;
  lastFrost: string;
  firstFrost: string;
}

interface Run {
  start: number;
  end: number;
}

/**
 * Frost dates come from growing-season runs in the full daily series.
 * A run is a spell of days with minimum temperature above the threshold.
 * The day before a run is the last spring frost. The day after is the first autumn frost.
 * A run must last at least 90 days. This filters short warm spells in winter.
 */
export function computeFrostStats(daily: DailySeries, thresholdC = 0): FrostStats {
  const dates = daily.dates;
  const total = dates.length;
  const runs: Run[] = [];
  let runStart = -1;

  for (let index = 0; index < total; index += 1) {
    const value = daily.tmin[index];
    const above = value !== null && value > thresholdC;
    if (above) {
      if (runStart < 0) runStart = index;
    } else if (runStart >= 0) {
      runs.push({ start: runStart, end: index - 1 });
      runStart = -1;
    }
  }
  if (runStart >= 0) runs.push({ start: runStart, end: total - 1 });

  const minimumRunDays = 90;
  const complete = runs.filter(
    (run) =>
      run.start > 0 &&
      run.end < total - 1 &&
      run.end - run.start + 1 >= minimumRunDays,
  );

  // Keep the longest run for each start year.
  const byYear = new Map<number, Run>();
  for (const run of complete) {
    const year = Number(dates[run.start].slice(0, 4));
    const previous = byYear.get(year);
    if (!previous || run.end - run.start > previous.end - previous.start) {
      byYear.set(year, run);
    }
  }

  const events: FrostStats["events"] = [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, run]) => {
      const lastDate = dates[run.start - 1];
      const firstDate = dates[run.end + 1];
      return {
        year,
        last: {
          year,
          doy: normalizedDoy(lastDate),
          date: lastDate,
        } satisfies FrostEvent,
        first: {
          year: Number(firstDate.slice(0, 4)),
          doy: normalizedDoy(firstDate),
          date: firstDate,
        } satisfies FrostEvent,
      };
    });

  const frostDays = daily.tmin.filter(
    (value) => value !== null && value <= thresholdC,
  ).length;
  const yearsWithFrost = events.length;

  const lastDoys = events
    .map((event) => event.last.doy)
    .filter((doy): doy is number => doy !== null);
  const firstDoys = events
    .map((event) => event.first.doy)
    .filter((doy): doy is number => doy !== null);

  const medianLast = quantile(lastDoys, 0.5);
  const p10Last = quantile(lastDoys, 0.1);
  const p90Last = quantile(lastDoys, 0.9);
  const medianFirst = quantile(firstDoys, 0.5);
  const p10First = quantile(firstDoys, 0.1);
  const p90First = quantile(firstDoys, 0.9);

  const frostFreeDays: number[] = [];
  for (const event of events) {
    if (event.last.date !== null && event.first.date !== null) {
      frostFreeDays.push(diffDays(event.last.date, event.first.date));
    }
  }

  return {
    thresholdC,
    years: events.length,
    yearsWithFrost: frostDays > 0 ? yearsWithFrost : 0,
    lastFrost: {
      medianDoy: medianLast,
      p10Doy: p10Last,
      p90Doy: p90Last,
      medianLabel: labelFromDoy(medianLast),
      safeLabel: labelFromDoy(p90Last),
    },
    firstFrost: {
      medianDoy: medianFirst,
      p10Doy: p10First,
      p90Doy: p90First,
      medianLabel: labelFromDoy(medianFirst),
      safeLabel: labelFromDoy(p10First),
    },
    frostFreeDaysMedian:
      frostFreeDays.length > 0 ? Math.round(quantile(frostFreeDays, 0.5) ?? 0) : null,
    events,
  };
}

function labelFromDoy(doy: number | null): string | null {
  if (doy === null) return null;
  const { month, day } = monthDayFromDoy(doy);
  return formatDay(dateInYear(2025, month, day));
}

/** Map a date to a non-leap day number, so percentiles keep their month and day. */
function normalizedDoy(date: string): number {
  const year = Number(date.slice(0, 4));
  const doy = dayOfYear(date);
  return isLeapYear(year) && doy > 60 ? doy - 1 : doy;
}

export function isSouthernHemisphere(frost: FrostStats, latitude: number): boolean {
  const last = frost.lastFrost.medianDoy;
  const first = frost.firstFrost.medianDoy;
  if (last !== null && first !== null) return last > first;
  return latitude < 0;
}

/**
 * Build frost anchors for one growing season.
 * A season starts at the last spring frost and ends at the next first autumn frost.
 */
export function seasonAnchors(
  frost: FrostStats,
  year: number,
  southern: boolean,
): SeasonAnchors {
  const lastMonthDay =
    frost.lastFrost.medianDoy !== null
      ? monthDayFromDoy(frost.lastFrost.medianDoy)
      : southern
        ? { month: 9, day: 1 }
        : { month: 4, day: 15 };

  const firstMonthDay =
    frost.firstFrost.medianDoy !== null
      ? monthDayFromDoy(frost.firstFrost.medianDoy)
      : southern
        ? { month: 5, day: 1 }
        : { month: 10, day: 15 };

  const lastFrost = dateInYear(year, lastMonthDay.month, lastMonthDay.day);
  const firstFrost = dateInYear(
    southern ? year + 1 : year,
    firstMonthDay.month,
    firstMonthDay.day,
  );

  return { year, lastFrost, firstFrost };
}

export function frostFreeStatus(frost: FrostStats): boolean {
  return frost.yearsWithFrost === 0;
}