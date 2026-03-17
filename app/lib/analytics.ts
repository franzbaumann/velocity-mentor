import { addDays } from "date-fns";

export type StatsActivity = {
  id: string;
  date: string;
  type: string | null;
  distance_km: number | null;
  duration_seconds: number | null;
  avg_hr: number | null;
  avg_pace: string | null;
  splits?: unknown;
  icu_training_load?: number | null;
  trimp?: number | null;
  external_id?: string | null;
  max_hr?: number | null;
};

const DEFAULT_THRESHOLD_HR = 170;

export function computeTSS(durationSeconds: number, avgHr: number, thresholdHr = DEFAULT_THRESHOLD_HR): number {
  if (!durationSeconds || !avgHr || !thresholdHr) return 0;
  return (durationSeconds * avgHr * 100) / (3600 * thresholdHr * 100);
}

function ewa(series: number[], days: number): number[] {
  const alpha = 2 / (days + 1);
  const out: number[] = [];
  for (let i = 0; i < series.length; i++) {
    if (i === 0) out.push(series[0]);
    else out.push(alpha * series[i] + (1 - alpha) * out[i - 1]);
  }
  return out;
}

function getActivityLoad(a: StatsActivity, thresholdHr: number): number | null {
  if (!a.date) return null;
  if (a.avg_hr != null && a.duration_seconds != null) {
    const tss = computeTSS(a.duration_seconds, a.avg_hr, thresholdHr);
    if (tss > 0) return tss;
  }
  if (a.icu_training_load != null && a.icu_training_load > 0) return a.icu_training_load;
  if (a.trimp != null && a.trimp > 0) return a.trimp;
  if (a.duration_seconds != null && a.duration_seconds > 0) return a.duration_seconds / 36;
  if (a.distance_km != null && a.distance_km > 0) return a.distance_km * 10;
  return null;
}

export function dailyTSSFromActivities(activities: StatsActivity[], thresholdHr = DEFAULT_THRESHOLD_HR): Map<string, number> {
  const map = new Map<string, number>();
  for (const a of activities) {
    const load = getActivityLoad(a, thresholdHr);
    if (load == null || load <= 0) continue;
    const existing = map.get(a.date) ?? 0;
    map.set(a.date, existing + load);
  }
  return map;
}

export function computeFitnessCurves(
  activities: StatsActivity[],
  startDate: string,
  endDate: string,
  thresholdHr = DEFAULT_THRESHOLD_HR,
): { date: string; CTL: number; ATL: number; TSB: number }[] {
  const dailyTSS = dailyTSSFromActivities(activities, thresholdHr);
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days: string[] = [];
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
    days.push(d.toISOString().slice(0, 10));
  }
  const series = days.map((d) => dailyTSS.get(d) ?? 0);
  const ctl42 = ewa(series, 42);
  const atl7 = ewa(series, 7);
  return days.map((d, i) => ({
    date: d,
    CTL: Math.round(ctl42[i] * 10) / 10,
    ATL: Math.round(atl7[i] * 10) / 10,
    TSB: Math.round((ctl42[i] - atl7[i]) * 10) / 10,
  }));
}

export function parsePaceToMinPerKm(pace: string | null): number | null {
  if (!pace || typeof pace !== "string") return null;
  const m = pace.match(/(\d+):(\d+)/);
  if (!m) return null;
  const min = parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
  if (min < 2 || min > 25) return null;
  return min;
}

export function isNonDistanceActivity(type: string | null | undefined): boolean {
  if (!type) return false;
  const t = type.toLowerCase();
  return (
    /gym|fitness equipment|strength|weight|crossfit|hiit|pilates|yoga/i.test(t) ||
    /elliptical|rowing|erg|concept.?2|stair|stairmaster|stepper/i.test(t) ||
    /ski|snowboard|skating|skateboard/i.test(t) ||
    /cycling|bike|biking|ride|indoor.?cycle|spin/i.test(t) ||
    /swim|pool|open.?water|triathlon/i.test(t)
  );
}

export function isRunningActivity(type: string | null | undefined): boolean {
  if (!type) return false;
  if (isNonDistanceActivity(type)) return false;
  const t = type.toLowerCase();
  return /run|treadmill|trail|street|track|indoor.?run|jog|walk|hike|ultra/i.test(t);
}

export function inferRunType(type: string | null): "easy" | "tempo" | "long" | "other" {
  if (!type) return "other";
  const t = type.toLowerCase();
  if (/easy|recovery|jog/i.test(t)) return "easy";
  if (/tempo|threshold|interval|workout/i.test(t)) return "tempo";
  if (/long|long run/i.test(t)) return "long";
  return "other";
}

/** Pace progression filter: easy = Zone 2 (60–70% max HR), LT1 = 75–82%, LT2 = 85–92%. Copy from web. */
export type PaceProgressionFilter = "all" | "easy" | "lt1" | "lt2";

/**
 * Classify run by HR zones. Easy = Z2 (60–70%), LT1 = 75–82%, LT2 = 85–92%.
 * Returns null if no avg_hr or max_hr. Copy exact logic from web analytics.ts.
 */
export function classifyRunByHr(
  activity: { avg_hr?: number | null; max_hr?: number | null },
  _zones?: unknown,
): "easy" | "lt1" | "lt2" | null {
  const avgHr = activity?.avg_hr ?? null;
  const maxHr = activity?.max_hr ?? null;
  if (avgHr == null || maxHr == null || maxHr <= 0) return null;
  const pct = (avgHr / maxHr) * 100;
  if (pct >= 60 && pct <= 70) return "easy";
  if (pct >= 75 && pct <= 82) return "lt1";
  if (pct >= 85 && pct <= 92) return "lt2";
  return null;
}

/** Resolve run type label for display (badge). Prefer HR-based classification, fallback to name/type inference. */
export function getRunTypeLabelForDisplay(activity: {
  type: string | null;
  avg_hr?: number | null;
  max_hr?: number | null;
}): string {
  if (!activity?.type || !isRunningActivity(activity.type)) return activity?.type ?? "Activity";
  const hrType = classifyRunByHr(activity);
  if (hrType === "easy") return "Easy";
  if (hrType === "lt1") return "Tempo";
  if (hrType === "lt2") return "Interval";
  const inferred = inferRunType(activity.type);
  if (inferred === "easy") return "Easy";
  if (inferred === "tempo") return "Tempo";
  if (inferred === "long") return "Long";
  return "Run";
}

export const PR_DISTANCES = [
  { key: "1km", km: 1, label: "1 km" },
  { key: "1mi", km: 1.60934, label: "1 mile" },
  { key: "5km", km: 5, label: "5 km" },
  { key: "10km", km: 10, label: "10 km" },
  { key: "half", km: 21.0975, label: "Half Marathon" },
  { key: "marathon", km: 42.195, label: "Marathon" },
] as const;

export function findBestForDistance(
  activities: StatsActivity[],
  targetKm: number,
  tolerance = 0.05,
): { timeSec: number; paceMinPerKm: number; date: string; activityId: string; externalId?: string | null } | null {
  let best: { timeSec: number; paceMinPerKm: number; date: string; activityId: string; externalId?: string | null } | null = null;
  for (const a of activities) {
    if (!isRunningActivity(a.type)) continue;
    const dist = a.distance_km ?? 0;
    const dur = a.duration_seconds ?? 0;
    if (!dur || dist < targetKm * (1 - tolerance) || dist > 150) continue;
    if (dist >= targetKm * (1 - tolerance)) {
      const equivTime = dur * (targetKm / dist);
      const pace = equivTime / 60 / targetKm;
      if (pace < 2 || pace > 15) continue;
      const minTimeSec = targetKm * 120;
      if (equivTime < minTimeSec) continue;
      if (!best || pace < best.paceMinPerKm) best = { timeSec: equivTime, paceMinPerKm: pace, date: a.date, activityId: a.id, externalId: (a as { external_id?: string | null }).external_id };
    }
    const splits = a.splits as Array<{ distance?: number; elapsed_time?: number }> | null;
    if (splits && Array.isArray(splits)) {
      let cumDist = 0;
      let cumTime = 0;
      for (const s of splits) {
        const d = (s.distance ?? 0) / 1000;
        const t = s.elapsed_time ?? 0;
        cumDist += d;
        cumTime += t;
        if (cumDist >= targetKm * (1 - tolerance)) {
          const segDist = cumDist;
          const segTime = cumTime;
          const equivTime = segTime * (targetKm / segDist);
          const pace = equivTime / 60 / targetKm;
          if (pace < 2 || pace > 15) break;
          const minTimeSec = targetKm * 120;
          if (equivTime < minTimeSec) break;
          if (!best || pace < best.paceMinPerKm) best = { timeSec: equivTime, paceMinPerKm: pace, date: a.date, activityId: a.id, externalId: (a as { external_id?: string | null }).external_id };
          break;
        }
      }
    }
  }
  return best;
}

export function getActivityFadeColor(activity: {
  type: string | null;
  name?: string | null;
  avg_hr?: number | null;
  duration_seconds?: number | null;
}): string {
  void activity;
  return "#3b82f6";
}

