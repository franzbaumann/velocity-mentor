/**
 * Pure matching helpers — keep in sync with supabase/functions/_shared/activity-match-logic.ts
 */

export const RUN_LIKE_TYPES = new Set(["Run", "TrailRun", "VirtualRun", "Walk", "Hike"]);

export interface PlanWorkoutMatchRow {
  id: string;
  distance_km?: number | null;
  target_distance_km?: number | null;
  type?: string | null;
  name?: string | null;
  week_number?: number | null;
  phase?: string | null;
}

function plannedKmForMatch(w: PlanWorkoutMatchRow): number {
  const t = w.target_distance_km != null ? Number(w.target_distance_km) : NaN;
  if (!Number.isNaN(t) && t > 0) return t;
  const d = w.distance_km != null ? Number(w.distance_km) : NaN;
  if (!Number.isNaN(d) && d > 0) return d;
  return 0;
}

/** Prefer distance within tolerance; else first non-rest row (callers should pre-filter). */
export function pickWorkoutForActivity(
  rows: PlanWorkoutMatchRow[],
  actualKm: number,
  tolerance = 0.2,
): PlanWorkoutMatchRow | null {
  const nonRest = rows.filter((w) => String(w.type ?? "").toLowerCase() !== "rest");
  if (nonRest.length === 0) return null;
  if (actualKm >= 0.01) {
    const byDist = nonRest.find((w) => {
      const pk = plannedKmForMatch(w);
      if (pk <= 0) return false;
      return Math.abs(pk - actualKm) / pk < tolerance;
    });
    if (byDist) return byDist;
  }
  return nonRest[0] ?? null;
}

export function buildPlannedSessionLabel(w: PlanWorkoutMatchRow): string {
  const name = w.name ?? "";
  const wn = w.week_number != null ? `Week ${w.week_number}` : "";
  const phase = w.phase ? String(w.phase) : "";
  return [name, wn, phase].filter((s) => s.length > 0).join(" — ").slice(0, 500);
}
