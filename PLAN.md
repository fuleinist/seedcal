# seedcal - Build Plan

## Phase 1 - Scaffold

- Create the package, TypeScript config, license and ignore file.
- Acceptance: `npm run typecheck` runs with no source error.

## Phase 2 - Types and crop catalog

- Define the data types.
- Add 40 crops with windows, soil minimums and harvest ranges.
- Acceptance: catalog test passes. All ids are unique.

## Phase 3 - Climate client and cache

- Add Open-Meteo archive, soil and geocoding clients.
- Add JSON cache read and write.
- Add a fixture for tests.
- Acceptance: parser test passes on the fixture.

## Phase 4 - Frost and soil models

- Compute frost events and statistics.
- Fit and calibrate the soil temperature model.
- Acceptance: synthetic series give known dates.

## Phase 5 - Planner

- Generate plantings for both seasons.
- Add succession, beds, gap detection and gap suggestions.
- Acceptance: plan test passes. Harvest windows follow the crop data.

## Phase 6 - Export and CLI

- Add CSV export.
- Add `search`, `fetch`, `plan`, `demo`, `export` and `crops` commands.
- Acceptance: `npm run demo` writes a valid plan file offline.

## Phase 7 - Tests

- Cover frost, soil, catalog, planner, export and CLI.
- Acceptance: all tests pass.

## Phase 8 - Web app and PWA

- Build the timeline, crop filters, gap panel and print view.
- Add manifest and service worker.
- Acceptance: the page renders the demo plan with no console error.

## Phase 9 - README and assets

- Add the logo, real screenshots and the README.
- Acceptance: README has features, quick start, screenshots, data sources and license.

## Phase 10 - Commit and push

- Commit each phase.
- Push to GitHub.
- Acceptance: remote branch is current.