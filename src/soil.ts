import { dayOfYear, mean, round } from "./dates.js";
import type { DailySeries, SoilModel, SoilSeries } from "./types.js";

export function fillMissing(values: (number | null)[]): number[] {
  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (valid.length === 0) return values.map(() => 0);

  const fallback = valid.reduce((sum, value) => sum + value, 0) / valid.length;
  const forward: number[] = [];
  let last = fallback;
  for (const value of values) {
    if (value !== null && Number.isFinite(value)) last = value;
    forward.push(last);
  }

  const backward = [...forward];
  let next = forward[forward.length - 1] ?? fallback;
  for (let index = forward.length - 1; index >= 0; index -= 1) {
    if (values[index] === null || !Number.isFinite(values[index] as number)) {
      backward[index] = next;
    } else {
      next = forward[index];
    }
  }

  return backward;
}

/**
 * First-order thermal lag. Soil at 6 cm follows daily mean air temperature.
 */
export function estimateSoilSeries(
  tmean: (number | null)[],
  alpha = 0.18,
): number[] {
  const filled = fillMissing(tmean);
  if (filled.length === 0) return [];

  const startWindow = filled.slice(0, Math.min(14, filled.length));
  let soil = mean(startWindow) ?? 10;

  return filled.map((air) => {
    soil += alpha * (air - soil);
    return soil;
  });
}

export function dailySoilFromHourly(
  times: string[],
  values: (number | null)[],
): SoilSeries {
  const groups = new Map<string, number[]>();

  times.forEach((time, index) => {
    const value = values[index];
    if (value === null || !Number.isFinite(value)) return;
    const date = time.slice(0, 10);
    const list = groups.get(date) ?? [];
    list.push(value);
    groups.set(date, list);
  });

  const dates = [...groups.keys()].sort();
  const daily = dates.map((date) => {
    const list = groups.get(date) ?? [];
    return list.length > 0 ? mean(list) : null;
  });

  return { dates, values: daily };
}

export function buildSoilModel(
  daily: DailySeries,
  observed: SoilSeries,
  alpha = 0.18,
): SoilModel {
  const estimated = estimateSoilSeries(daily.tmean, alpha);
  const estimatedByDate = new Map<string, number>();
  daily.dates.forEach((date, index) => {
    estimatedByDate.set(date, estimated[index]);
  });

  const observedByDate = new Map<string, number>();
  observed.dates.forEach((date, index) => {
    const value = observed.values[index];
    if (value !== null && Number.isFinite(value)) observedByDate.set(date, value);
  });

  const overlap: number[] = [];
  for (const [date, value] of observedByDate) {
    const estimate = estimatedByDate.get(date);
    if (estimate !== undefined) overlap.push(value - estimate);
  }

  const rawBias = overlap.length > 0 ? mean(overlap) ?? 0 : 0;
  const biasC = round(Math.max(-4, Math.min(4, rawBias)), 1);

  const byDate: Record<string, number> = {};
  for (const [date, value] of estimatedByDate) {
    byDate[date] = round(value + biasC, 1);
  }

  const recent = observed.dates
    .map((date, index) => ({ date, value: observed.values[index] }))
    .filter((row): row is { date: string; value: number } => row.value !== null)
    .slice(-21)
    .map((row) => ({ date: row.date, value: round(row.value, 1) }));

  const latest = recent.length > 0 ? recent[recent.length - 1] : null;

  const climatologyByDoy = buildSoilClimatology(daily, biasC, alpha);

  return {
    biasC,
    latestC: latest ? latest.value : null,
    latestDate: latest ? latest.date : null,
    recent,
    byDate,
    climatologyByDoy,
  };
}

function buildSoilClimatology(
  daily: DailySeries,
  biasC: number,
  alpha: number,
): (number | null)[] {
  const sums = new Array<number>(366).fill(0);
  const counts = new Array<number>(366).fill(0);

  daily.dates.forEach((date, index) => {
    const value = daily.tmean[index];
    if (value === null || !Number.isFinite(value)) return;
    const doy = dayOfYear(date);
    sums[doy - 1] += value;
    counts[doy - 1] += 1;
  });

  const base: (number | null)[] = sums.map((sum, index) =>
    counts[index] > 0 ? sum / counts[index] : null,
  );

  const withValues = base.filter((value): value is number => value !== null);
  if (withValues.length === 0) return new Array<number | null>(366).fill(null);
  const fallback = mean(withValues) ?? 10;
  const filled = base.map((value) => value ?? fallback);

  // Two passes settle the lag model at the start of the year.
  const duplicated = [...filled, ...filled];
  const estimated = estimateSoilSeries(duplicated, alpha);
  const secondYear = estimated.slice(366);

  return secondYear.map((value) => round(value + biasC, 1));
}

export function soilTempAt(model: SoilModel, iso: string): number | null {
  const direct = model.byDate[iso];
  if (direct !== undefined) return direct;
  const doy = dayOfYear(iso);
  const value = model.climatologyByDoy[doy - 1];
  return value ?? null;
}