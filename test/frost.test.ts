import assert from "node:assert/strict";
import test from "node:test";
import {
  computeFrostStats,
  frostFreeStatus,
  isSouthernHemisphere,
  seasonAnchors,
} from "../src/frost.js";
import { series } from "./helpers.js";

test("finds one spring and one autumn frost in a single year", () => {
  const daily = series("2020-01-01", 366, (_date, doy) =>
    doy <= 10 || doy >= 355 ? -1 : 5,
  );
  const stats = computeFrostStats(daily);

  assert.equal(stats.years, 1);
  assert.equal(stats.yearsWithFrost, 1);
  assert.equal(stats.lastFrost.medianDoy, 10);
  assert.equal(stats.firstFrost.medianLabel, "20 Dec");
  assert.equal(stats.lastFrost.medianLabel, "10 Jan");
  assert.equal(stats.firstFrost.medianLabel, "20 Dec");
});

test("handles a southern season that crosses the new year", () => {
  const daily = series("2020-01-01", 731, (date, _doy) => {
    const month = Number(date.slice(5, 7));
    const day = Number(date.slice(8, 10));
    const winter = month >= 5 && month <= 8;
    const springFrost = month === 9 && day <= 20;
    return winter || springFrost ? -1 : 5;
  });
  const stats = computeFrostStats(daily);

  assert.equal(stats.years, 1);
  assert.equal(stats.lastFrost.medianLabel, "20 Sept");
  assert.equal(stats.firstFrost.medianLabel, "1 May");
  assert.equal(stats.frostFreeDaysMedian, 223);
});

test("reports a frost-free site", () => {
  const daily = series("2020-01-01", 730, () => 12);
  const stats = computeFrostStats(daily);

  assert.equal(stats.years, 0);
  assert.equal(stats.yearsWithFrost, 0);
  assert.equal(stats.lastFrost.medianLabel, null);
  assert.equal(stats.firstFrost.medianLabel, null);
  assert.equal(frostFreeStatus(stats), true);
});

test("detects the hemisphere from frost order and latitude", () => {
  const southern = series("2020-01-01", 731, (date) => {
    const month = Number(date.slice(5, 7));
    const day = Number(date.slice(8, 10));
    const winter = month >= 5 && month <= 8;
    return winter || (month === 9 && day <= 20) ? -1 : 5;
  });
  const stats = computeFrostStats(southern);
  assert.equal(isSouthernHemisphere(stats, -35), true);

  const northern = series("2020-01-01", 730, (date) => {
    const month = Number(date.slice(5, 7));
    const day = Number(date.slice(8, 10));
    return (month === 4 && day <= 10) || (month === 10 && day >= 11) ? -1 : 5;
  });
  const northStats = computeFrostStats(northern);
  assert.equal(isSouthernHemisphere(northStats, 50), false);
});

test("builds season anchors across the year", () => {
  const daily = series("2020-01-01", 731, (date) => {
    const month = Number(date.slice(5, 7));
    const day = Number(date.slice(8, 10));
    const winter = month >= 5 && month <= 8;
    return winter || (month === 9 && day <= 20) ? -1 : 5;
  });
  const stats = computeFrostStats(daily);
  const anchors = seasonAnchors(stats, 2027, true);

  assert.equal(anchors.year, 2027);
  assert.equal(anchors.lastFrost, "2027-09-20");
  assert.equal(anchors.firstFrost, "2028-05-01");
});