import assert from "node:assert/strict";
import test from "node:test";
import { CROPS, DEFAULT_CROP_IDS, getCrop } from "../src/crops.js";

test("ships forty crops with unique ids", () => {
  assert.equal(CROPS.length, 40);
  const ids = new Set(CROPS.map((crop) => crop.id));
  assert.equal(ids.size, CROPS.length);
});

test("every crop has usable windows and ranges", () => {
  for (const crop of CROPS) {
    assert.ok(crop.name.length > 0, `${crop.id} has a name`);
    assert.ok(crop.spring !== undefined || crop.autumn !== undefined, `${crop.id} has a window`);
    if (crop.spring) assert.ok(crop.spring.from <= crop.spring.to, `${crop.id} spring order`);
    if (crop.autumn) assert.ok(crop.autumn.from <= crop.autumn.to, `${crop.id} autumn order`);
    assert.ok(crop.daysToHarvest[0] > 0, `${crop.id} harvest days`);
    assert.ok(crop.daysToHarvest[0] <= crop.daysToHarvest[1], `${crop.id} harvest order`);
    assert.ok(crop.harvestWeeks[0] > 0, `${crop.id} harvest weeks`);
    assert.ok(crop.harvestWeeks[0] <= crop.harvestWeeks[1], `${crop.id} harvest week order`);
    assert.ok(crop.minSoilC >= 0 && crop.minSoilC <= 25, `${crop.id} soil minimum`);
    assert.ok(crop.spacingCm > 0, `${crop.id} spacing`);
    assert.ok(crop.gapValue >= 1 && crop.gapValue <= 5, `${crop.id} gap value`);
  }
});

test("default selection points at real crops", () => {
  assert.equal(DEFAULT_CROP_IDS.length, 10);
  for (const id of DEFAULT_CROP_IDS) {
    assert.ok(getCrop(id), `${id} exists`);
  }
});

test("unknown crop ids return undefined", () => {
  assert.equal(getCrop("not-a-crop"), undefined);
});