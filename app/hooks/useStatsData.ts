import { useMemo } from "react";
import { format, startOfWeek, subDays, subWeeks, subMonths } from "date-fns";
import { ActivityRow, ReadinessRow, useDashboardData } from "./useDashboardData";
import {
  StatsActivity,
  computeFitnessCurves,
  inferRunType,
  parsePaceToMinPerKm,
  PR_DISTANCES,
  findBestForDistance,
  isRunningActivity,
} from "../lib/analytics";

const fmt = (d: Date) => format(d, "yyyy-MM-dd");
const now = new Date();
const oldest16w = fmt(subWeeks(now, 16));
const oldest120d = fmt(subDays(now, 120));
const oldest2m = fmt(subMonths(now, 2));

type FitnessPoint = { date: string; CTL: number; ATL: number; TSB: number };
type WeeklyMileagePoint = { week: string; km: number };
type PacePoint = { date: string; pace: number; type: "easy" | "tempo" | "long" | "other" };
type PaceTrendPoint = PacePoint & { trend: number };
type PRRow = {
  key: string;
  label: string;
  km: number;
  best: { timeSec: number; pace: number; date: string; activityLinkId: string } | null;
};
type HREfficiencyPoint = { date: string; pace: number; hr: number };
type HRVPoint = { date: string; hrv: number };
type ReadinessScorePoint = { date: string; score: number };
type VO2maxPoint = { date: string; vo2max: number };
type RampRatePoint = { date: string; rampRate: number };
type SleepRestingPoint = { date: string; sleep: number | null; restingHr: number | null };
type SleepScorePoint = { date: string; score: number };
type StepsPoint = { date: string; steps: number };
type WeightPoint = { date: string; weight: number };
type WellnessCheckPoint = { date: string; value: number };

type WellnessField = "stress_score" | "mood" | "energy" | "muscle_soreness";

function resolveCtlAtlTsb(r: {
  ctl?: number | null;
  atl?: number | null;
  tsb?: number | null;
  icu_ctl?: number | null;
  icu_atl?: number | null;
  icu_tsb?: number | null;
}) {
  const ctl = r.ctl ?? r.icu_ctl ?? null;
  const atl = r.atl ?? r.icu_atl ?? null;
  const tsb = r.tsb ?? r.icu_tsb ?? (ctl != null && atl != null ? ctl - atl : null);
  return { ctl, atl, tsb };
}

function resolveHREfficiencyBand(athleteProfile: { lactate_threshold_hr?: number | null } | null | undefined) {
  const fallback = { min: 140, max: 150 };
  const lt = athleteProfile?.lactate_threshold_hr;
  if (lt == null || !isFinite(lt)) return fallback;
  // Approximate aerobic easy zone: ~78–88% of lactate threshold HR
  const min = Math.round(lt * 0.78);
  const max = Math.round(lt * 0.88);
  if (min < 100 || max <= min) return fallback;
  return { min, max };
}

function toStatsActivities(activities: ActivityRow[]): StatsActivity[] {
  return activities.map((a) => ({
    id: a.id,
    date: a.date,
    type: a.type,
    distance_km: a.distance_km,
    duration_seconds: a.duration_seconds,
    avg_hr: a.avg_hr,
    avg_pace: a.avg_pace,
    splits: undefined,
    external_id: a.external_id,
    max_hr: a.max_hr,
  }));
}

function buildFitnessSeries(activities: ActivityRow[], readinessRows: ReadinessRow[]): FitnessPoint[] {
  const statsActs = toStatsActivities(
    activities.filter(
      (a) =>
        isRunningActivity(a.type) &&
        a.date >= oldest16w &&
        a.date <= fmt(now) &&
        (a.distance_km ?? 0) > 0 &&
        (a.distance_km ?? 0) <= 150,
    ),
  );

  const fromReadiness = readinessRows
    .filter((r) => {
      const { ctl, atl, tsb } = resolveCtlAtlTsb(r);
      return (ctl != null || atl != null || tsb != null) && r.date >= oldest16w && r.date <= fmt(now);
    })
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-120)
    .map<FitnessPoint>((r) => {
      const { ctl, atl, tsb } = resolveCtlAtlTsb(r);
      return {
        date: r.date,
        CTL: ctl ?? 0,
        ATL: atl ?? 0,
        TSB: tsb ?? 0,
      };
    });

  if (fromReadiness.length > 0) {
    const hasSignal = fromReadiness.some((p) => p.CTL !== 0 || p.ATL !== 0 || p.TSB !== 0);
    if (hasSignal) return fromReadiness;
  }

  if (!statsActs.length) return [];
  return computeFitnessCurves(statsActs, oldest16w, fmt(now));
}

function buildWeeklyMileageSeries(activities: ActivityRow[]): WeeklyMileagePoint[] {
  const weeks: Record<string, number> = {};
  for (const a of activities) {
    if (!a.date || !a.distance_km) continue;
    if (!isRunningActivity(a.type)) continue;
    const d = new Date(a.date);
    const wk = fmt(startOfWeek(d, { weekStartsOn: 1 }));
    weeks[wk] = (weeks[wk] ?? 0) + a.distance_km;
  }
  return Object.entries(weeks)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-16)
    .map<WeeklyMileagePoint>(([week, km]) => ({
      week: format(new Date(week), "MMM d"),
      km: Math.round(km * 10) / 10,
    }));
}

function buildPaceSeries(activities: ActivityRow[]): { points: PacePoint[]; trendline: PaceTrendPoint[] } {
  const running = activities.filter(
    (a) =>
      isRunningActivity(a.type) &&
      a.date >= oldest2m &&
      a.date <= fmt(now) &&
      (a.distance_km ?? 0) > 0 &&
      (a.distance_km ?? 0) <= 150,
  );

  const pts: PacePoint[] = running
    .map((a) => {
      const pace = parsePaceToMinPerKm(a.avg_pace);
      if (!pace) return null;
      return {
        date: a.date,
        pace,
        type: inferRunType(a.type),
      };
    })
    .filter((x): x is PacePoint => !!x)
    .sort((a, b) => a.date.localeCompare(b.date));

  const win = 4 * 7;
  const trend: PaceTrendPoint[] = pts.map((p, i) => {
    const slice = pts.slice(Math.max(0, i - win + 1), i + 1);
    const avg = slice.length ? slice.reduce((s, x) => s + x.pace, 0) / slice.length : p.pace;
    return { ...p, trend: Math.round(avg * 100) / 100 };
  });

  return { points: pts, trendline: trend };
}

function buildPRs(activities: ActivityRow[]): PRRow[] {
  const statsActs = toStatsActivities(
    activities.filter(
      (a) =>
        isRunningActivity(a.type) &&
        (a.distance_km ?? 0) > 0 &&
        (a.distance_km ?? 0) <= 150,
    ),
  );

  return PR_DISTANCES.map(({ key, km, label }) => {
    const best = findBestForDistance(statsActs, km);
    if (!best) return { key, label, km, best: null };
    const activityLinkId = best.externalId ? `icu_${best.externalId}` : best.activityId;
    return {
      key,
      label,
      km,
      best: {
        timeSec: best.timeSec,
        pace: best.paceMinPerKm,
        date: best.date,
        activityLinkId,
      },
    };
  });
}

function buildHREfficiencySeries(
  activities: ActivityRow[],
  athleteProfile: { lactate_threshold_hr?: number | null } | null | undefined,
): HREfficiencyPoint[] {
  const band = resolveHREfficiencyBand(athleteProfile);
  return activities
    .filter((a) => {
      if (!isRunningActivity(a.type)) return false;
      if (
        !a.date ||
        a.date < oldest2m ||
        a.date > fmt(now) ||
        a.avg_hr == null ||
        a.avg_hr < band.min ||
        a.avg_hr > band.max
      )
        return false;
      const pace = parsePaceToMinPerKm(a.avg_pace);
      return pace != null && pace >= 2 && pace <= 25;
    })
    .map<HREfficiencyPoint>((a) => ({
      date: a.date,
      pace: parsePaceToMinPerKm(a.avg_pace)!,
      hr: a.avg_hr!,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function buildHRVSeries(readiness: ReadinessRow[]): HRVPoint[] {
  return readiness
    .filter((r) => r.date >= oldest2m && r.date <= fmt(now))
    .map((r) => {
      // Prefer true HRV, then baseline from intervals.icu, then fall back to resting HR
      const val = r.hrv ?? r.hrv_baseline ?? r.resting_hr;
      return val != null ? ({ date: r.date, hrv: val } as HRVPoint) : null;
    })
    .filter((x): x is HRVPoint => x != null)
    .slice(-120)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function buildReadinessScoreSeries(readiness: ReadinessRow[]): ReadinessScorePoint[] {
  return readiness
    .filter((r) => r.date >= oldest2m && r.date <= fmt(now))
    .map((r) => {
      const explicit = r.score;
      const { ctl, tsb } = resolveCtlAtlTsb(r);
      let derived: number | null = null;
      if (explicit != null) {
        derived = explicit;
      } else if (tsb != null) {
        derived = 50 + tsb * 2.5;
      } else if (ctl != null) {
        derived = ctl;
      }
      if (derived == null || !isFinite(derived)) return null;
      const clamped = Math.round(Math.min(100, Math.max(0, derived)));
      return { date: r.date, score: clamped } as ReadinessScorePoint;
    })
    .filter((x): x is ReadinessScorePoint => x != null)
    .slice(-120)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function buildVO2maxSeries(readiness: ReadinessRow[]): VO2maxPoint[] {
  return readiness
    .filter((r) => r.vo2max != null)
    .map<VO2maxPoint>((r) => ({ date: r.date, vo2max: r.vo2max! }))
    .slice(-120)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function buildRampRateSeries(readiness: ReadinessRow[]): RampRatePoint[] {
  return readiness
    .filter((r) => r.ramp_rate != null)
    .map<RampRatePoint>((r) => ({ date: r.date, rampRate: r.ramp_rate! }))
    .slice(-120)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function buildSleepRestingSeries(readiness: ReadinessRow[]): SleepRestingPoint[] {
  return readiness
    .filter((r) => (r.sleep_hours != null || r.resting_hr != null) && r.date >= oldest2m && r.date <= fmt(now))
    .map<SleepRestingPoint>((r) => ({
      date: r.date,
      sleep: r.sleep_hours,
      restingHr: r.resting_hr,
    }))
    .slice(-120)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function buildSleepScoreSeries(readiness: ReadinessRow[]): SleepScorePoint[] {
  return readiness
    .filter((r) => r.sleep_score != null && r.date >= oldest2m && r.date <= fmt(now))
    .map<SleepScorePoint>((r) => ({
      date: r.date,
      score: r.sleep_score ?? 0,
    }))
    .slice(-120)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function buildStepsSeries(readiness: ReadinessRow[]): StepsPoint[] {
  return readiness
    .filter((r) => (r.steps ?? 0) > 0 && r.date >= oldest2m && r.date <= fmt(now))
    .map<StepsPoint>((r) => ({
      date: r.date,
      steps: r.steps ?? 0,
    }))
    .slice(-120)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function buildWeightSeries(readiness: ReadinessRow[]): WeightPoint[] {
  return readiness
    .filter((r) => r.weight != null && r.date >= oldest2m && r.date <= fmt(now))
    .map<WeightPoint>((r) => ({
      date: r.date,
      weight: r.weight ?? 0,
    }))
    .slice(-120)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function buildWellnessSeries(readiness: ReadinessRow[], field: WellnessField): WellnessCheckPoint[] {
  return readiness
    .filter((r) => (r as any)[field] != null && r.date >= oldest2m && r.date <= fmt(now))
    .map<WellnessCheckPoint>((r) => ({
      date: r.date,
      value: (r as any)[field] ?? 0,
    }))
    .slice(-60)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function useStatsData() {
  const { activities, readinessRows, isLoading, athleteProfile, refetchAll } = useDashboardData();

  const runningActivities = useMemo(
    () => activities.filter((a) => isRunningActivity(a.type) && (a.distance_km ?? 0) <= 150),
    [activities],
  );

  const fitnessSeries = useMemo(
    () => buildFitnessSeries(activities, readinessRows),
    [activities, readinessRows],
  );

  const weeklyMileageSeries = useMemo(
    () => buildWeeklyMileageSeries(runningActivities),
    [runningActivities],
  );

  const { points: pacePoints, trendline: paceTrendline } = useMemo(
    () => buildPaceSeries(runningActivities),
    [runningActivities],
  );

  const prs = useMemo(() => buildPRs(runningActivities), [runningActivities]);

  const hrEfficiencySeries = useMemo(
    () => buildHREfficiencySeries(runningActivities, athleteProfile),
    [runningActivities, athleteProfile],
  );

  const hrvSeries = useMemo(() => buildHRVSeries(readinessRows), [readinessRows]);
  const readinessScoreSeries = useMemo(
    () => buildReadinessScoreSeries(readinessRows),
    [readinessRows],
  );
  const vo2maxSeries = useMemo(() => buildVO2maxSeries(readinessRows), [readinessRows]);
  const rampRateSeries = useMemo(() => buildRampRateSeries(readinessRows), [readinessRows]);
  const sleepRestingSeries = useMemo(
    () => buildSleepRestingSeries(readinessRows),
    [readinessRows],
  );
  const sleepScoreSeries = useMemo(
    () => buildSleepScoreSeries(readinessRows),
    [readinessRows],
  );
  const stepsSeries = useMemo(
    () => buildStepsSeries(readinessRows),
    [readinessRows],
  );
  const weightSeries = useMemo(
    () => buildWeightSeries(readinessRows),
    [readinessRows],
  );
  const stressSeries = useMemo(
    () => buildWellnessSeries(readinessRows, "stress_score"),
    [readinessRows],
  );
  const moodSeries = useMemo(
    () => buildWellnessSeries(readinessRows, "mood"),
    [readinessRows],
  );
  const energySeries = useMemo(
    () => buildWellnessSeries(readinessRows, "energy"),
    [readinessRows],
  );
  const sorenessSeries = useMemo(
    () => buildWellnessSeries(readinessRows, "muscle_soreness"),
    [readinessRows],
  );

  const hasData = runningActivities.length > 0 || readinessRows.length > 0;

  const fitnessSummary = useMemo(() => {
    const latest = readinessRows.length > 0 ? readinessRows[readinessRows.length - 1] : null;
    const vo2max =
      (latest as { vo2max?: number | null } | null)?.vo2max ??
      (athleteProfile as { vo2max?: number | null } | null)?.vo2max ??
      null;
    const hrvVals = readinessRows
      .map((r) => r.hrv)
      .filter((v): v is number => v != null)
      .slice(-7);
    const hrv7dAvg = hrvVals.length ? hrvVals.reduce((a, b) => a + b, 0) / hrvVals.length : null;
    const hrvToday = latest?.hrv ?? null;
    const hrvVsAvg =
      hrvToday != null && hrv7dAvg != null
        ? hrvToday > hrv7dAvg
          ? "↑"
          : hrvToday < hrv7dAvg
            ? "↓"
            : "→"
        : null;

    const { ctl, atl, tsb } = latest ? resolveCtlAtlTsb(latest) : { ctl: null, atl: null, tsb: null };

    return {
      ctl,
      atl,
      tsb,
      vo2max,
      hrv7dAvg,
      hrvVsAvg,
    } as {
      ctl: number | null;
      atl: number | null;
      tsb: number | null;
      vo2max: number | null;
      hrv7dAvg: number | null;
      hrvVsAvg: "↑" | "↓" | "→" | null;
    };
  }, [athleteProfile, readinessRows]);

  const maxHr = useMemo(() => {
    const profileMax = (athleteProfile as { max_hr?: number | null })?.max_hr;
    if (profileMax != null && profileMax > 0) return profileMax;
    const actMax = activities
      .map((a) => (a as { max_hr?: number | null }).max_hr)
      .filter((v): v is number => v != null && v > 0);
    return actMax.length > 0 ? Math.max(...actMax) : null;
  }, [athleteProfile, activities]);

  return {
    isLoading,
    hasData,
    runningActivities,
    readinessRows,
    fitnessSeries,
    weeklyMileageSeries,
    pacePoints,
    paceTrendline,
    prs,
    hrEfficiencySeries,
    hrvSeries,
    readinessScoreSeries,
    vo2maxSeries,
    rampRateSeries,
    sleepRestingSeries,
    sleepScoreSeries,
    stepsSeries,
    weightSeries,
    fitnessSummary,
    stressSeries,
    moodSeries,
    energySeries,
    sorenessSeries,
    maxHr,
    refetchAll,
  };
}