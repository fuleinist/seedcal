export interface Site {
  name: string;
  latitude: number;
  longitude: number;
  timezone?: string;
  elevation?: number;
  country?: string;
  countryCode?: string;
  region?: string;
}

export interface DailySeries {
  dates: string[];
  tmin: (number | null)[];
  tmean: (number | null)[];
}

export interface SoilSeries {
  dates: string[];
  values: (number | null)[];
}

export interface ClimateData {
  site: Site;
  fetchedAt: string;
  archiveStart: string;
  archiveEnd: string;
  daily: DailySeries;
  soilDaily: SoilSeries;
}

export interface ClimateCacheFile {
  version: 1;
  site: Site;
  fetchedAt: string;
  archive: {
    start: string;
    end: string;
    daily: DailySeries;
  };
  soil: {
    times: string[];
    values: (number | null)[];
  };
}

export interface FrostEvent {
  year: number;
  doy: number | null;
  date: string | null;
}

export interface FrostStats {
  thresholdC: number;
  years: number;
  yearsWithFrost: number;
  lastFrost: {
    medianDoy: number | null;
    p10Doy: number | null;
    p90Doy: number | null;
    medianLabel: string | null;
    safeLabel: string | null;
  };
  firstFrost: {
    medianDoy: number | null;
    p10Doy: number | null;
    p90Doy: number | null;
    medianLabel: string | null;
    safeLabel: string | null;
  };
  frostFreeDaysMedian: number | null;
  events: {
    year: number;
    last: FrostEvent;
    first: FrostEvent;
  }[];
}

export interface SoilModel {
  biasC: number;
  latestC: number | null;
  latestDate: string | null;
  recent: { date: string; value: number }[];
  byDate: Record<string, number>;
  climatologyByDoy: (number | null)[];
}

export type CropMethod = "direct" | "transplant";
export type Hardiness = "hardy" | "half-hardy" | "tender";

export interface Window {
  from: number;
  to: number;
}

export interface Crop {
  id: string;
  name: string;
  family: string;
  method: CropMethod;
  hardiness: Hardiness;
  minSoilC: number;
  spring?: Window;
  autumn?: Window;
  daysToHarvest: [number, number];
  harvestWeeks: [number, number];
  successionWeeks?: number;
  spacingCm: number;
  gapValue: 1 | 2 | 3 | 4 | 5;
  notes: string;
}

export type SeasonWindow = "spring" | "autumn";

export interface Planting {
  id: string;
  cropId: string;
  cropName: string;
  bed: number;
  sowDate: string;
  transplantDate: string | null;
  harvestStart: string;
  harvestEnd: string;
  seasonYear: number;
  window: SeasonWindow;
  successionIndex: number;
  soilAtSowC: number | null;
}

export interface SkippedSowing {
  cropId: string;
  cropName: string;
  sowDate: string;
  reason: string;
  soilC: number | null;
  minSoilC: number;
}

export interface WeekSummary {
  index: number;
  start: string;
  end: string;
  monthLabel: string;
  sow: string[];
  transplant: string[];
  harvest: string[];
}

export interface Gap {
  startWeek: number;
  endWeek: number;
  startDate: string;
  endDate: string;
  weeks: number;
  message: string;
}

export interface GapSuggestion {
  gapStartWeek: number;
  cropId: string;
  name: string;
  sowBy: string;
  harvestFrom: string;
  note: string;
}

export interface PlanWarning {
  code: string;
  message: string;
}

export interface PlanSettings {
  startDate: string;
  weeks: number;
  beds: number;
  selectedCropIds: string[];
  frostThresholdC: number;
}

export interface PlanFile {
  version: 1;
  generatedAt: string;
  site: Site;
  climate: {
    archiveStart: string;
    archiveEnd: string;
    frostFree: boolean;
    frost: FrostStats;
    soil: {
      latestC: number | null;
      latestDate: string | null;
      biasC: number;
      recent: { date: string; value: number }[];
    };
  };
  settings: PlanSettings;
  crops: Crop[];
  plantings: Planting[];
  skipped: SkippedSowing[];
  weeks: WeekSummary[];
  gaps: Gap[];
  suggestions: GapSuggestion[];
  warnings: PlanWarning[];
}