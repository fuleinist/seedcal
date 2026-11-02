# seedcal - Specification

## Problem

Community gardens plan sowing from seed packet labels. Packets give broad climate zones. Last frost, soil temperature and bed gaps change from site to site. Gardeners sow early and lose seed. They also harvest in bursts and face hungry gaps.

## Goal

Give one garden site a week-by-week sowing plan. Use free public weather data. Name the hungry gaps. Export a calendar and a CSV file.

## Users

- Community garden coordinators
- Home gardeners with two to six beds
- Volunteer propagation teams

## Data sources

| Source | Use | Endpoint |
| --- | --- | --- |
| Open-Meteo Archive API | Ten years of daily minimum and mean air temperature | `https://archive-api.open-meteo.com/v1/archive` |
| Open-Meteo Forecast API | Hourly soil temperature at 6 cm for recent days and the next week | `https://api.open-meteo.com/v1/forecast` |
| Open-Meteo Geocoding API | Site name search | `https://geocoding-api.open-meteo.com/v1/search` |

All three sources are free. None needs an API key.

## Functional requirements

**FR1 Site.** Choose a site by name search or by latitude and longitude. Store the name, latitude, longitude and timezone.

**FR2 Climate cache.** Fetch and cache ten years of daily data. The cache lets the demo run offline.

**FR3 Frost dates.** Compute the last spring frost and the first autumn frost for each year. Use a 0 °C threshold. Report the median date and the 90% safe date. Handle sites with no frost.

**FR4 Soil temperature.** Compute daily soil temperature at 6 cm. Calibrate a lag model against observed soil data. Show the latest reading and a 21-day trend.

**FR5 Crop catalog.** Ship 40 common crops. Each crop has a sowing window, a soil temperature minimum, days to harvest and a harvest length.

**FR6 Plan.** Generate sow, transplant and harvest events for 52 weeks. Respect frost dates and soil temperature.

**FR7 Succession.** Repeat sowing for crops with a succession interval. Cap each crop at six sowings per window.

**FR8 Hungry gaps.** Find weeks with no harvest. Suggest crops that can fill each gap.

**FR9 Export.** Write CSV and a printable calendar. The web page prints in landscape.

**FR10 Web app.** Ship a static PWA. It has no runtime dependencies. It works offline after the first load.

## Acceptance criteria

- `npm test` passes.
- `npm run demo` writes `web/data/plan.json` for Canberra with no network.
- The plan shows at least 8 crops, 20 plantings and 52 weeks.
- Frost dates match a hand check for Canberra.
- A frost-free site returns clear text, not an error.
- The page loads with no console error.
- The CSV export has one row per event.
- The README states the data sources and the method limits.

## Method

### Frost dates

For each year, find the longest run of days with a minimum temperature above 0 °C. The day before the run is the last spring frost. The day after the run is the first autumn frost. Aggregate across years with the median and the 90th percentile. The 90th percentile is the safe date.

### Soil temperature

Observed soil data covers only recent weeks. The planner needs a full year. Fit a first-order lag model to daily mean air temperature. Calibrate the model against observed 6 cm soil temperature. Apply the mean bias. Use observed values where dates overlap. Use the calibrated annual curve for future dates.

The soil figure is an estimate. The interface labels it as one.

### Sowing windows

Store each crop window in weeks relative to a frost anchor. A spring window uses the last frost. An autumn window uses the first frost. The planner builds seasons for nearby years and keeps sow dates inside the 52-week range. This handles both hemispheres.

## Non-functional requirements

- TypeScript on Node 20 or later.
- No runtime dependency in the client.
- Tests use `node:test`.
- No personal data and no tracking.
- All authored text follows ASD-STE100.

## Out of scope

- User accounts and sync.
- Live weather alerts.
- Pest and disease models.
- Retail variety data. The catalog is indicative.

## Tech decision

The idea queue suggested Python for analysis. This build uses TypeScript for analysis and web. One toolchain is simpler to test and ship. The output stays static JSON.