import { addDays, dayOfYear, round } from "../src/dates.js";
import type { ClimateData, DailySeries } from "../src/types.js";

export function series(
  start: string,
  days: number,
  fn: (date: string, doy: number) => number,
): DailySeries {
  const dates: string[] = [];
  const tmin: number[] = [];

  for (let index = 0; index < days; index += 1) {
    const date = addDays(start, index);
    dates.push(date);
    tmin.push(fn(date, dayOfYear(date)));
  }

  return { dates, tmin, tmean: tmin.map((value) => round(value + 2, 1)) };
}

export function makeClimate(start = "2019-01-01", days = 1096): ClimateData {
  const dates: string[] = [];
  const tmin: number[] = [];
  const tmean: number[] = [];

  for (let index = 0; index < days; index += 1) {
    const date = addDays(start, index);
    const doy = dayOfYear(date);
    const seasonal = 14 + 8 * Math.cos((2 * Math.PI * (doy - 10)) / 365);
    dates.push(date);
    tmean.push(round(seasonal, 1));
    tmin.push(round(seasonal - 8, 1));
  }

  const soilDates = dates.slice(-21);

  return {
    site: {
      name: "Test garden",
      latitude: -35,
      longitude: 149,
      timezone: "Australia/Sydney",
    },
    fetchedAt: "2021-12-31T00:00:00.000Z",
    archiveStart: dates[0],
    archiveEnd: dates[dates.length - 1],
    daily: { dates, tmin, tmean },
    soilDaily: {
      dates: soilDates,
      values: soilDates.map(() => 18),
    },
  };
}

export function frostFreeClimate(): ClimateData {
  const dates: string[] = [];
  for (let index = 0; index < 730; index += 1) {
    dates.push(addDays("2020-01-01", index));
  }

  return {
    site: { name: "Warm garden", latitude: -20, longitude: 149, timezone: "UTC" },
    fetchedAt: "2021-12-31T00:00:00.000Z",
    archiveStart: dates[0],
    archiveEnd: dates[dates.length - 1],
    daily: {
      dates,
      tmin: dates.map(() => 16),
      tmean: dates.map(() => 22),
    },
    soilDaily: {
      dates: dates.slice(-21),
      values: dates.slice(-21).map(() => 20),
    },
  };
}