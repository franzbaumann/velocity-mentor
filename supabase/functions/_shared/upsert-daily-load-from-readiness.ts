import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  atlToScore,
  calculateTLS,
  hrvToScore,
  type OtherTraining,
} from "./calculate-tls.ts";

/**
 * Recompute TLS and upsert daily_load for one user/date from daily_readiness + existing daily_load.
 * Safe to call after wellness/readiness sync (service role).
 */
export async function upsertDailyLoadForUserDate(
  admin: SupabaseClient,
  userId: string,
  dateStr: string,
): Promise<{ error: Error | null }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return { error: new Error("invalid date") };
  }

  const { data: readinessRow } = await admin
    .from("daily_readiness")
    .select("*")
    .eq("user_id", userId)
    .eq("date", dateStr)
    .maybeSingle();

  const r = (readinessRow ?? {}) as Record<string, unknown>;
  const atl = (r.atl ?? r.icu_atl ?? null) as number | null;
  const hrv = (r.hrv ?? r.hrv_rmssd ?? null) as number | null;
  const sleepHours = (r.sleep_hours ?? (typeof r.sleep_secs === "number" ? (r.sleep_secs as number) / 3600 : null)) as
    | number
    | null;
  const sleepScore = (r.sleep_score ?? r.readiness ?? r.score ?? null) as number | null;
  const restingHr = (r.resting_hr ?? null) as number | null;

  const { data: loadRow } = await admin
    .from("daily_load")
    .select("*")
    .eq("user_id", userId)
    .eq("date", dateStr)
    .maybeSingle();

  const load = (loadRow ?? {}) as Record<string, unknown>;
  const otherTraining = (load.other_training ?? []) as OtherTraining[];
  const workStress = (load.work_stress ?? 1) as number;
  const lifeStress = (load.life_stress ?? 1) as number;
  const travel = (load.travel ?? false) as boolean;
  const mood = (load.mood ?? 3) as number;
  const energy = (load.energy ?? 3) as number;
  const legs = (load.legs ?? 3) as number;

  const runningATL = atlToScore(atl);
  const hrvScore = load.hrv_score != null ? Number(load.hrv_score) : hrvToScore(hrv);
  const sleepHoursVal = load.sleep_hours != null ? Number(load.sleep_hours) : (sleepHours ?? 7);
  const sleepScoreVal = load.sleep_score != null ? Number(load.sleep_score) : (sleepScore ?? 70);

  const { totalScore, cnsStatus, recoveryScore, breakdown } = calculateTLS({
    runningATL,
    hrvScore,
    sleepHours: sleepHoursVal,
    sleepScore: sleepScoreVal,
    otherTraining,
    workStress,
    lifeStress,
    travel,
    mood,
    energy,
    legs,
  });

  const upsertPayload: Record<string, unknown> = {
    user_id: userId,
    date: dateStr,
    running_atl: atl,
    hrv_score: load.hrv_score ?? hrvToScore(hrv),
    sleep_hours: load.sleep_hours ?? sleepHours,
    sleep_score: load.sleep_score ?? sleepScore,
    resting_hr: load.resting_hr ?? restingHr,
    other_training: otherTraining,
    work_stress: workStress,
    life_stress: lifeStress,
    travel,
    mood,
    energy,
    legs,
    total_load_score: totalScore,
    recovery_score: recoveryScore,
    cns_status: cnsStatus,
    breakdown,
  };

  if (load.life_note != null) upsertPayload.life_note = load.life_note;
  if (load.travel_note != null) upsertPayload.travel_note = load.travel_note;

  const { error } = await admin.from("daily_load").upsert(upsertPayload, { onConflict: "user_id,date" });
  return { error: error ? new Error(error.message) : null };
}

export async function syncDailyLoadForReadinessDates(
  admin: SupabaseClient,
  userId: string,
  dates: string[],
): Promise<void> {
  const uniq = [...new Set(dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d).slice(0, 10))))];
  for (const d of uniq) {
    const dateStr = d.slice(0, 10);
    const { error } = await upsertDailyLoadForUserDate(admin, userId, dateStr);
    if (error) console.error("[syncDailyLoadForReadinessDates]", userId, dateStr, error.message);
  }
}
