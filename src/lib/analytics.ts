import { addDays, startOfWeek, subDays, subWeeks } from "date-fns";
import type { ActivityRow } from "@/hooks/useActivities";

type ActivityWithLoad = ActivityRow & { icu_training_load?: number | null; trimp?: number | null };

const DEFAULT_THRESHOLD_HR = 170;

/** TSS = (duration_seconds × avg_hr × 100) / (3600 × threshold_hr × 100) */
export function computeTSS(durationSeconds: number, avgHr: number, thresholdHr = DEFAULT_THRESHOLD_HR): number {
  if (!durationSeconds || !avgHr || !thresholdHr) return 0;
  return (durationSeconds * avgHr * 100) / (3600 * thresholdHr * 100);
}

/** Exponential weighted average: new = alpha * val + (1 - alpha) * prev. alpha = 2 / (N + 1) */
function ewa(series: number[], days: number): number[] {
  const alpha = 2 / (days + 1);
  const out: number[] = [];
  for (let i = 0; i < series.length; i++) {
    if (i === 0) out.push(series[0]);
    else out.push(alpha * series[i] + (1 - alpha) * out[i - 1]);
  }
  return out;
}

/** Get TSS/load for an activity. Prefers HR-based TSS, then icu_training_load, trimp, or duration-based estimate. */
function getActivityLoad(a: ActivityWithLoad, thresholdHr = DEFAULT_THRESHOLD_HR): number | null {
  if (!a.date) return null;
  if (a.avg_hr != null && a.duration_seconds != null) {
    const tss = computeTSS(a.duration_seconds, a.avg_hr, thresholdHr);
    if (tss > 0) return tss;
  }
  if (a.icu_training_load != null && a.icu_training_load > 0) return a.icu_training_load;
  if (a.trimp != null && a.trimp > 0) return a.trimp;
  if (a.duration_seconds != null && a.duration_seconds > 0) {
    return a.duration_seconds / 36;
  }
  if (a.distance_km != null && a.distance_km > 0) return a.distance_km * 10;
  return null;
}

/** Build daily TSS map from activities. Uses HR-based TSS, icu_training_load, trimp, or duration/distance estimates. */
export function dailyTSSFromActivities(activities: ActivityRow[], thresholdHr = DEFAULT_THRESHOLD_HR): Map<string, number> {
  const map = new Map<string, number>();
  for (const a of activities) {
    const load = getActivityLoad(a, thresholdHr);
    if (load == null || load <= 0) continue;
    const existing = map.get(a.date) ?? 0;
    map.set(a.date, existing + load);
  }
  return map;
}

/** CTL (42d), ATL (7d), TSB for each day over range. Returns array of { date, CTL, ATL, TSB } */
export function computeFitnessCurves(
  activities: ActivityRow[],
  startDate: string,
  endDate: string,
  thresholdHr = DEFAULT_THRESHOLD_HR
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

/** Parse pace string "5:30" or "5:30 /km" to min per km. Returns null if invalid or outside 2–25 min/km. */
export function parsePaceToMinPerKm(pace: string | null): number | null {
  if (!pace || typeof pace !== "string") return null;
  const m = pace.match(/(\d+):(\d+)/);
  if (!m) return null;
  const min = parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
  if (min < 2 || min > 25) return null;
  return min;
}

/** Activities whose distance in km is not comparable to running (don't use for mileage/stats) */
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

/** True if activity is a run (excludes gym, elliptical, skiing, cycling, swim, etc.) */
export function isRunningActivity(type: string | null | undefined): boolean {
  if (!type) return false;
  if (isNonDistanceActivity(type)) return false;
  const t = type.toLowerCase();
  return /run|treadmill|trail|street|track|indoor.?run|jog|walk|hike|ultra/i.test(t);
}

/** Infer run type from name/type */
export function inferRunType(type: string | null): "easy" | "tempo" | "long" | "other" {
  if (!type) return "other";
  const t = type.toLowerCase();
  if (/easy|recovery|jog/i.test(t)) return "easy";
  if (/tempo|threshold|interval|workout/i.test(t)) return "tempo";
  if (/long|long run/i.test(t)) return "long";
  return "other";
}

/** Pace progression filter: easy = Zone 2 (60–70% max HR), LT1 = 75–82%, LT2 = 85–92% */
export type PaceProgressionFilter = "all" | "easy" | "lt1" | "lt2";

/** Classify run by HR zones. Easy = Z2 (60–70%), LT1 = 75–82%, LT2 = 85–92%. Returns null if no avg_hr or max_hr. */
export function classifyRunByHr(
  avgHr: number | null,
  maxHr: number | null
): "easy" | "lt1" | "lt2" | null {
  if (avgHr == null || maxHr == null || maxHr <= 0) return null;
  const pct = (avgHr / maxHr) * 100;
  if (pct >= 60 && pct <= 70) return "easy";
  if (pct >= 75 && pct <= 82) return "lt1";
  if (pct >= 85 && pct <= 92) return "lt2";
  return null;
}

/** PR distances in km */
export const PR_DISTANCES = [
  { key: "1km", km: 1, label: "1 km" },
  { key: "1mi", km: 1.60934, label: "1 mile" },
  { key: "5km", km: 5, label: "5 km" },
  { key: "10km", km: 10, label: "10 km" },
  { key: "half", km: 21.0975, label: "Half Marathon" },
  { key: "marathon", km: 42.195, label: "Marathon" },
] as const;

/** Find best pace for a distance from splits or full activity. Only considers running activities. Returns null if invalid. */
export function findBestForDistance(
  activities: ActivityRow[],
  targetKm: number,
  tolerance = 0.05
): { timeSec: number; paceMinPerKm: number; date: string; activityId: string; externalId?: string | null } | null {
  let best: { timeSec: number; paceMinPerKm: number; date: string; activityId: string; externalId?: string | null } | null = null;
  for (const a of activities) {
    if (!isRunningActivity(a.type)) continue;
    const dist = a.distance_km ?? 0;
    const dur = a.duration_seconds ?? 0;
    if (!dur || dist < targetKm * (1 - tolerance) || dist > 150) continue;
    // Full activity: use overall pace, scale time to target distance
    if (dist >= targetKm * (1 - tolerance)) {
      const equivTime = dur * (targetKm / dist);
      const pace = equivTime / 60 / targetKm;
      if (pace < 2 || pace > 15) continue;
      const minTimeSec = targetKm * 120;
      if (equivTime < minTimeSec) continue;
      if (!best || pace < best.paceMinPerKm) best = { timeSec: equivTime, paceMinPerKm: pace, date: a.date, activityId: a.id, externalId: (a as { external_id?: string | null }).external_id };
    }
    // Splits: find best segment
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
