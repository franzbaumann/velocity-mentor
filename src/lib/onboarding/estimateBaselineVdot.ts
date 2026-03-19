import { format, subDays } from "date-fns";
import type { ActivityRow } from "@/hooks/useActivities";
import { isRunningActivity } from "@/lib/analytics";
import { calculateVDOT } from "@/lib/training/vdot";

/** Distance in meters for Jack Daniels VDOT from race goal time. */
export const RACE_DISTANCE_METERS: Record<string, number> = {
  "1500m": 1500,
  Mile: 1609.344,
  "5K": 5000,
  "10K": 10000,
  "Half Marathon": 21097.5,
  Marathon: 42195,
  Ultra: 50000,
};

export function getRaceDistanceMetersForVdot(raceDistance: string): number | null {
  const v = RACE_DISTANCE_METERS[raceDistance];
  return v ?? null;
}

const GOAL_DISTANCE_KM: Record<string, number> = {
  "1500m": 1.5,
  Mile: 1.60934,
  "5K": 5,
  "10K": 10,
  "Half Marathon": 21.0975,
  Marathon: 42.195,
  Ultra: 50,
};

/** Walks/hikes can have bogus pace/distance for race-fitness estimates. */
function isPaceBaselineRunType(type: string | null | undefined): boolean {
  if (!isRunningActivity(type)) return false;
  const t = (type ?? "").toLowerCase();
  return !/walk|hike/i.test(t);
}

/**
 * Distance window for "similar effort" to goal race — avoids 400 m / bad GPS outliers
 * driving a fake VDOT 70 when the athlete is ~18 min 5K shape.
 */
function baselineDistanceKmWindow(goalRaceDistance: string): { minKm: number; maxKm: number } | null {
  const d = GOAL_DISTANCE_KM[goalRaceDistance];
  if (d == null || d <= 0) return null;
  if (d <= 2) {
    return { minKm: Math.max(1.2, d * 0.85), maxKm: Math.min(6, d * 2.2) };
  }
  if (d <= 8) {
    return { minKm: Math.max(3, d * 0.65), maxKm: Math.min(18, d * 2.6) };
  }
  if (d <= 25) {
    return { minKm: Math.max(5, d * 0.45), maxKm: Math.min(45, d * 1.35) };
  }
  return { minKm: Math.max(12, d * 0.35), maxKm: Math.min(120, d * 1.2) };
}

/** Best-effort recent race fitness from synced runs (highest VDOT in the window). */
export function estimateMaxVdotFromRecentRuns(activities: ActivityRow[], days = 28): number | null {
  const cutoff = format(subDays(new Date(), days), "yyyy-MM-dd");
  const runs = activities.filter(
    (a) => isRunningActivity(a.type) && (a.distance_km ?? 0) >= 1 && a.date >= cutoff
  );
  let best: number | null = null;
  for (const r of runs) {
    const km = r.distance_km ?? 0;
    const sec = r.duration_seconds;
    if (!sec || sec <= 0) continue;
    const v = calculateVDOT(km * 1000, sec);
    if (best == null || v > best) best = v;
  }
  return best;
}

/**
 * VDOT baseline for goal-time feasibility: only runs similar in distance to the race,
 * excluding walk/hike. Returns null if nothing reliable (then UI hides Achievable / Stretch).
 */
export function estimateMaxVdotFromRecentRunsForGoal(
  activities: ActivityRow[],
  goalRaceDistance: string,
  days = 28
): number | null {
  const win = baselineDistanceKmWindow(goalRaceDistance);
  if (!win) return null;
  const cutoff = format(subDays(new Date(), days), "yyyy-MM-dd");
  const runs = activities.filter((a) => {
    if (!isPaceBaselineRunType(a.type) || !a.date || a.date < cutoff) return false;
    const km = a.distance_km ?? 0;
    return km >= win.minKm && km <= win.maxKm;
  });
  let best: number | null = null;
  for (const r of runs) {
    const km = r.distance_km ?? 0;
    const sec = r.duration_seconds;
    if (!sec || sec <= 0) continue;
    const paceSecPerKm = sec / km;
    if (paceSecPerKm < 165) continue;
    if (paceSecPerKm > 720) continue;
    const v = calculateVDOT(km * 1000, sec);
    if (best == null || v > best) best = v;
  }
  return best;
}

export type GoalFeasibility = "achievable" | "stretch" | "ambitious";

export function classifyGoalFeasibility(
  goalVdot: number,
  baselineVdot: number | null
): GoalFeasibility | null {
  if (baselineVdot == null) return null;
  const delta = goalVdot - baselineVdot;
  if (delta <= 1.5) return "achievable";
  if (delta <= 4) return "stretch";
  return "ambitious";
}
