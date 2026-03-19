import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Match a completed activity to a training_plan_workout on the same day (±15% distance).
 * Returns workout id or null. Prefer server-side linking via intervals-proxy; this is for manual/backfill.
 */
export async function matchActivityToWorkout(
  supabase: SupabaseClient,
  userId: string,
  activity: { date: string; distance_km: number | null; type?: string | null },
): Promise<string | null> {
  const { data: workouts } = await supabase
    .from("training_plan_workout")
    .select("id, distance_km, type, name, week_number, phase")
    .eq("user_id", userId)
    .eq("date", activity.date)
    .limit(8);

  if (!workouts?.length) return null;

  const runLike = /run|walk|hike|trail|virtual/i.test(activity.type ?? "Run");
  const candidates = runLike
    ? workouts.filter((w) => String(w.type ?? "").toLowerCase() !== "rest")
    : workouts;

  const list = candidates.length ? candidates : workouts;
  const actualKm = activity.distance_km ?? 0;

  const match = list.find((w) => {
    const plannedKm = w.distance_km != null ? Number(w.distance_km) : null;
    if (plannedKm == null || plannedKm <= 0 || actualKm < 0.01) return false;
    return Math.abs(plannedKm - actualKm) / plannedKm < 0.15;
  });

  return match?.id ?? list[0]?.id ?? null;
}

export function buildPlannedSessionLabel(workout: {
  name?: string | null;
  week_number?: number | null;
  phase?: string | null;
}): string {
  const name = workout.name ?? "";
  const wn = workout.week_number != null ? `Week ${workout.week_number}` : "";
  const phase = workout.phase ? String(workout.phase) : "";
  return [name, wn, phase].filter((s) => s.length > 0).join(" — ").slice(0, 500);
}
