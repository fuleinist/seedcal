import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { addDays, todayISO } from "./dates.js";
import { dailySoilFromHourly } from "./soil.js";
import type {
  ClimateCacheFile,
  ClimateData,
  DailySeries,
  Site,
  SoilSeries,
} from "./types.js";

const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";

interface ArchiveResponse {
  latitude?: number;
  longitude?: number;
  elevation?: number;
  timezone?: string;
  daily?: {
    time?: string[];
    temperature_2m_min?: (number | null)[];
    temperature_2m_mean?: (number | null)[];
  };
  error?: boolean;
  reason?: string;
}

interface ForecastResponse {
  hourly?: {
    time?: string[];
    soil_temperature_6cm?: (number | null)[];
  };
  error?: boolean;
  reason?: string;
}

interface GeocodeResponse {
  results?: {
    name: string;
    latitude: number;
    longitude: number;
    elevation?: number;
    timezone?: string;
    country?: string;
    country_code?: string;
    admin1?: string;
    feature_code?: string;
  }[];
}

export interface FetchOptions {
  startDate?: string;
  endDate?: string;
  timeoutMs?: number;
  retries?: number;
}

export interface FetchedClimate {
  data: ClimateData;
  cache: ClimateCacheFile;
}

async function fetchJson<T>(
  url: string,
  options: { timeoutMs?: number; retries?: number } = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const retries = options.retries ?? 2;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "user-agent": "seedcal/0.1 (+https://github.com/fuleinist/seedcal)",
          accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${new URL(url).host}`);
      }

      const data = (await response.json()) as T & { error?: boolean; reason?: string };
      if (data && typeof data === "object" && data.error) {
        throw new Error(`Open-Meteo error: ${data.reason ?? "unknown"}`);
      }
      return data;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function searchSites(query: string, count = 6): Promise<Site[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const params = new URLSearchParams({
    name: trimmed,
    count: String(count),
    language: "en",
    format: "json",
  });
  const data = await fetchJson<GeocodeResponse>(`${GEOCODING_URL}?${params}`);

  return (data.results ?? []).map((result) => ({
    name: result.name,
    latitude: result.latitude,
    longitude: result.longitude,
    timezone: result.timezone,
    elevation: result.elevation,
    country: result.country,
    countryCode: result.country_code,
    region: result.admin1,
  }));
}

export async function fetchClimate(
  site: Site,
  options: FetchOptions = {},
): Promise<FetchedClimate> {
  const endDate = options.endDate ?? addDays(todayISO(), -1);
  const startYear = Number(endDate.slice(0, 4)) - 10;
  const startDate = options.startDate ?? `${startYear}-01-01`;

  const archiveParams = new URLSearchParams({
    latitude: String(site.latitude),
    longitude: String(site.longitude),
    start_date: startDate,
    end_date: endDate,
    daily: "temperature_2m_min,temperature_2m_mean",
    timezone: "auto",
  });

  const archive = await fetchJson<ArchiveResponse>(`${ARCHIVE_URL}?${archiveParams}`, options);
  const times = archive.daily?.time ?? [];
  const tmin = archive.daily?.temperature_2m_min ?? [];
  const tmean = archive.daily?.temperature_2m_mean ?? [];

  if (times.length === 0 || tmin.length !== times.length || tmean.length !== times.length) {
    throw new Error("The archive response has no complete daily temperature series.");
  }

  const soilParams = new URLSearchParams({
    latitude: String(site.latitude),
    longitude: String(site.longitude),
    hourly: "soil_temperature_6cm",
    past_days: "21",
    forecast_days: "7",
    timezone: "auto",
  });

  const forecast = await fetchJson<ForecastResponse>(`${FORECAST_URL}?${soilParams}`, options);
  const soilTimes = forecast.hourly?.time ?? [];
  const soilValues = forecast.hourly?.soil_temperature_6cm ?? [];

  if (soilTimes.length === 0 || soilValues.length !== soilTimes.length) {
    throw new Error("The forecast response has no complete soil temperature series.");
  }

  const resolvedSite: Site = {
    ...site,
    latitude: archive.latitude ?? site.latitude,
    longitude: archive.longitude ?? site.longitude,
    elevation: archive.elevation ?? site.elevation,
    timezone: archive.timezone ?? site.timezone ?? "auto",
  };

  const daily: DailySeries = { dates: times, tmin, tmean };
  const soilDaily = dailySoilFromHourly(soilTimes, soilValues);
  const fetchedAt = new Date().toISOString();

  const cache: ClimateCacheFile = {
    version: 1,
    site: resolvedSite,
    fetchedAt,
    archive: { start: startDate, end: endDate, daily },
    soil: { times: soilTimes, values: soilValues },
  };

  return {
    data: {
      site: resolvedSite,
      fetchedAt,
      archiveStart: startDate,
      archiveEnd: endDate,
      daily,
      soilDaily,
    },
    cache,
  };
}

export function climateFromCache(cache: ClimateCacheFile): ClimateData {
  if (cache.version !== 1) {
    throw new Error(`Unsupported cache version: ${cache.version}`);
  }
  const soil: SoilSeries = dailySoilFromHourly(cache.soil.times, cache.soil.values);

  return {
    site: cache.site,
    fetchedAt: cache.fetchedAt,
    archiveStart: cache.archive.start,
    archiveEnd: cache.archive.end,
    daily: cache.archive.daily,
    soilDaily: soil,
  };
}

export async function readClimateCache(path: string): Promise<ClimateData> {
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as ClimateCacheFile;
  return climateFromCache(parsed);
}

export async function writeClimateCache(
  path: string,
  cache: ClimateCacheFile,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

export function describeSite(site: Site): string {
  return [site.name, site.region, site.country].filter(Boolean).join(", ");
}