import type {
  RacePriority,
  SeasonPhase,
  TaperWeek,
  CompetitionSeason,
  SeasonRace,
} from "./types";

const DAY_MS = 86_400_000;

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / DAY_MS);
}

export function calculateTaperStart(raceDate: string, priority: RacePriority): string | null {
  if (priority === "A") return addDays(raceDate, -21);
  if (priority === "B") return addDays(raceDate, -10);
  return null;
}

export function daysUntil(dateStr: string): number {
  const today = new Date().toISOString().slice(0, 10);
  return daysBetween(today, dateStr);
}

export function weeksRemaining(endDate: string): number {
  return Math.max(0, Math.ceil(daysUntil(endDate) / 7));
}

export function getTargetTSB(priority: RacePriority): { min: number; max: number } | null {
  if (priority === "A") return { min: 10, max: 20 };
  if (priority === "B") return { min: 0, max: 10 };
  return null;
}

export function getTaperPlan(priority: RacePriority): TaperWeek[] {
  if (priority === "A") {
    return [
      { weekLabel: "Week -3", instruction: "Reduce volume 20%. Last long run this Sunday." },
      { weekLabel: "Week -2", instruction: "Last hard session Tuesday. Volume down 30%." },
      { weekLabel: "Week -1", instruction: "Easy runs only. 4×100m strides daily. Rest Thursday." },
      { weekLabel: "Race day", instruction: "Target TSB: +15. You should feel fresh and sharp." },
    ];
  }
  if (priority === "B") {
    return [
      { weekLabel: "Week -1", instruction: "Reduce volume 15–20%. One easy day before race." },
      { weekLabel: "Race day", instruction: "Target TSB: 0 to +10. Race fit, not peaked." },
      { weekLabel: "Day after", instruction: "Easy recovery run or rest. Resume normal within 3–4 days." },
    ];
  }
  return [
    { weekLabel: "Race week", instruction: "Normal training. Treat race as a hard workout." },
    { weekLabel: "Day after", instruction: "Resume normal training if feeling good." },
  ];
}

function getSeasonProgress(season: CompetitionSeason): number {
  const today = new Date().toISOString().slice(0, 10);
  const total = daysBetween(season.start_date, season.end_date);
  if (total <= 0) return 1;
  const elapsed = daysBetween(season.start_date, today);
  return Math.max(0, Math.min(1, elapsed / total));
}

export function calculateSeasonPhase(
  season: CompetitionSeason,
  races: SeasonRace[],
): SeasonPhase {
  const today = new Date().toISOString().slice(0, 10);

  const upcomingRaces = races
    .filter((r) => r.status === "upcoming" && r.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  const nextRace = upcomingRaces[0] ?? null;
  const nextARace = upcomingRaces.find((r) => r.priority === "A") ?? null;

  const daysToNext = nextRace ? daysBetween(today, nextRace.date) : null;
  const daysToNextA = nextARace ? daysBetween(today, nextARace.date) : null;

  if (daysToNext !== null && daysToNext <= 7 && nextRace?.priority === "A") return "race_week";
  if (daysToNextA !== null && daysToNextA <= 21) return "taper";

  const recentRaces = races
    .filter((r) => (r.status === "completed" || r.status === "DNS" || r.status === "DNF") && r.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date));
  if (recentRaces.length > 0 && daysBetween(recentRaces[0].date, today) <= 7) return "recovery";

  const progress = getSeasonProgress(season);
  if (progress < 0.25) return "base";
  if (progress < 0.6) return "build";
  return "peak";
}

export function getNextRace(races: SeasonRace[]): SeasonRace | null {
  const today = new Date().toISOString().slice(0, 10);
  return (
    races
      .filter((r) => r.status === "upcoming" && r.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null
  );
}

export function getNextARace(races: SeasonRace[]): SeasonRace | null {
  const today = new Date().toISOString().slice(0, 10);
  return (
    races
      .filter((r) => r.status === "upcoming" && r.date >= today && r.priority === "A")
      .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null
  );
}

export function getPastUnloggedRaces(races: SeasonRace[]): SeasonRace[] {
  const today = new Date().toISOString().slice(0, 10);
  return races.filter((r) => r.status === "upcoming" && r.date < today);
}
