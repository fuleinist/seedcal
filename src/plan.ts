import { addDays, diffDays, formatDay, formatFull, formatMonth, todayISO } from "./dates.js";
import { CROPS, DEFAULT_CROP_IDS } from "./crops.js";
import {
  computeFrostStats,
  frostFreeStatus,
  isSouthernHemisphere,
  seasonAnchors,
} from "./frost.js";
import { buildSoilModel, soilTempAt } from "./soil.js";
import type {
  ClimateData,
  Crop,
  Gap,
  GapSuggestion,
  PlanFile,
  Planting,
  SeasonWindow,
  SkippedSowing,
  WeekSummary,
} from "./types.js";

export interface PlanOptions {
  startDate?: string;
  weeks?: number;
  beds?: number;
  selectedCropIds?: string[];
  frostThresholdC?: number;
  now?: string;
  crops?: Crop[];
}

const MAX_SUCCESSION = 6;

export function buildPlan(climate: ClimateData, options: PlanOptions = {}): PlanFile {
  const startDate = options.startDate ?? todayISO();
  const weeks = clamp(options.weeks ?? 52, 4, 104);
  const beds = clamp(options.beds ?? 4, 1, 24);
  const thresholdC = options.frostThresholdC ?? 0;
  const crops = options.crops ?? CROPS;
  const generatedAt = options.now ?? new Date().toISOString();

  const frost = computeFrostStats(climate.daily, thresholdC);
  const soil = buildSoilModel(climate.daily, climate.soilDaily);
  const southern = isSouthernHemisphere(frost, climate.site.latitude);
  const frostFree = frostFreeStatus(frost);
  const planEnd = addDays(startDate, weeks * 7 - 1);

  const validIds = new Set(crops.map((crop) => crop.id));
  const explicitSelection = options.selectedCropIds !== undefined;
  let selected = (options.selectedCropIds ?? DEFAULT_CROP_IDS).filter((id) => validIds.has(id));
  selected = [...new Set(selected)];
  if (!explicitSelection && selected.length === 0) {
    selected = crops.slice(0, 6).map((crop) => crop.id);
  }
  const selectedSet = new Set(selected);
  const cropById = new Map(crops.map((crop) => [crop.id, crop]));

  const startYear = Number(startDate.slice(0, 4));
  const seasons = [startYear - 1, startYear, startYear + 1, startYear + 2].map((year) =>
    seasonAnchors(frost, year, southern),
  );

  const plantings: Planting[] = [];
  const skipped: SkippedSowing[] = [];
  const seen = new Set<string>();

  for (const crop of crops) {
    for (const season of seasons) {
      for (const windowName of ["spring", "autumn"] as SeasonWindow[]) {
        const window = crop[windowName];
        if (!window) continue;

        const anchor = windowName === "spring" ? season.lastFrost : season.firstFrost;
        const sowStart = addDays(anchor, window.from * 7);
        const sowEnd = addDays(anchor, window.to * 7);
        if (sowEnd < startDate || sowStart > planEnd) continue;

        const weekly: string[] = [];
        for (let date = sowStart; date <= sowEnd; date = addDays(date, 7)) {
          weekly.push(date);
        }

        const stride = crop.successionWeeks ?? 1;
        let accepted = 0;
        let coldSearches = 0;

        for (let index = 0; index < weekly.length; index += stride) {
          const sowDate = weekly[index];
          if (sowDate < startDate || sowDate > planEnd) continue;

          const soilC = soilTempAt(soil, sowDate);
          if (soilC !== null && soilC < crop.minSoilC) {
            if (crop.successionWeeks !== undefined || coldSearches === 0) {
              skipped.push({
                cropId: crop.id,
                cropName: crop.name,
                sowDate,
                reason:
                  crop.successionWeeks !== undefined
                    ? `Soil at 6 cm is ${soilC} °C. The crop needs ${crop.minSoilC} °C.`
                    : `No week in this window reached ${crop.minSoilC} °C. The first check was ${soilC} °C.`,
                soilC,
                minSoilC: crop.minSoilC,
              });
            }
            coldSearches += 1;
            continue;
          }

          const key = `${crop.id}-${sowDate}`;
          if (seen.has(key)) continue;
          seen.add(key);
          accepted += 1;

          const midDays = Math.round((crop.daysToHarvest[0] + crop.daysToHarvest[1]) / 2);
          const midHarvestWeeks = Math.round(
            (crop.harvestWeeks[0] + crop.harvestWeeks[1]) / 2,
          );
          const transplantDate = crop.method === "transplant" ? addDays(sowDate, 28) : null;
          const harvestStart = addDays(transplantDate ?? sowDate, midDays);
          const harvestEnd = addDays(harvestStart, midHarvestWeeks * 7);

          plantings.push({
            id: key,
            cropId: crop.id,
            cropName: crop.name,
            bed: 1,
            sowDate,
            transplantDate,
            harvestStart,
            harvestEnd,
            seasonYear: season.year,
            window: windowName,
            successionIndex: accepted - 1,
            soilAtSowC: soilC,
          });

          if (crop.successionWeeks === undefined) break;
          if (accepted >= MAX_SUCCESSION) break;
        }
      }
    }
  }

  plantings.sort((a, b) => a.sowDate.localeCompare(b.sowDate) || a.cropName.localeCompare(b.cropName));

  const bedByCrop = new Map<string, number>();
  for (const planting of plantings) {
    if (!bedByCrop.has(planting.cropId)) {
      bedByCrop.set(planting.cropId, (bedByCrop.size % beds) + 1);
    }
    planting.bed = bedByCrop.get(planting.cropId) ?? 1;
  }

  const selectedPlantings = plantings.filter((planting) => selectedSet.has(planting.cropId));

  const weekList: WeekSummary[] = [];
  for (let index = 0; index < weeks; index += 1) {
    const start = addDays(startDate, index * 7);
    const end = addDays(start, 6);
    weekList.push({
      index,
      start,
      end,
      monthLabel: formatMonth(start),
      sow: unique(
        selectedPlantings
          .filter((planting) => planting.sowDate >= start && planting.sowDate <= end)
          .map((planting) => planting.cropName),
      ),
      transplant: unique(
        selectedPlantings
          .filter(
            (planting) =>
              planting.transplantDate !== null &&
              planting.transplantDate >= start &&
              planting.transplantDate <= end,
          )
          .map((planting) => planting.cropName),
      ),
      harvest: unique(
        selectedPlantings
          .filter((planting) => planting.harvestStart <= end && planting.harvestEnd >= start)
          .map((planting) => planting.cropName),
      ),
    });
  }

  const gaps = findGaps(weekList);
  const suggestions = suggestForGaps(gaps, plantings, selectedSet, cropById);

  const warnings: { code: string; message: string }[] = [];
  if (frost.years < 5) {
    warnings.push({
      code: "short-frost-record",
      message: `Only ${frost.years} complete years of frost data are available. Treat the dates as indicative.`,
    });
  }
  if (frostFree) {
    warnings.push({
      code: "frost-free",
      message: `No frost was found in ${frost.years} years. The plan uses soil temperature and seasonal proxies.`,
    });
  }
  if (skipped.length > 0) {
    warnings.push({
      code: "cold-soil-sowings",
      message: `${skipped.length} sowings were skipped because the soil was too cold.`,
    });
  }
  if (Math.abs(soil.biasC) > 2) {
    warnings.push({
      code: "soil-bias",
      message: `The soil model differs from the observed data by ${soil.biasC} °C. Treat soil figures as estimates.`,
    });
  }
  if (selected.length === 0) {
    warnings.push({
      code: "no-crops",
      message: "No crops are selected. Turn on at least one crop to see a plan.",
    });
  }
  if (selected.length > 0 && selectedPlantings.length === 0) {
    warnings.push({
      code: "no-harvest",
      message: "No selected crop has a sowing window in this plan. Move the start date or choose other crops.",
    });
  }
  const ageDays = diffDays(climate.archiveEnd, generatedAt.slice(0, 10));
  if (ageDays > 14) {
    warnings.push({
      code: "stale-archive",
      message: `The climate archive ends on ${formatDay(climate.archiveEnd)}. Recent soil data may be stale.`,
    });
  }

  return {
    version: 1,
    generatedAt,
    site: climate.site,
    climate: {
      archiveStart: climate.archiveStart,
      archiveEnd: climate.archiveEnd,
      frostFree,
      frost,
      soil: {
        latestC: soil.latestC,
        latestDate: soil.latestDate,
        biasC: soil.biasC,
        recent: soil.recent,
      },
    },
    settings: {
      startDate,
      weeks,
      beds,
      selectedCropIds: selected,
      frostThresholdC: thresholdC,
    },
    crops,
    plantings,
    skipped,
    weeks: weekList,
    gaps,
    suggestions,
    warnings,
  };
}

function findGaps(weeks: WeekSummary[]): Gap[] {
  const gaps: Gap[] = [];
  const harvestWeeks = weeks.filter((week) => week.harvest.length > 0);
  if (harvestWeeks.length === 0) return gaps;

  const first = harvestWeeks[0].index;
  let current: { start: number; end: number } | null = null;

  const flush = () => {
    if (!current) return;
    const startWeek = weeks[current.start];
    const endWeek = weeks[current.end];
    const count = current.end - current.start + 1;
    gaps.push({
      startWeek: current.start,
      endWeek: current.end,
      startDate: startWeek.start,
      endDate: endWeek.end,
      weeks: count,
      message: `No harvest from ${formatFull(startWeek.start)} to ${formatFull(endWeek.end)} (${count} week${count === 1 ? "" : "s"}).`,
    });
    current = null;
  };

  for (const week of weeks) {
    if (week.index < first) continue;
    if (week.harvest.length === 0) {
      if (!current) current = { start: week.index, end: week.index };
      else current.end = week.index;
    } else {
      flush();
    }
  }
  flush();

  return gaps;
}

function suggestForGaps(
  gaps: Gap[],
  plantings: Planting[],
  selected: Set<string>,
  cropById: Map<string, Crop>,
): GapSuggestion[] {
  const suggestions: GapSuggestion[] = [];

  for (const gap of gaps) {
    const candidates = plantings
      .filter((planting) => !selected.has(planting.cropId))
      .filter(
        (planting) =>
          planting.harvestStart <= gap.endDate && planting.harvestEnd >= gap.startDate,
      )
      .map((planting) => {
        const crop = cropById.get(planting.cropId);
        if (!crop) return null;
        const overlapStart = planting.harvestStart > gap.startDate ? planting.harvestStart : gap.startDate;
        const overlapEnd = planting.harvestEnd < gap.endDate ? planting.harvestEnd : gap.endDate;
        const overlapWeeks = Math.floor(diffDays(overlapStart, overlapEnd) / 7) + 1;
        return {
          planting,
          crop,
          score: crop.gapValue * 10 + overlapWeeks * 2 - crop.daysToHarvest[0] / 30,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => b.score - a.score);

    const used = new Set<string>();
    for (const row of candidates) {
      if (used.has(row.crop.id)) continue;
      used.add(row.crop.id);
      suggestions.push({
        gapStartWeek: gap.startWeek,
        cropId: row.crop.id,
        name: row.crop.name,
        sowBy: row.planting.sowDate,
        harvestFrom: row.planting.harvestStart,
        note: row.crop.notes,
      });
      if (used.size >= 3) break;
    }
  }

  return suggestions;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}