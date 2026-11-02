#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { CROPS, DEFAULT_CROP_IDS, getCrop } from "./crops.js";
import {
  describeSite,
  fetchClimate,
  readClimateCache,
  searchSites,
  writeClimateCache,
} from "./climate.js";
import { addDays, formatDay, formatFull, todayISO } from "./dates.js";
import { planToCsv, planToCsvFile } from "./export.js";
import { buildPlan } from "./plan.js";
import type { ClimateData, PlanFile } from "./types.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DEFAULT_CACHE = join(ROOT, "data", "climate-canberra.json");
const DEFAULT_PLAN = join(ROOT, "web", "data", "plan.json");

const HELP = `seedcal - sowing calendar for community gardens

Usage
  seedcal search "<place>"                  Find a site by name.
  seedcal fetch --lat <n> --lon <n> --out <file> [--name <name>]
                                            Cache ten years of climate data.
  seedcal plan --lat <n> --lon <n> [options] Create a plan from live data.
  seedcal plan --cache <file> [options]      Create a plan from a cache.
  seedcal demo [options]                     Rebuild the Canberra demo plan.
  seedcal export [--plan <file>] [--out <file>]
                                            Write the plan as CSV.
  seedcal crops                              List the crop catalog.

Options
  --start <YYYY-MM-DD>   First day of the plan. Default: today.
  --weeks <n>            Plan length in weeks. Default: 52.
  --beds <n>             Number of beds. Default: 4.
  --crops <a,b,c>        Comma-separated crop ids. Default: a starter set.
  --out <file>           Output file.
  --cache <file>         Climate cache file.
  --offline              Read the cache only. Do not call the network.
  --end <YYYY-MM-DD>     Last archive day. Default: yesterday.
  -h, --help             Show this help.
`;

async function main(): Promise<void> {
  const parsed = parseArgs({
    args: normalizeNegativeValues(process.argv.slice(2)),
    allowPositionals: true,
    options: {
      lat: { type: "string" },
      lon: { type: "string" },
      name: { type: "string" },
      out: { type: "string" },
      cache: { type: "string" },
      start: { type: "string" },
      end: { type: "string" },
      weeks: { type: "string" },
      beds: { type: "string" },
      crops: { type: "string" },
      plan: { type: "string" },
      format: { type: "string" },
      offline: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });

  const [command, ...rest] = parsed.positionals;

  if (parsed.values.help || !command) {
    process.stdout.write(HELP);
    return;
  }

  switch (command) {
    case "search":
      await handleSearch(rest.join(" "));
      break;
    case "fetch":
      await handleFetch(parsed.values);
      break;
    case "plan":
      await handlePlan(parsed.values);
      break;
    case "demo":
      await handleDemo(parsed.values);
      break;
    case "export":
      await handleExport(parsed.values);
      break;
    case "crops":
      handleCrops();
      break;
    default:
      throw new Error(`Unknown command: ${command}. Run seedcal --help.`);
  }
}

type Values = Record<string, string | boolean | undefined>;

function normalizeNegativeValues(argv: string[]): string[] {
  const out: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg.startsWith("--") && !arg.includes("=") && next !== undefined && /^-\d/.test(next)) {
      out.push(`${arg}=${next}`);
      index += 1;
    } else {
      out.push(arg);
    }
  }
  return out;
}

async function handleSearch(query: string): Promise<void> {
  if (!query.trim()) throw new Error("Give a place name. Example: seedcal search Canberra.");
  const sites = await searchSites(query);
  if (sites.length === 0) {
    console.log("No site found. Try a nearby town or use --lat and --lon.");
    return;
  }
  sites.forEach((site, index) => {
    console.log(
      `${index + 1}. ${describeSite(site)}  ${site.latitude}, ${site.longitude}  ${site.timezone ?? ""}`,
    );
  });
}

async function handleFetch(values: Values): Promise<void> {
  const latitude = requireNumber(values.lat, "lat", -90, 90);
  const longitude = requireNumber(values.lon, "lon", -180, 180);
  const out = resolvePath(stringValue(values.out) ?? DEFAULT_CACHE);
  const name = stringValue(values.name) ?? "Selected site";

  const { data, cache } = await fetchClimate(
    { name, latitude, longitude },
    { startDate: stringValue(values.start), endDate: stringValue(values.end) },
  );
  await writeClimateCache(out, cache);

  console.log(`Site: ${describeSite(data.site)}`);
  console.log(`Archive: ${data.archiveStart} to ${data.archiveEnd} (${data.daily.dates.length} days)`);
  console.log(`Soil: ${data.soilDaily.dates.length} daily values`);
  console.log(`Wrote ${out}`);
}

async function handlePlan(values: Values): Promise<void> {
  const data = await resolveClimate(values);
  const plan = buildPlanFor(data, values);
  const out = resolvePath(stringValue(values.out) ?? DEFAULT_PLAN);
  await writePlan(out, plan);
  printSummary(plan, out);
}

/** Fixed season start. A stable demo is easier to review and screenshot. */
const DEMO_START = "2026-08-15";

async function handleDemo(values: Values): Promise<void> {
  const cachePath = resolvePath(stringValue(values.cache) ?? DEFAULT_CACHE);
  const data = await readClimateCache(cachePath);
  const plan = buildPlanFor(data, { ...values, start: values.start ?? DEMO_START });
  const out = resolvePath(stringValue(values.out) ?? DEFAULT_PLAN);
  await writePlan(out, plan);
  printSummary(plan, out);
}

async function handleExport(values: Values): Promise<void> {
  const format = stringValue(values.format) ?? "csv";
  if (format !== "csv") throw new Error("Only the csv format is supported.");

  const planPath = resolvePath(stringValue(values.plan) ?? DEFAULT_PLAN);
  const raw = await readFile(planPath, "utf8");
  const plan = JSON.parse(raw) as PlanFile;

  const out = stringValue(values.out);
  if (out) {
    const path = resolvePath(out);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, planToCsvFile(plan), "utf8");
    console.log(`Wrote ${path}`);
  } else {
    process.stdout.write(planToCsv(plan));
  }
}

function handleCrops(): void {
  console.log("id              name                method      soil  days");
  for (const crop of CROPS) {
    console.log(
      `${crop.id.padEnd(15)} ${crop.name.padEnd(19)} ${crop.method.padEnd(11)} ${String(crop.minSoilC).padStart(3)}  ${crop.daysToHarvest[0]}-${crop.daysToHarvest[1]}`,
    );
  }
}

async function resolveClimate(values: Values): Promise<ClimateData> {
  const cacheValue = stringValue(values.cache);
  const cachePath = cacheValue ? resolvePath(cacheValue) : null;
  const offline = values.offline === true;

  if (offline) {
    if (!cachePath) throw new Error("--offline needs --cache <file>.");
    return readClimateCache(cachePath);
  }

  if (values.lat !== undefined && values.lon !== undefined) {
    const latitude = requireNumber(values.lat, "lat", -90, 90);
    const longitude = requireNumber(values.lon, "lon", -180, 180);
    const name = stringValue(values.name) ?? "Selected site";
    const { data, cache } = await fetchClimate(
      { name, latitude, longitude },
      { startDate: stringValue(values.start), endDate: stringValue(values.end) },
    );
    if (cachePath) await writeClimateCache(cachePath, cache);
    return data;
  }

  if (cachePath) return readClimateCache(cachePath);

  throw new Error("Give --lat and --lon, or --cache <file>.");
}

function buildPlanFor(data: ClimateData, values: Values): PlanFile {
  const weeks = optionalNumber(values.weeks, "weeks", 4, 104);
  const beds = optionalNumber(values.beds, "beds", 1, 24);
  const cropIds = parseCropIds(stringValue(values.crops));

  return buildPlan(data, {
    startDate: stringValue(values.start) ?? todayISO(),
    weeks: weeks ?? 52,
    beds: beds ?? 4,
    selectedCropIds: cropIds,
    frostThresholdC: 0,
  });
}

function parseCropIds(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const ids = raw
    .split(",")
    .map((id) => id.trim().toLowerCase())
    .filter(Boolean);

  const invalid = ids.filter((id) => !getCrop(id));
  if (invalid.length > 0) {
    throw new Error(`Unknown crop ids: ${invalid.join(", ")}. Run seedcal crops.`);
  }
  return ids.length > 0 ? ids : DEFAULT_CROP_IDS;
}

function printSummary(plan: PlanFile, out: string): void {
  const frost = plan.climate.frost;
  const selected = plan.settings.selectedCropIds.length;
  const gaps = plan.gaps.length;
  const planEnd = addDays(plan.settings.startDate, plan.settings.weeks * 7 - 1);

  console.log(`seedcal plan for ${describeSite(plan.site)}`);
  console.log(
    `Plan: ${formatFull(plan.settings.startDate)} to ${formatFull(planEnd)} (${plan.settings.weeks} weeks, ${plan.settings.beds} beds, ${selected} crops)`,
  );
  console.log(
    `Frost: last ${frost.lastFrost.medianLabel ?? "none"} (safe ${frost.lastFrost.safeLabel ?? "none"}); first ${frost.firstFrost.medianLabel ?? "none"} (early ${frost.firstFrost.safeLabel ?? "none"})`,
  );
  console.log(
    `Soil: ${plan.climate.soil.latestC ?? "unknown"} °C on ${plan.climate.soil.latestDate ?? "unknown"} (model bias ${plan.climate.soil.biasC} °C)`,
  );
  console.log(
    `Plantings: ${plan.plantings.filter((planting) => plan.settings.selectedCropIds.includes(planting.cropId)).length}. Skipped: ${plan.skipped.length} cold-soil sowings.`,
  );
  console.log(`Harvest gaps: ${gaps}${gaps > 0 ? ` (first: ${plan.gaps[0].message})` : ""}`);
  for (const warning of plan.warnings) console.log(`Warning: ${warning.message}`);
  console.log(`Wrote ${out}`);
}

async function writePlan(path: string, plan: PlanFile): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
}

function resolvePath(value: string): string {
  return resolve(process.cwd(), value);
}

function stringValue(value: string | boolean | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function requireNumber(
  value: string | boolean | undefined,
  name: string,
  min: number,
  max: number,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`--${name} must be a number.`);
  if (parsed < min || parsed > max) throw new Error(`--${name} must be between ${min} and ${max}.`);
  return parsed;
}

function optionalNumber(
  value: string | boolean | undefined,
  name: string,
  min: number,
  max: number,
): number | undefined {
  if (value === undefined) return undefined;
  return requireNumber(value, name, min, max);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`seedcal: ${message}`);
  process.exitCode = 1;
});