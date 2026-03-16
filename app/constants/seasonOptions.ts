export const SEASON_TYPES = [
  {
    id: "indoor_track",
    emoji: "🏟️",
    title: "Indoor Track",
    description:
      "Sharp speed focus. Higher intensity, lower volume than outdoor. Frequent racing.",
  },
  {
    id: "outdoor_track",
    emoji: "🏃",
    title: "Outdoor Track",
    description:
      "Peak season. A-races typically June–August. Build from April, peak July.",
  },
  {
    id: "road",
    emoji: "🏁",
    title: "Road",
    description:
      "Typically one or two goal races with longer build phases between.",
  },
  {
    id: "cross_country",
    emoji: "🌿",
    title: "Cross Country",
    description:
      "High volume, strength focus. Foundation for track season that follows.",
  },
  {
    id: "mixed",
    emoji: "🔀",
    title: "Mixed season",
    description: "Multiple disciplines or a custom combination.",
  },
] as const;

export type SeasonTypeId = (typeof SEASON_TYPES)[number]["id"];

export const PRIMARY_DISTANCES = [
  "800m",
  "1500m",
  "3000m",
  "5K",
  "10K",
  "Half Marathon",
  "Marathon",
  "Ultra",
  "Other",
];

export function suggestedSeasonName(seasonType: SeasonTypeId, year: number): string {
  const label =
    SEASON_TYPES.find((t) => t.id === seasonType)?.title ?? "Season";
  return `${label} ${year}`;
}
