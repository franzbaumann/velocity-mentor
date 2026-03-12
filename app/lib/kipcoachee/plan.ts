import { supabase } from "../../shared/supabase";

function getNextMonday(): Date {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

const INTENSE_TYPES = new Set(["interval", "intervals", "tempo", "long", "race"]);

export async function savePlanFromChat(
  plan: Record<string, unknown>,
  isAdjustment: boolean,
  adjustmentReason?: string,
): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const aiWeeks = Array.isArray(plan.weeks) ? plan.weeks : [];

  if (isAdjustment) {
    return applyAdjustmentToExistingPlan(user.id, aiWeeks, plan, adjustmentReason);
  }

  const startDate = getNextMonday();
  const mergedWeeks = aiWeeks.map((wk: Record<string, unknown>) => ({
    week_number: (wk.week_number as number) ?? 1,
    phase: wk.phase as string | undefined,
    workouts: (wk.workouts as Record<string, unknown>[]) ?? [],
  }));

  const totalWeeks =
    (plan.total_weeks as number) ??
    Math.max(...mergedWeeks.map((w) => w.week_number), 1);

  await supabase
    .from("training_plan")
    .update({ is_active: false })
    .eq("user_id", user.id);

  const { data: planRow, error: planErr } = await supabase
    .from("training_plan")
    .insert({
      user_id: user.id,
      plan_name: plan.plan_name ?? plan.name ?? "Training Plan",
      philosophy: String(plan.philosophy ?? "80_20").split("|")[0],
      goal_race: plan.goal_race ?? null,
      goal_date: plan.goal_date ?? null,
      goal_time: plan.goal_time ?? null,
      start_date: startDate.toISOString().slice(0, 10),
      end_date: (() => {
        const end = new Date(startDate);
        end.setDate(end.getDate() + totalWeeks * 7 - 1);
        return end.toISOString().slice(0, 10);
      })(),
      total_weeks: totalWeeks,
      peak_weekly_km: plan.peak_weekly_km ?? null,
      is_active: true,
    })
    .select("id")
    .single();

  if (planErr || !planRow) return false;

  for (const wk of mergedWeeks) {
    const weekStart = new Date(startDate);
    weekStart.setDate(
      weekStart.getDate() + ((wk.week_number ?? 1) - 1) * 7,
    );
    for (const w of wk.workouts) {
      const dow = (w.day_of_week as number) ?? 1;
      const workoutDate = new Date(weekStart);
      workoutDate.setDate(workoutDate.getDate() + (dow - 1));
      await supabase.from("training_plan_workout").insert({
        user_id: user.id,
        plan_id: planRow.id,
        date: workoutDate.toISOString().slice(0, 10),
        week_number: wk.week_number ?? 1,
        phase: wk.phase ?? "base",
        day_of_week: dow,
        type: (w.type as string) ?? "easy",
        name: (w.name as string) ?? (w.description as string) ?? "",
        description: (w.description as string) ?? "",
        key_focus: (w.key_focus as string | null) ?? null,
        distance_km: (w.distance_km as number | null) ?? null,
        duration_minutes: (w.duration_minutes as number | null) ?? null,
        target_pace: (w.target_pace as string | null) ?? null,
        target_hr_zone: (w.target_hr_zone as number | null) ?? null,
        tss_estimate: (w.tss_estimate as number | null) ?? null,
        completed: (w.completed as boolean) ?? false,
      });
    }
  }

  return true;
}

async function applyAdjustmentToExistingPlan(
  userId: string,
  aiWeeks: Record<string, unknown>[],
  _plan: Record<string, unknown>,
  adjustmentReason?: string,
): Promise<boolean> {
  const { data: currentPlan } = await supabase
    .from("training_plan")
    .select("id, start_date")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!currentPlan) return false;

  const planStart = currentPlan.start_date
    ? new Date(currentPlan.start_date)
    : getNextMonday();
  const planStartMon = new Date(planStart);
  planStartMon.setDate(planStartMon.getDate() - ((planStartMon.getDay() + 6) % 7));

  const adjustedDates: string[] = [];
  const newWorkouts: Array<{
    date: string;
    week_number: number;
    phase: string;
    dow: number;
    w: Record<string, unknown>;
  }> = [];

  for (const wk of aiWeeks) {
    const wn = (wk.week_number as number) ?? 1;
    const weekStart = new Date(planStartMon);
    weekStart.setDate(weekStart.getDate() + (wn - 1) * 7);
    const workouts = (wk.workouts as Record<string, unknown>[]) ?? [];

    for (const w of workouts) {
      const dow = (w.day_of_week as number) ?? 1;
      const workoutDate = new Date(weekStart);
      workoutDate.setDate(workoutDate.getDate() + (dow - 1));
      const dateStr = workoutDate.toISOString().slice(0, 10);
      adjustedDates.push(dateStr);
      newWorkouts.push({
        date: dateStr,
        week_number: wn,
        phase: (wk.phase as string) ?? "recovery",
        dow,
        w,
      });
    }
  }

  if (adjustedDates.length === 0) return false;

  adjustedDates.sort();
  const lastAdjustedDate = adjustedDates[adjustedDates.length - 1];

  for (const dateStr of adjustedDates) {
    await supabase
      .from("training_plan_workout")
      .delete()
      .eq("plan_id", currentPlan.id)
      .eq("date", dateStr);
  }

  for (const { date, week_number, phase, dow, w } of newWorkouts) {
    await supabase.from("training_plan_workout").insert({
      user_id: userId,
      plan_id: currentPlan.id,
      date,
      week_number,
      phase,
      day_of_week: dow,
      type: (w.type as string) ?? "easy",
      name: (w.name as string) ?? (w.description as string) ?? "",
      description: (w.description as string) ?? "",
      key_focus: (w.key_focus as string | null) ?? null,
      distance_km: (w.distance_km as number | null) ?? null,
      duration_minutes: (w.duration_minutes as number | null) ?? null,
      target_pace: (w.target_pace as string | null) ?? null,
      target_hr_zone: (w.target_hr_zone as number | null) ?? null,
      tss_estimate: (w.tss_estimate as number | null) ?? null,
      completed: false,
      notes: adjustmentReason ? `[Adjustment] ${adjustmentReason}` : null,
    });
  }

  const { data: nextWorkouts } = await supabase
    .from("training_plan_workout")
    .select("id, date, type, name, description, distance_km, duration_minutes")
    .eq("plan_id", currentPlan.id)
    .gt("date", lastAdjustedDate)
    .order("date", { ascending: true })
    .limit(3);

  if (nextWorkouts?.length) {
    const first = nextWorkouts[0];
    const firstType = (first.type ?? "easy").toLowerCase();

    if (INTENSE_TYPES.has(firstType)) {
      const origDesc = first.description || first.name || firstType;
      const bridgeNote = adjustmentReason
        ? `[Transition] After adjustment: ${adjustmentReason}. Originally: ${origDesc}.`
        : `[Transition] Originally: ${origDesc}. Easing back after plan adjustment.`;
      await supabase
        .from("training_plan_workout")
        .update({
          type: "easy",
          name: "Return-to-training easy run",
          description: `Easy bridge run — originally: ${origDesc}. Easing back before resuming full intensity.`,
          distance_km: Math.min(first.distance_km ?? 6, 6),
          duration_minutes: Math.min(first.duration_minutes ?? 35, 40),
          target_pace: null,
          target_hr_zone: 2,
          tss_estimate: null,
          notes: bridgeNote,
        })
        .eq("id", first.id);

      if (nextWorkouts.length >= 2) {
        const second = nextWorkouts[1];
        const secondType = (second.type ?? "easy").toLowerCase();
        if (INTENSE_TYPES.has(secondType)) {
          const origDesc2 = second.description || second.name || secondType;
          await supabase
            .from("training_plan_workout")
            .update({
              type: "easy",
              name: "Gradual return easy run",
              description: `Building back — originally: ${origDesc2}. Second session back, keeping it easy.`,
              distance_km: Math.min(second.distance_km ?? 7, 8),
              duration_minutes: Math.min(second.duration_minutes ?? 40, 45),
              target_pace: null,
              target_hr_zone: 2,
              tss_estimate: null,
              notes: bridgeNote,
            })
            .eq("id", second.id);
        }
      }
    }
  }

  return true;
}

