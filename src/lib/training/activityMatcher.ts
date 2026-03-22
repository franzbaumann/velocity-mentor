/**
 * Client / script: match Run-like activities to same-day plan workouts.
 * Edge functions use supabase/functions/_shared/plan-activity-match.ts (same selection rules).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildPlannedSessionLabel,
  pickWorkoutForActivity,
  RUN_LIKE_TYPES,
  type PlanWorkoutMatchRow,
} from "./activityMatchLogic.ts";

export { RUN_LIKE_TYPES, pickWorkoutForActivity, buildPlannedSessionLabel };
export type { PlanWorkoutMatchRow };

export interface MatchActivityToWorkoutParams {
  activityId: string;
  userId: string;
  activityDate: string;
  actualDistanceKm: number | null;
  activityType: string;
  /** When false, only sets planned_workout_id on activity (backfill-safe). Default true. */
  markWorkoutCompleted?: boolean;
}

export async function matchActivityToPlannedWorkout(
  supabase: SupabaseClient,
  params: MatchActivityToWorkoutParams,
): Promise<{ linked: boolean; workoutId: string | null; reason?: string }> {
  if (!RUN_LIKE_TYPES.has(params.activityType)) {
    return { linked: false, workoutId: null, reason: "not_run_like" };
  }
  const date = params.activityDate.slice(0, 10);
  const { data: rows, error } = await supabase
    .from("training_plan_workout")
    .select("id, distance_km, target_distance_km, type, name, week_number, phase")
    .eq("user_id", params.userId)
    .eq("date", date)
    .limit(12);

  if (error) return { linked: false, workoutId: null, reason: error.message };

  const chosen = pickWorkoutForActivity((rows ?? []) as PlanWorkoutMatchRow[], params.actualDistanceKm ?? 0, 0.2);
  if (!chosen) return { linked: false, workoutId: null, reason: "no_planned_workouts" };

  const label = buildPlannedSessionLabel(chosen);
  const { error: u1 } = await supabase
    .from("activity")
    .update({ planned_workout_id: chosen.id, planned_session_label: label || null })
    .eq("id", params.activityId)
    .eq("user_id", params.userId);

  if (u1) return { linked: false, workoutId: null, reason: u1.message };

  const markComplete = params.markWorkoutCompleted !== false;
  if (markComplete) {
    const { error: u2 } = await supabase
      .from("training_plan_workout")
      .update({
        completed: true,
        completed_activity_id: params.activityId,
        actual_distance_km: params.actualDistanceKm ?? undefined,
      })
      .eq("id", chosen.id)
      .eq("user_id", params.userId);
    if (u2) return { linked: true, workoutId: chosen.id, reason: `workout_update:${u2.message}` };
  }

  return { linked: true, workoutId: chosen.id };
}
