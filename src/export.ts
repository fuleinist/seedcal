import { diffDays, formatFull, formatWeekday } from "./dates.js";
import type { PlanFile } from "./types.js";

export interface PlanEventRow {
  week: number;
  date: string;
  action: "sow" | "transplant" | "harvest start" | "harvest end";
  crop: string;
  bed: number;
  detail: string;
}

export function planEvents(plan: PlanFile): PlanEventRow[] {
  const selected = new Set(plan.settings.selectedCropIds);
  const rows: PlanEventRow[] = [];

  for (const planting of plan.plantings) {
    if (!selected.has(planting.cropId)) continue;

    const week = Math.floor(diffDays(plan.settings.startDate, planting.sowDate) / 7) + 1;
    const soil = planting.soilAtSowC === null ? "unknown" : `${planting.soilAtSowC} °C`;

    rows.push({
      week,
      date: planting.sowDate,
      action: "sow",
      crop: planting.cropName,
      bed: planting.bed,
      detail: `${planting.window} window. Soil ${soil}.`,
    });

    if (planting.transplantDate !== null) {
      rows.push({
        week: Math.floor(diffDays(plan.settings.startDate, planting.transplantDate) / 7) + 1,
        date: planting.transplantDate,
        action: "transplant",
        crop: planting.cropName,
        bed: planting.bed,
        detail: "Harden off before planting out.",
      });
    }

    rows.push({
      week: Math.floor(diffDays(plan.settings.startDate, planting.harvestStart) / 7) + 1,
      date: planting.harvestStart,
      action: "harvest start",
      crop: planting.cropName,
      bed: planting.bed,
      detail: `Harvest from ${formatFull(planting.harvestStart)}.`,
    });

    rows.push({
      week: Math.floor(diffDays(plan.settings.startDate, planting.harvestEnd) / 7) + 1,
      date: planting.harvestEnd,
      action: "harvest end",
      crop: planting.cropName,
      bed: planting.bed,
      detail: `Last harvest around ${formatFull(planting.harvestEnd)}.`,
    });
  }

  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.crop.localeCompare(b.crop));
}

export function planToCsv(plan: PlanFile): string {
  const header = ["week", "date", "weekday", "action", "crop", "bed", "detail"];
  const lines = [header.map(csvCell).join(",")];

  for (const row of planEvents(plan)) {
    lines.push(
      [
        String(row.week),
        row.date,
        formatWeekday(row.date),
        row.action,
        row.crop,
        String(row.bed),
        row.detail,
      ]
        .map(csvCell)
        .join(","),
    );
  }

  return `${lines.join("\n")}\n`;
}

/** CSV text for a file. The byte order mark makes Excel read the file as UTF-8. */
export function planToCsvFile(plan: PlanFile): string {
  return `\ufeff${planToCsv(plan)}`;
}

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}