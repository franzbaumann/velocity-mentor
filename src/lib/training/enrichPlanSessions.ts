/**
 * After PaceIQ / season plan inserts generic rows, align names and descriptions
 * with the session library so consecutive easy days show different templates.
 */

import { supabase } from "@/integrations/supabase/client";
import type { TrainingPhase } from "./planArchitect";
import type { TargetDistance } from "./sessionLibrary";
import { pickDeterministicLibrarySession, workoutTypeToSelectorDayType } from "./sessionSelector";

function mapGoalRaceToTarget(g: string | null | undefined): TargetDistance {
  const t = (g ?? "").toLowerCase().replace(/\s/g, "_");
  if (["1500m", "5k", "10k", "half_marathon", "marathon", "ultra"].includes(t)) {
    return t as TargetDistance;
  }
  if (t.includes("marathon") && !t.includes("half")) return "marathon";
  if (t.includes("half")) return "half_marathon";
  if (t.includes("10")) return "10k";
  if (t.includes("5")) return "5k";
  if (t.includes("ultra")) return "ultra";
  return "marathon";
}

type WorkoutRow = {
  id: string;
  date: string | null;
  type: string | null;
  phase: string | null;
  week_number: number | null;
  key_focus: string | null;
};

/** Re-label workouts using session library (keeps distance, pace, duration from generator). */
export async function enrichTrainingPlanWorkoutsFromLibrary(planId: string): Promise<void> {
  const { data: plan, error: planErr } = await supabase
    .from("training_plan")
    .select("id, user_id, goal_race")
    .eq("id", planId)
    .maybeSingle();

  if (planErr || !plan) {
    console.warn("[enrichPlanSessions] plan not found", planErr?.message);
    return;
  }

  const userId = plan.user_id as string;

  const { data: profile } = await supabase
    .from("athlete_profile")
    .select("goal_distance, injury_history, injury_history_text, recommended_philosophy, training_philosophy")
    .eq("user_id", userId)
    .maybeSingle();

  const { data: readiness } = await supabase
    .from("daily_readiness")
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const r = readiness as { ctl?: number | null; icu_ctl?: number | null } | null | undefined;
  const currentCTL = r?.ctl ?? r?.icu_ctl ?? 55;

  const injuryHistory: string[] = Array.isArray(profile?.injury_history)
    ? (profile.injury_history as string[])
    : profile?.injury_history_text
      ? [profile.injury_history_text]
      : [];

  const philosophy =
    (profile?.recommended_philosophy as string | undefined) ??
    (profile?.training_philosophy as string | undefined);

  const goalRace = (profile?.goal_distance as string | null) ?? (plan.goal_race as string | null);
  const targetDistance = mapGoalRaceToTarget(goalRace);

  const { data: workouts, error: wErr } = await supabase
    .from("training_plan_workout")
    .select("id, date, type, phase, week_number, key_focus")
    .eq("plan_id", planId)
    .order("date", { ascending: true });

  if (wErr || !workouts?.length) {
    console.warn("[enrichPlanSessions] no workouts", wErr?.message);
    return;
  }

  let previousLibraryId: string | null = null;

  for (let i = 0; i < workouts.length; i++) {
    const w = workouts[i] as WorkoutRow;
    if (!w.date) continue;

    const phase = (w.phase as TrainingPhase) ?? "base";
    const dayType = workoutTypeToSelectorDayType(w.type);

    if (dayType === "rest") {
      await supabase
        .from("training_plan_workout")
        .update({
          name: "Rest Day",
          description: "Full rest — absorb training and reset for the next stimulus.",
          session_library_id: "rest",
        })
        .eq("id", w.id);
      previousLibraryId = "rest";
      continue;
    }

    const picked = pickDeterministicLibrarySession({
      targetDistance,
      phase,
      dayType,
      injuryFlags: injuryHistory,
      philosophy,
      currentCTL,
      variationIndex: i + (w.week_number ?? 1) * 7,
      previousLibraryId,
    });

    if (!picked) {
      console.warn("[enrichPlanSessions] no library match", w.type, phase, targetDistance);
      continue;
    }

    previousLibraryId = picked.id;

    await supabase
      .from("training_plan_workout")
      .update({
        session_library_id: picked.id,
        name: picked.name,
        description: picked.description,
        key_focus: w.key_focus ?? picked.purpose,
      })
      .eq("id", w.id);
  }

  if (import.meta.env.DEV) {
    console.log("[enrichPlanSessions] done for plan", planId, "workouts", workouts.length);
  }
}
