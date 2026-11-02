import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSoilModel,
  dailySoilFromHourly,
  estimateSoilSeries,
  soilTempAt,
} from "../src/soil.js";
import type { DailySeries } from "../src/types.js";

test("keeps a constant air series at the same soil temperature", () => {
  const output = estimateSoilSeries(new Array(30).fill(10));
  assert.equal(output.length, 30);
  for (const value of output) assert.ok(Math.abs(value - 10) < 0.001);
});

test("lags a step change in air temperature", () => {
  const values = [...new Array(14).fill(10), ...new Array(60).fill(20)];
  const output = estimateSoilSeries(values, 0.18);

  assert.ok(output[13] < 11);
  assert.ok(output[output.length - 1] > 19);
  assert.ok(output[output.length - 1] < 20);
});

test("groups hourly soil values into daily means", () => {
  const result = dailySoilFromHourly(
    ["2021-01-01T00:00", "2021-01-01T12:00", "2021-01-02T00:00"],
    [10, 12, 14],
  );

  assert.deepEqual(result, {
    dates: ["2021-01-01", "2021-01-02"],
    values: [11, 14],
  });
});

test("calibrates the soil model against observed values", () => {
  const dates = Array.from({ length: 40 }, (_, index) => {
    const date = new Date(Date.UTC(2021, 0, index + 1));
    return date.toISOString().slice(0, 10);
  });
  const daily: DailySeries = {
    dates,
    tmean: dates.map(() => 10),
    tmin: dates.map(() => 5),
  };

  const model = buildSoilModel(daily, {
    dates: dates.slice(-5),
    values: [12, 12, 12, 12, 12],
  });

  assert.equal(model.biasC, 2);
  assert.equal(model.latestC, 12);
  assert.equal(model.latestDate, dates[dates.length - 1]);
  assert.equal(model.recent.length, 5);
  assert.equal(model.byDate[dates[0]], 12);
  assert.equal(soilTempAt(model, "2022-07-01"), 12);
});

test("returns null when no soil climatology exists", () => {
  const model = buildSoilModel(
    { dates: [], tmin: [], tmean: [] },
    { dates: [], values: [] },
  );

  assert.equal(soilTempAt(model, "2022-07-01"), null);
});