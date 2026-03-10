import { addDays, addWeeks, format, nextMonday } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";

function parseRaceDate(val: string | string[] | undefined): Date | null {
  const s = typeof val === "string" ? val : Array.isArray(val) ? val[0] : "";
  if (!s || /no date|not sure|n\/a/i.test(s)) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function getFrequency(val: string | string[] | undefined): number {
  const s = typeof val === "string" ? val : Array.isArray(val) ? val[0] : "";
  if (/6–7|6-7/.test(s)) return 6;
  if (/5 days/.test(s)) return 5;
  if (/4 days/.test(s)) return 4;
  if (/3 days/.test(s)) return 3;
  if (/1–2|1-2/.test(s)) return 2;
  return 4;
}

function getLongRunDay(val: string | string[] | undefined): number {
  const s = typeof val === "string" ? val : Array.isArray(val) ? val[0] : "";
  if (/sunday/i.test(s)) return 0;
  if (/flexible/i.test(s)) return 6;
  return 6; // Saturday default
}

export function buildPlanFromIntake(intake: Record<string, string | string[]>) {
  const raceDate = parseRaceDate(intake.race_date);
  const raceType = (typeof intake.race_goal === "string" ? intake.race_goal : intake.race_goal?.[0]) || "General";
  const targetTime = typeof intake.target_time === "string" ? intake.target_time : undefined;
  const freq = getFrequency(intake.weekly_frequency);
  const longRunDay = getLongRunDay(intake.long_run_day);
  const availableDays: number[] = Array.isArray(intake.available_days)
    ? (intake.available_days as string[]).map((d) => ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].indexOf(d)).filter((n) => n >= 0)
    : [1, 3, 5, 6];

  const weeksTotal = raceDate
    ? Math.max(8, Math.min(16, Math.ceil((raceDate.getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000))))
    : 8;

  const planStart = nextMonday(new Date());
  const weeks: { week_number: number; start_date: string; sessions: { day_of_week: number; session_type: string; description: string; duration_min?: number; distance_km?: number; pace_target?: string }[] }[] = [];

  for (let w = 0; w < weeksTotal; w++) {
    const weekStart = addWeeks(planStart, w);
    const isRecovery = w > 0 && (w + 1) % 4 === 0;
    const sessions: { day_of_week: number; session_type: string; description: string; duration_min?: number; distance_km?: number; pace_target?: string }[] = [];

    const days = availableDays.length ? [...availableDays].sort((a, b) => a - b) : [1, 3, 5, 6];
    const take = isRecovery ? Math.max(2, Math.floor(freq * 0.7)) : Math.min(freq, days.length);
    const runDays = days.slice(0, Math.max(take, 2));

    runDays.forEach((dow, i) => {
      const isLong = dow === longRunDay || (i === runDays.length - 1 && dow >= 5);
      if (isLong) {
        const baseMin = 60 + w * 5;
        sessions.push({ day_of_week: dow, session_type: "long", description: `Long run ${Math.min(120, baseMin)} min`, duration_min: Math.min(120, baseMin), pace_target: "easy" });
      } else if (i === 1 && !isRecovery) {
        sessions.push({ day_of_week: dow, session_type: "tempo", description: "Tempo 25-30 min", duration_min: 28, pace_target: "moderate-hard" });
      } else {
        sessions.push({ day_of_week: dow, session_type: "easy", description: `Easy 35-45 min`, duration_min: 40, pace_target: "comfortable" });
      }
    });

    weeks.push({
      week_number: w + 1,
      start_date: format(weekStart, "yyyy-MM-dd"),
      sessions,
    });
  }

  return {
    race_date: raceDate ? format(raceDate, "yyyy-MM-dd") : null,
    race_type: raceType,
    target_time: targetTime ?? null,
    weeks,
  };
}

export async function savePlanToSupabase(
  supabase: SupabaseClient,
  userId: string,
  plan: ReturnType<typeof buildPlanFromIntake>
) {
  const { data: planRow, error: planErr } = await supabase
    .from("training_plan")
    .insert({
      user_id: userId,
      race_date: plan.race_date,
      race_type: plan.race_type,
      target_time: plan.target_time,
      weeks_total: plan.weeks.length,
    })
    .select("id")
    .single();
  if (planErr) throw planErr;
  const planId = planRow.id;

  for (const week of plan.weeks) {
    const weekStart = new Date(week.start_date);
    const { data: weekRow, error: weekErr } = await supabase
      .from("training_week")
      .insert({ plan_id: planId, week_number: week.week_number, start_date: week.start_date })
      .select("id")
      .single();
    if (weekErr) throw weekErr;
    const weekId = weekRow.id;

    for (let i = 0; i < week.sessions.length; i++) {
      const s = week.sessions[i];
      const offset = s.day_of_week === 0 ? 6 : s.day_of_week - 1;
      const scheduledDate = format(addDays(weekStart, offset), "yyyy-MM-dd");
      const { error: sessErr } = await supabase.from("training_session").insert({
        week_id: weekId,
        day_of_week: s.day_of_week,
        scheduled_date: scheduledDate,
        session_type: s.session_type,
        description: s.description,
        duration_min: s.duration_min ?? null,
        distance_km: s.distance_km ?? null,
        pace_target: s.pace_target ?? null,
        order_index: i,
      });
      if (sessErr) throw sessErr;
    }
  }
}
