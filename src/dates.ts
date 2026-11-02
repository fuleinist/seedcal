export const DAY_MS = 86_400_000;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function todayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function parseISO(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const date = parseISO(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toISO(date);
}

export function addWeeks(iso: string, weeks: number): string {
  return addDays(iso, Math.round(weeks * 7));
}

export function diffDays(from: string, to: string): number {
  return Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / DAY_MS);
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

export function dayOfYear(iso: string): number {
  const date = parseISO(iso);
  return diffDays(`${date.getUTCFullYear()}-01-01`, iso) + 1;
}

export function isoFromDoy(year: number, doy: number): string {
  const date = new Date(Date.UTC(year, 0, doy));
  return toISO(date);
}

export function monthDayFromDoy(doy: number): { month: number; day: number } {
  const date = new Date(Date.UTC(2025, 0, doy));
  return { month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

export function dateInYear(year: number, month: number, day: number): string {
  return toISO(new Date(Date.UTC(year, month - 1, day)));
}

export function formatDay(iso: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(parseISO(iso));
}

export function formatFull(iso: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(parseISO(iso));
}

export function formatMonth(iso: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(parseISO(iso));
}

export function formatWeekday(iso: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    timeZone: "UTC",
  }).format(parseISO(iso));
}

export function isBetween(iso: string, start: string, end: string): boolean {
  return iso >= start && iso <= end;
}

export function median(values: number[]): number | null {
  return quantile(values, 0.5);
}

export function quantile(values: number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}