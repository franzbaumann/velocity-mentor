import { getISOWeek, getISOWeekYear, parseISO } from "date-fns";
import type { Session, TargetDistance } from "./sessionLibrary";
import {
  defaultDistanceKmFromSession,
  defaultDurationMinutesFromSession,
} from "./librarySessionVolume";

/** Typical weekly km used to scale session bands when recent volume is known. */
export function referenceWeeklyKmForTargetDistance(d: TargetDistance): number {
  const table: Partial<Record<TargetDistance, number>> = {
    "1500m": 25,
    "5k": 35,
    "10k": 45,
    half_marathon: 55,
    marathon: 65,
    ultra: 80,
    season: 50,
  };
  return table[d] ?? 50;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Scale midpoint of a distance band by recent weekly volume vs reference, then clamp to [min,max].
 */
export function scaleBandKm(
  mid: number,
  minKm: number,
  maxKm: number,
  recentWeeklyKm: number | null,
  refWeeklyKm: number
): number {
  if (recentWeeklyKm == null || recentWeeklyKm <= 0 || refWeeklyKm <= 0) {
    return Math.round(mid * 10) / 10;
  }
  const factor = clamp(recentWeeklyKm / refWeeklyKm, 0.65, 1.25);
  const scaled = mid * factor;
  return Math.round(clamp(scaled, minKm, maxKm) * 10) / 10;
}

export function scaledPlannedVolumeFromSession(
  session: Session,
  options: {
    recentWeeklyKm: number | null;
    targetDistance: TargetDistance;
  }
): { distanceKm: number | null; durationMin: number } {
  const ref = referenceWeeklyKmForTargetDistance(options.targetDistance);
  const mid = defaultDistanceKmFromSession(session);
  const baseDur = defaultDurationMinutesFromSession(session);

  if (mid == null) {
    return { distanceKm: null, durationMin: baseDur };
  }

  const minK = session.distanceKmMin ?? mid;
  const maxK = session.distanceKmMax ?? mid;
  const km = scaleBandKm(mid, minK, maxK, options.recentWeeklyKm, ref);
  const durationMin =
    mid > 0 ? Math.max(20, Math.round(baseDur * (km / mid))) : baseDur;

  return { distanceKm: km, durationMin };
}

export type WeekVolumeRow = {
  id: string;
  weekKey: string;
  dayType: "easy" | "quality" | "long" | "double" | "rest";
  distanceKm: number | null;
  distMin: number;
  distMax: number;
  durationMin: number;
};

/**
 * Ensure the longest run in each ISO week is at least slightly longer than the longest easy day.
 * Mutates `distanceKm` on rows where `dayType === "long"`.
 */
export function applyWeekLongVersusEasyCoherence(rows: WeekVolumeRow[]): void {
  const byWeek = new Map<string, WeekVolumeRow[]>();
  for (const r of rows) {
    if (r.dayType === "rest") continue;
    const list = byWeek.get(r.weekKey) ?? [];
    list.push(r);
    byWeek.set(r.weekKey, list);
  }

  for (const list of byWeek.values()) {
    let maxEasy = 0;
    for (const r of list) {
      if (r.dayType === "easy" && r.distanceKm != null) {
        maxEasy = Math.max(maxEasy, r.distanceKm);
      }
    }
    const longRows = list.filter((r) => r.dayType === "long");
    if (longRows.length === 0 || maxEasy <= 0) continue;

    for (const lr of longRows) {
      const current = lr.distanceKm ?? 0;
      if (current >= maxEasy - 0.25) continue;
      const bumpTo = Math.min(lr.distMax, Math.max(lr.distMin, maxEasy + 1.5));
      const prev = lr.distanceKm;
      lr.distanceKm = Math.round(bumpTo * 10) / 10;
      if (prev != null && prev > 0 && lr.distanceKm != null) {
        lr.durationMin = Math.max(20, Math.round(lr.durationMin * (lr.distanceKm / prev)));
      }
    }
  }
}

/** ISO week key: `YYYY-Www` (Monday-based week per ISO-8601). */
export function isoWeekKeyFromDateStr(dateStr: string): string {
  const d = parseISO(dateStr.length > 10 ? dateStr.slice(0, 10) : dateStr);
  const y = getISOWeekYear(d);
  const w = getISOWeek(d);
  return `${y}-W${String(w).padStart(2, "0")}`;
}
