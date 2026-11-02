import assert from "node:assert/strict";
import test from "node:test";
import { planEvents, planToCsv, planToCsvFile } from "../src/export.js";
import { buildPlan } from "../src/plan.js";
import { makeClimate } from "./helpers.js";

const options = {
  startDate: "2021-08-15",
  weeks: 52,
  beds: 2,
  selectedCropIds: ["lettuce", "radish", "garlic"],
  now: "2021-08-15T00:00:00.000Z",
};

test("writes one CSV row per event", () => {
  const plan = buildPlan(makeClimate(), options);
  const events = planEvents(plan);
  const csv = planToCsv(plan);
  const lines = csv.trim().split("\n");

  assert.equal(lines[0], "week,date,weekday,action,crop,bed,detail");
  assert.equal(lines.length, events.length + 1);
  assert.ok(events.length > 0);
  assert.ok(events.every((event) => event.week >= 1));
  assert.ok(events.every((event) => event.crop.length > 0));
  assert.ok(lines.some((line) => line.includes(",sow,")));
  assert.ok(lines.some((line) => line.includes(",harvest start,")));
});

test("quotes cells with commas and quotes", () => {
  const plan = buildPlan(makeClimate(), options);
  const clone = JSON.parse(JSON.stringify(plan));
  clone.plantings[0].cropName = 'Bean, "broad"';

  const csv = planToCsv(clone);
  assert.ok(csv.includes('"Bean, ""broad"""'));
});

test("adds a byte order mark for spreadsheet files", () => {
  const plan = buildPlan(makeClimate(), options);
  const text = planToCsvFile(plan);

  assert.equal(text.charCodeAt(0), 0xfeff);
  assert.equal(text.slice(1), planToCsv(plan));
});