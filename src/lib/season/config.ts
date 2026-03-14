import type { SeasonType } from "./types";

export interface SeasonConfig {
  label: string;
  typical_dates: { start: string; end: string };
  primary_distances: string[];
  surface: string;
  track_length?: number;
  notes: string;
}

export const SEASON_CONFIGS: Record<SeasonType, SeasonConfig> = {
  indoor_track: {
    label: "Inomhussäsong",
    typical_dates: { start: "November", end: "March" },
    primary_distances: ["60m", "200m", "400m", "800m", "1500m", "3000m", "3000m steeplechase"],
    surface: "track_indoor",
    track_length: 200,
    notes: "Sharp speed focus. Higher intensity, lower volume than outdoor. Frequent racing.",
  },
  outdoor_track: {
    label: "Utomhussäsong",
    typical_dates: { start: "April", end: "September" },
    primary_distances: ["100m", "200m", "400m", "800m", "1500m", "3000m", "5000m", "10000m", "3000m steeplechase"],
    surface: "track_outdoor",
    track_length: 400,
    notes: "Peak season. A-races typically June–August. Build from April, peak July.",
  },
  road: {
    label: "Vägsäsong",
    typical_dates: { start: "January", end: "December" },
    primary_distances: ["5k", "10k", "half marathon", "marathon"],
    surface: "road",
    notes: "Typically one or two goal races with longer build phases between.",
  },
  cross_country: {
    label: "Terrängsäsong",
    typical_dates: { start: "September", end: "December" },
    primary_distances: ["4k", "6k", "8k", "10k", "12k"],
    surface: "cross_country",
    notes: "High volume, strength focus. Foundation for track season that follows.",
  },
  mixed: {
    label: "Mixad säsong",
    typical_dates: { start: "Any", end: "Any" },
    primary_distances: ["Any"],
    surface: "mixed",
    notes: "Multiple disciplines or a custom combination.",
  },
};

export const PRIORITY_LABELS: Record<string, string> = {
  A: "Full taper, peak performance",
  B: "Short taper, race fit",
  C: "Training race, no taper",
};
