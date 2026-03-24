/**
 * After PaceIQ / season plan inserts generic rows, align names and descriptions
 * with the session library so consecutive easy days show different templates.
 * Scales km/min toward recent weekly volume and enforces long >= max(easy) per ISO week.
 */

import { format, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { TrainingPhase } from "./planArchitect";
import type { Session, TargetDistance } from "./sessionLibrary";
import {
  applyWeekLongVersusEasyCoherence,
  isoWeekKeyFromDateStr,
  scaledPlannedVolumeFromSession,
  type WeekVolumeRow,
} from "./planVolumeScale";
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
  skeleton_session_type?: string | null;
  session_category?: string | null;
  phase: string | null;
  week_number: number | null;
  key_focus: string | null;
};

/** Prefer architect / skeleton slot, then legacy `type`, then session_category. */
function resolveWorkoutSlotType(w: WorkoutRow): string {
  const raw =
    (w.skeleton_session_type && String(w.skeleton_session_type).trim()) ||
    (w.type && String(w.type).trim()) ||
    (w.session_category && String(w.session_category).trim()) ||
    "easy";
  return raw.toLowerCase();
}

/** Monday = 0 … Sunday = 6 */
function mondayIndexFromDateStr(dateStr: string): number {
  const d = new Date(`${dateStr}T12:00:00`);
  const day = d.getDay();
  return day === 0 ? 6 : day - 1;
}

type PlannedEnrichRow = {
  volume: WeekVolumeRow;
  picked: Session;
  legacyTypeForRow: string;
  preserveType: boolean;
  keyFocus: string | null;
};

/** Re-label workouts using session library and sync planned km/min from the template band. */
export async function enrichTrainingPlanWorkoutsFromLibrary(planId: string): Promise<void> {
  const { data: plan, error: planErr } = await supabase
    .from("training_plan")
    .select("id, user_id, goal_race, race_type, philosophy, peak_weekly_km")
    .eq("id", planId)
    .maybeSingle();

  if (planErr || !plan) {
    console.warn("[enrichPlanSessions] plan not found", planErr?.message);
    return;
  }

  const userId = plan.user_id as string;

  const { data: profile } = await supabase
    .from("athlete_profile")
    .select(
      "goal_distance, injury_history, injury_history_text, recommended_philosophy, training_philosophy, current_weekly_km"
    )
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
  const currentCTL = r?.icu_ctl ?? r?.ctl ?? 55;

  const injuryHistory: string[] = Array.isArray(profile?.injury_history)
    ? (profile.injury_history as string[])
    : profile?.injury_history_text
      ? [profile.injury_history_text]
      : [];

  const planGoal =
    typeof plan.goal_race === "string" && plan.goal_race.trim()
      ? plan.goal_race.trim()
      : typeof plan.race_type === "string" && plan.race_type.trim()
        ? plan.race_type.trim()
        : null;
  const profileGoal =
    typeof profile?.goal_distance === "string" && profile.goal_distance.trim()
      ? profile.goal_distance.trim()
      : null;
  const goalRace = planGoal ?? profileGoal;
  const targetDistance = mapGoalRaceToTarget(goalRace);

  const philosophy =
    (typeof plan.philosophy === "string" && plan.philosophy.trim()
      ? plan.philosophy.trim()
      : undefined) ??
    (typeof profile?.recommended_philosophy === "string" && profile.recommended_philosophy.trim()
      ? profile.recommended_philosophy.trim()
      : undefined) ??
    (profile?.training_philosophy != null && String(profile.training_philosophy).trim()
      ? String(profile.training_philosophy).trim()
      : undefined);

  const since = format(subDays(new Date(), 28), "yyyy-MM-dd");
  const { data: activities } = await supabase
    .from("activity")
    .select("distance_km, type")
    .eq("user_id", userId)
    .gte("date", since);

  const runKm =
    activities
      ?.filter((a) => String(a.type ?? "").toLowerCase() === "run")
      .reduce((s, a) => s + (Number(a.distance_km) || 0), 0) ?? 0;
  const fromActivities = runKm > 5 ? runKm / 4 : null;
  const profileWeekly = profile?.current_weekly_km;
  const recentWeeklyKm =
    fromActivities ??
    (typeof profileWeekly === "number" && profileWeekly > 0 ? profileWeekly : null);

  const { data: workouts, error: wErr } = await supabase
    .from("training_plan_workout")
    .select("id, date, type, skeleton_session_type, session_category, phase, week_number, key_focus")
    .eq("plan_id", planId)
    .order("date", { ascending: true });

  if (wErr || !workouts?.length) {
    console.warn("[enrichPlanSessions] no workouts", wErr?.message);
    return;
  }

  let previousLibraryId: string | null = null;
  const planned: PlannedEnrichRow[] = [];

  for (let i = 0; i < workouts.length; i++) {
    const w = workouts[i] as WorkoutRow;
    if (!w.date) continue;

    const phase = (w.phase as TrainingPhase) ?? "base";
    const slotType = resolveWorkoutSlotType(w);
    if (slotType === "strength" || slotType === "mobility") {
      continue;
    }
    const dayType = workoutTypeToSelectorDayType(slotType);
    const dow = mondayIndexFromDateStr(w.date);
    const legacyTypeForRow =
      dayType === "rest"
        ? "rest"
        : dayType === "long"
          ? "long"
          : dayType === "quality"
            ? "tempo"
            : "easy";

    if (dayType === "rest") {
      await supabase
        .from("training_plan_workout")
        .update({
          type: "rest",
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
      variationIndex: i + (w.week_number ?? 1) * 13 + dow * 3,
      previousLibraryId,
      dayOfWeekIndex: dow,
    });

    if (!picked) {
      console.warn("[enrichPlanSessions] no library match", slotType, phase, targetDistance);
      continue;
    }

    previousLibraryId = picked.id;

    const vol = scaledPlannedVolumeFromSession(picked, {
      recentWeeklyKm,
      targetDistance,
    });

    const distMin = picked.distanceKmMin ?? 0;
    const distMax = picked.distanceKmMax ?? 200;

    planned.push({
      picked,
      legacyTypeForRow,
      preserveType: Boolean(w.type?.trim()),
      keyFocus: w.key_focus,
      volume: {
        id: w.id,
        weekKey: isoWeekKeyFromDateStr(w.date),
        dayType,
        distanceKm: vol.distanceKm,
        durationMin: vol.durationMin,
        distMin,
        distMax,
      },
    });
  }

  applyWeekLongVersusEasyCoherence(planned.map((p) => p.volume));

  for (const p of planned) {
    const { picked, legacyTypeForRow, preserveType, keyFocus, volume } = p;
    const updatePayload: Record<string, unknown> = {
      session_library_id: picked.id,
      name: picked.name,
      description: picked.description,
      key_focus: keyFocus ?? picked.purpose,
      distance_km: volume.distanceKm,
      duration_minutes: volume.durationMin,
    };
    if (!preserveType) updatePayload.type = legacyTypeForRow;
    await supabase.from("training_plan_workout").update(updatePayload).eq("id", volume.id);
  }

  if (import.meta.env.DEV) {
    console.log("[enrichPlanSessions] done for plan", planId, "workouts", workouts.length);
  }
}
