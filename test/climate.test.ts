import assert from "node:assert/strict";
import test from "node:test";
import {
  climateFromCache,
  describeSite,
  searchSites,
} from "../src/climate.js";
import type { ClimateCacheFile } from "../src/types.js";

const cache: ClimateCacheFile = {
  version: 1,
  site: {
    name: "Test garden",
    latitude: -35,
    longitude: 149,
    timezone: "Australia/Sydney",
  },
  fetchedAt: "2021-01-03T00:00:00.000Z",
  archive: {
    start: "2021-01-01",
    end: "2021-01-02",
    daily: {
      dates: ["2021-01-01", "2021-01-02"],
      tmin: [10, 11],
      tmean: [20, 21],
    },
  },
  soil: {
    times: [
      "2021-01-01T00:00",
      "2021-01-01T12:00",
      "2021-01-02T00:00",
    ],
    values: [10, 12, 14],
  },
};

test("turns a cache into daily climate data", () => {
  const data = climateFromCache(cache);

  assert.equal(data.site.name, "Test garden");
  assert.deepEqual(data.soilDaily, {
    dates: ["2021-01-01", "2021-01-02"],
    values: [11, 14],
  });
});

test("rejects an unknown cache version", () => {
  const broken = { ...cache, version: 2 } as unknown as ClimateCacheFile;
  assert.throws(() => climateFromCache(broken), /Unsupported cache version/);
});

test("formats a site label", () => {
  assert.equal(
    describeSite({
      name: "Canberra City Farm",
      region: "ACT",
      country: "Australia",
      latitude: -35,
      longitude: 149,
    }),
    "Canberra City Farm, ACT, Australia",
  );
});

test("returns no search result for an empty query", async () => {
  assert.deepEqual(await searchSites("   "), []);
});