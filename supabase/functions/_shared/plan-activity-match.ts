/**
 * Link a synced activity row to the best-matching planned training_plan_workout for the same day.
 * Sets planned_workout_id + planned_session_label for Community / Activity detail badges.
 */

const RUN_LIKE = new Set(["Run", "TrailRun", "VirtualRun", "Walk", "Hike"]);

export async function linkActivityToPlannedWorkout(
  admin: SupabaseClient,
  userId: string,
  input: {
    date: string;
    distanceKm: number | null;
    activityType: string;
    garminId: string;
  },
): Promise<void> {
  if (!RUN_LIKE.has(input.activityType)) return;

  const { data: rows } = await admin
    .from("training_plan_workout")
    .select("id, distance_km, type, name, week_number, phase")
    .eq("user_id", userId)
    .eq("date", input.date)
    .limit(8);

  if (!rows?.length) return;

  const actualKm = input.distanceKm ?? 0;

  let chosen = rows.find((w: { distance_km?: number | null }) => {
    const pk = w.distance_km != null ? Number(w.distance_km) : null;
    if (pk == null || pk <= 0 || actualKm < 0.01) return false;
    return Math.abs(pk - actualKm) / pk < 0.15;
  }) as { id: string; name?: string | null; week_number?: number | null; phase?: string | null } | undefined;

  if (!chosen) {
    chosen = rows[0] as typeof chosen;
  }

  const name = chosen?.name ?? "";
  const wn = chosen?.week_number != null ? `Week ${chosen.week_number}` : "";
  const phase = chosen?.phase ? String(chosen.phase) : "";
  const label = [name, wn, phase].filter((s) => s.length > 0).join(" — ").slice(0, 500);

  await admin
    .from("activity")
    .update({
      planned_workout_id: chosen.id,
      planned_session_label: label || null,
    })
    .eq("user_id", userId)
    .eq("garmin_id", input.garminId);
}
