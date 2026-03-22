/**
 * Link a synced activity row to the best-matching planned training_plan_workout for the same day.
 * Sets planned_workout_id + planned_session_label; optionally marks the workout completed.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  buildPlannedSessionLabel,
  pickWorkoutForActivity,
  RUN_LIKE_TYPES,
  type PlanWorkoutMatchRow,
} from "./activity-match-logic.ts";

export async function linkActivityToPlannedWorkout(
  admin: SupabaseClient,
  userId: string,
  input: {
    date: string;
    distanceKm: number | null;
    activityType: string;
    garminId: string;
    /** DB activity.id — preferred for completed_activity_id */
    activityId?: string | null;
    markWorkoutCompleted?: boolean;
  },
): Promise<void> {
  if (!RUN_LIKE_TYPES.has(input.activityType)) return;

  const date = input.date.slice(0, 10);
  const { data: rows, error: qErr } = await admin
    .from("training_plan_workout")
    .select("id, distance_km, target_distance_km, type, name, week_number, phase")
    .eq("user_id", userId)
    .eq("date", date)
    .limit(12);

  if (qErr) {
    console.error("[linkActivityToPlannedWorkout] query", qErr.message);
    return;
  }

  const list = (rows ?? []) as PlanWorkoutMatchRow[];
  const chosen = pickWorkoutForActivity(list, input.distanceKm ?? 0, 0.2);
  if (!chosen) return;

  const label = buildPlannedSessionLabel(chosen);

  const { error: actErr } = await admin
    .from("activity")
    .update({
      planned_workout_id: chosen.id,
      planned_session_label: label || null,
    })
    .eq("user_id", userId)
    .eq("garmin_id", input.garminId);

  if (actErr) {
    console.error("[linkActivityToPlannedWorkout] activity update", actErr.message);
    return;
  }

  const markComplete = input.markWorkoutCompleted !== false;
  if (markComplete) {
    const completedRef = (input.activityId && input.activityId.length > 0) ? input.activityId : input.garminId;
    const { error: wErr } = await admin
      .from("training_plan_workout")
      .update({
        completed: true,
        completed_activity_id: completedRef,
        actual_distance_km: input.distanceKm ?? undefined,
      })
      .eq("id", chosen.id)
      .eq("user_id", userId);
    if (wErr) console.error("[linkActivityToPlannedWorkout] workout update", wErr.message);
  }
}
