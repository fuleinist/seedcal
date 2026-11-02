import assert from "node:assert/strict";
import test from "node:test";
import { getCrop } from "../src/crops.js";
import { diffDays } from "../src/dates.js";
import { buildPlan } from "../src/plan.js";
import { frostFreeClimate, makeClimate } from "./helpers.js";

const baseOptions = {
  startDate: "2021-08-15",
  weeks: 52,
  beds: 3,
  selectedCropIds: ["lettuce", "spinach", "radish", "garlic", "broad-bean"],
  now: "2021-08-15T00:00:00.000Z",
};

test("builds a 52-week plan with beds and harvest windows", () => {
  const plan = buildPlan(makeClimate(), baseOptions);
  const start = plan.settings.startDate;
  const end = plan.settings.weeks * 7 - 1;
  const selected = new Set(baseOptions.selectedCropIds);
  const selectedPlantings = plan.plantings.filter((planting) => selected.has(planting.cropId));

  assert.equal(plan.weeks.length, 52);
  assert.equal(plan.settings.beds, 3);
  assert.ok(selectedPlantings.length >= 10);

  for (const planting of plan.plantings) {
    const crop = getCrop(planting.cropId);
    assert.ok(crop, `${planting.cropId} exists`);
    assert.ok(diffDays(start, planting.sowDate) >= 0, `${planting.id} starts in plan`);
    assert.ok(diffDays(start, planting.sowDate) <= end, `${planting.id} starts before end`);
    assert.ok(planting.harvestEnd >= planting.harvestStart, `${planting.id} harvest order`);
    assert.ok(planting.bed >= 1 && planting.bed <= 3, `${planting.id} bed`);
    assert.ok(
      planting.soilAtSowC === null || planting.soilAtSowC >= crop.minSoilC,
      `${planting.id} soil minimum`,
    );
  }

  const firstHarvestWeek = Math.min(
    ...selectedPlantings.map((planting) =>
      Math.floor(diffDays(start, planting.harvestStart) / 7),
    ),
  );

  for (const gap of plan.gaps) {
    assert.ok(gap.startWeek >= firstHarvestWeek, "gaps start after the first harvest");
    assert.ok(gap.weeks >= 1, "gap has a length");
    assert.ok(gap.endDate >= gap.startDate, "gap dates are ordered");
  }

  assert.ok(plan.warnings.some((warning) => warning.code === "short-frost-record"));
});

test("is deterministic for the same input", () => {
  const first = buildPlan(makeClimate(), baseOptions);
  const second = buildPlan(makeClimate(), baseOptions);

  assert.deepEqual(first.plantings, second.plantings);
  assert.deepEqual(first.gaps, second.gaps);
  assert.equal(first.generatedAt, second.generatedAt);
});

test("handles a frost-free site without an error", () => {
  const plan = buildPlan(frostFreeClimate(), {
    ...baseOptions,
    selectedCropIds: ["tomato", "lettuce"],
  });

  assert.equal(plan.climate.frostFree, true);
  assert.ok(plan.warnings.some((warning) => warning.code === "frost-free"));
  assert.ok(plan.plantings.some((planting) => planting.cropId === "tomato"));
});

test("handles an empty crop selection", () => {
  const plan = buildPlan(makeClimate(), { ...baseOptions, selectedCropIds: [] });

  assert.equal(plan.settings.selectedCropIds.length, 0);
  assert.ok(plan.warnings.some((warning) => warning.code === "no-crops"));
  assert.ok(plan.weeks.every((week) => week.harvest.length === 0));
  assert.equal(plan.gaps.length, 0);
});