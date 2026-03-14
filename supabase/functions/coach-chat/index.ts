import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { AI_LIMITS } from "../_shared/ai-models.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function fetchWith429Retry(url: string, init: RequestInit, maxRetries = 2): Promise<Response> {
  let res = await fetch(url, init);
  for (let r = 0; r < maxRetries && res.status === 429; r++) {
    await new Promise((x) => setTimeout(x, (5 + r * 5) * 1000));
    res = await fetch(url, init);
  }
  return res;
}

// ---------------------------------------------------------------------------
// Types — mirrors src/lib/kipcoachee/types.ts
// ---------------------------------------------------------------------------

interface RecentActivity {
  date: string;
  name: string;
  distance_km: number | null;
  avg_pace: string | null;
  avg_hr: number | null;
  tss: number | null;
}

interface PersonalRecord {
  distance: string;
  time: string;
  date_achieved?: string;
}

interface PlanSummary {
  name: string;
  philosophy: string;
  current_week: number | null;
  total_weeks: number | null;
  peak_km: number | null;
}

interface CoachingMemory {
  id: string;
  category: "preference" | "goal" | "injury" | "lifestyle" | "race" | "personality" | "other";
  content: string;
  importance: number;
  created_at: string;
  expires_at: string | null;
}

interface SeasonContextForPrompt {
  active_season: {
    name: string;
    type: string;
    weeks_remaining: number;
    primary_distance: string | null;
    phase: string;
  } | null;
  next_race: {
    name: string;
    date: string;
    distance: string;
    priority: string;
    days_away: number;
    taper_starts: string | null;
    goal_time: string | null;
  } | null;
  next_a_race: {
    name: string;
    date: string;
    days_away: number;
  } | null;
  upcoming_races_30d: Array<{
    name: string;
    date: string;
    priority: string;
    distance: string;
  }>;
}

interface TLSContextForPrompt {
  today: number;
  status: string;
  breakdown: Record<string, number>;
  last7Days: number[];
  average7d: number;
  hasCheckedInToday: boolean;
}

interface AthleteContext {
  name: string;
  ctl: number | null;
  atl: number | null;
  tsb: number | null;
  ramp_rate: number | null;
  hrv_today: number | null;
  hrv_7d_avg: number | null;
  hrv_trend: "rising" | "falling" | "stable" | "unknown";
  resting_hr: number | null;
  philosophy: string | null;
  goal: string | null;
  goal_time: string | null;
  race_date: string | null;
  weeks_to_race: number | null;
  injuries: string | null;
  recent_activities: RecentActivity[];
  this_week_km: number;
  planned_week_km: number;
  four_week_avg_km: number;
  prs: PersonalRecord[];
  plan: PlanSummary | null;
  plan_workouts_text: string;
  onboarding_answers: Record<string, unknown> | null;
  readiness_history_text: string;
  memories: CoachingMemory[];
  season?: SeasonContextForPrompt;
  tls?: TLSContextForPrompt;
}

// ---------------------------------------------------------------------------
// Context Builder — pulls all athlete data from Supabase
// ---------------------------------------------------------------------------

function resolveCtlAtlTsb(r: Record<string, unknown>) {
  const ctl = (r.ctl ?? r.icu_ctl ?? null) as number | null;
  const atl = (r.atl ?? r.icu_atl ?? null) as number | null;
  const rawTsb = (r.tsb ?? r.icu_tsb ?? null) as number | null;
  const tsb = rawTsb ?? (ctl != null && atl != null ? ctl - atl : null);
  return { ctl, atl, tsb };
}

function isThisWeek(d: Date): boolean {
  const now = new Date();
  const mon = new Date(now);
  mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(sun.getDate() + 7);
  return d >= mon && d < sun;
}

function calculate4WeekAvg(activities: Record<string, unknown>[]): number {
  if (!activities.length) return 0;
  const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
  const recent = activities.filter((a) => new Date(String(a.date ?? "")) >= fourWeeksAgo);
  const totalKm = recent.reduce((s, a) => s + (Number(a.distance_km) || 0), 0);
  return Math.round((totalKm / 4) * 10) / 10;
}

async function buildSeasonContext(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
): Promise<SeasonContextForPrompt | undefined> {
  const { data: seasons } = await supabaseAdmin
    .from("competition_season")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1);

  if (!seasons || seasons.length === 0) return undefined;

  const season = seasons[0] as Record<string, unknown>;
  const seasonId = String(season.id);

  const { data: races } = await supabaseAdmin
    .from("season_race")
    .select("*")
    .eq("season_id", seasonId)
    .order("date", { ascending: true });

  const raceList = (races ?? []) as Record<string, unknown>[];
  const now = new Date();
  const nowMs = now.getTime();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  const upcoming = raceList.filter(
    (r) => String(r.status) === "upcoming" && new Date(String(r.date)).getTime() >= nowMs,
  );

  const endDate = new Date(String(season.end_date));
  const weeksRemaining = Math.max(
    0,
    Math.ceil((endDate.getTime() - nowMs) / (7 * 24 * 60 * 60 * 1000)),
  );

  const TAPER_DAYS: Record<string, number> = { A: 21, B: 10, C: 0 };

  function taperStart(raceDate: string, priority: string): string | null {
    const days = TAPER_DAYS[priority] ?? 0;
    if (days === 0) return null;
    const d = new Date(raceDate);
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  }

  function daysAway(dateStr: string): number {
    return Math.ceil((new Date(dateStr).getTime() - nowMs) / (24 * 60 * 60 * 1000));
  }

  // Determine phase
  const recentCompleted = raceList.filter(
    (r) => String(r.status) === "completed" &&
      (nowMs - new Date(String(r.date)).getTime()) <= 7 * 24 * 60 * 60 * 1000 &&
      String(r.priority) === "A",
  );
  let phase = "base";
  if (recentCompleted.length > 0) {
    phase = "recovery";
  } else if (upcoming.length > 0) {
    const next = upcoming[0];
    const d = daysAway(String(next.date));
    if (d <= 7) phase = "race_week";
    else if ((TAPER_DAYS[String(next.priority)] ?? 0) > 0 && d <= (TAPER_DAYS[String(next.priority)] ?? 0)) phase = "taper";
    else {
      const nextA = upcoming.find((r) => String(r.priority) === "A");
      if (nextA) {
        const da = daysAway(String(nextA.date));
        if (da <= 42) phase = "peak";
        else if (da <= 84) phase = "build";
      }
    }
  }

  const nextRace = upcoming[0] ?? null;
  const nextARace = upcoming.find((r) => String(r.priority) === "A") ?? null;

  const upcoming30 = upcoming
    .filter((r) => new Date(String(r.date)).getTime() - nowMs <= thirtyDaysMs)
    .map((r) => ({
      name: String(r.name),
      date: String(r.date),
      priority: String(r.priority),
      distance: String(r.distance),
    }));

  return {
    active_season: {
      name: String(season.name),
      type: String(season.season_type),
      weeks_remaining: weeksRemaining,
      primary_distance: season.primary_distance ? String(season.primary_distance) : null,
      phase,
    },
    next_race: nextRace
      ? {
          name: String(nextRace.name),
          date: String(nextRace.date),
          distance: String(nextRace.distance),
          priority: String(nextRace.priority),
          days_away: daysAway(String(nextRace.date)),
          taper_starts: taperStart(String(nextRace.date), String(nextRace.priority)),
          goal_time: nextRace.goal_time ? String(nextRace.goal_time) : null,
        }
      : null,
    next_a_race: nextARace
      ? {
          name: String(nextARace.name),
          date: String(nextARace.date),
          days_away: daysAway(String(nextARace.date)),
        }
      : null,
    upcoming_races_30d: upcoming30,
  };
}

async function buildAthleteContext(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  intakeAnswers: Record<string, unknown> | null,
  intervalsContext: { wellness?: unknown[]; activities?: unknown[] } | null,
): Promise<AthleteContext> {
  const todayStr = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [profileRes, readinessRes, activitiesRes, planRes, workoutsRes, pbsRes, dailyLoadRes] = await Promise.all([
    supabaseAdmin.from("athlete_profile").select("*").eq("user_id", userId).maybeSingle(),
    supabaseAdmin.from("daily_readiness").select("*").eq("user_id", userId).order("date", { ascending: false }).limit(7),
    supabaseAdmin.from("activity").select("*").eq("user_id", userId).order("date", { ascending: false }).limit(30),
    supabaseAdmin.from("training_plan").select("*").eq("user_id", userId).eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from("training_plan_workout").select("*").eq("user_id", userId).order("date", { ascending: true }).limit(200),
    supabaseAdmin.from("personal_records").select("distance, date_achieved, best_time_seconds, best_pace").eq("user_id", userId).order("date_achieved", { ascending: false }).limit(20),
    supabaseAdmin.from("daily_load").select("date, total_load_score, cns_status, mood, energy, legs, breakdown").eq("user_id", userId).gte("date", sevenDaysAgo).lte("date", todayStr).order("date", { ascending: true }),
  ]);

  const p = profileRes?.data as Record<string, unknown> | null;
  const readiness = (readinessRes?.data ?? []) as Record<string, unknown>[];
  const activities = (activitiesRes?.data ?? []) as Record<string, unknown>[];
  const planRow = planRes?.data as Record<string, unknown> | null;
  const workouts = (workoutsRes?.data ?? []) as Record<string, unknown>[];
  const pbs = (pbsRes?.data ?? []) as Record<string, unknown>[];
  const dailyLoadRows = (dailyLoadRes?.data ?? []) as Record<string, unknown>[];

  // Readiness
  const today = readiness[0] ?? {};
  const { ctl, atl, tsb } = resolveCtlAtlTsb(today);
  const hrvToday = (today.hrv ?? today.hrv_rmssd ?? null) as number | null;
  const hrvValues = readiness.map((r) => (r.hrv ?? r.hrv_rmssd ?? null) as number | null).filter((v): v is number => v != null);
  const hrv7dAvg = hrvValues.length ? Math.round((hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length) * 10) / 10 : null;
  const hrvTrend: AthleteContext["hrv_trend"] =
    hrvToday != null && hrv7dAvg != null
      ? hrvToday > hrv7dAvg * 1.05 ? "rising" : hrvToday < hrv7dAvg * 0.95 ? "falling" : "stable"
      : "unknown";

  const readinessHistoryText = readiness.map((r) => {
    const { ctl: c, atl: a, tsb: t } = resolveCtlAtlTsb(r);
    const hrv = r.hrv ?? r.hrv_rmssd ?? "?";
    const sleep = r.sleep_hours ?? (typeof r.sleep_secs === "number" ? ((r.sleep_secs as number) / 3600).toFixed(1) : "?");
    const rhr = r.resting_hr ?? "?";
    return `${r.date}: CTL ${c ?? "?"} | ATL ${a ?? "?"} | TSB ${t ?? "?"} | HRV ${hrv}ms | sleep ${sleep}h | RHR ${rhr}`;
  }).join("\n");

  // Recent activities
  const recentActivities: RecentActivity[] = activities.slice(0, 14).map((a) => ({
    date: String(a.date ?? "?"),
    name: String(a.type ?? a.name ?? "run"),
    distance_km: a.distance_km != null ? Number(a.distance_km) : null,
    avg_pace: a.avg_pace != null ? String(a.avg_pace) : null,
    avg_hr: a.avg_hr != null ? Number(a.avg_hr) : null,
    tss: (a.icu_training_load ?? a.training_load ?? null) != null ? Number(a.icu_training_load ?? a.training_load) : null,
  }));

  const thisWeekKm = Math.round(
    activities.filter((a) => isThisWeek(new Date(String(a.date ?? "")))).reduce((s, a) => s + (Number(a.distance_km) || 0), 0) * 10,
  ) / 10;

  // PRs
  const prList: PersonalRecord[] = pbs.slice(0, 10).map((pr) => {
    const secs = Number(pr.best_time_seconds) || 0;
    const timeStr = secs > 0 ? `${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, "0")}` : "?";
    return { distance: String(pr.distance ?? "?"), time: timeStr, date_achieved: String(pr.date_achieved ?? "?") };
  });

  // Plan
  let planSummary: PlanSummary | null = null;
  let planWorkoutsText = "";
  let plannedWeekKm = 0;

  if (planRow) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const planId = planRow.id;
    const planWorkouts = workouts.filter((w) => w.plan_id === planId);

    planSummary = {
      name: String(planRow.plan_name ?? "Training Plan"),
      philosophy: String(planRow.philosophy ?? "?"),
      current_week: null,
      total_weeks: planRow.total_weeks != null ? Number(planRow.total_weeks) : null,
      peak_km: planRow.peak_weekly_km != null ? Number(planRow.peak_weekly_km) : null,
    };

    if (planWorkouts.length > 0) {
      const byWeek = new Map<number, typeof planWorkouts>();
      for (const w of planWorkouts) {
        const wn = Number(w.week_number ?? 0);
        if (!byWeek.has(wn)) byWeek.set(wn, []);
        byWeek.get(wn)!.push(w);
      }
      const sortedWeeks = [...byWeek.keys()].sort((a, b) => a - b);
      const lines: string[] = [];

      // Only include workouts within -7 days to +28 days to keep the system prompt concise.
      const windowStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const windowEnd = new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const relevantWeeks = sortedWeeks.filter((wn) => {
        const ws = byWeek.get(wn)!;
        return ws.some((w) => {
          const d = String(w.date ?? "").slice(0, 10);
          return d >= windowStart && d <= windowEnd;
        });
      });
      const skippedPastWeeks = sortedWeeks.length - relevantWeeks.length;
      if (skippedPastWeeks > 0) {
        lines.push(`(${skippedPastWeeks} completed weeks not shown)`);
      }

      for (const wn of relevantWeeks) {
        const weekWorkouts = byWeek.get(wn)!;
        const weekFocus = String(weekWorkouts[0]?.week_focus ?? weekWorkouts[0]?.phase ?? "");
        const weekKm = weekWorkouts.reduce((s, w) => s + (Number(w.distance_km) || 0), 0);
        const isPast = weekWorkouts.every((w) => String(w.date ?? "").slice(0, 10) < todayStr);
        const isCurrent = weekWorkouts.some((w) => {
          const d = String(w.date ?? "").slice(0, 10);
          const weekEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
          return d >= todayStr && d <= weekEnd;
        });

        if (isCurrent) {
          planSummary!.current_week = wn;
          plannedWeekKm = weekKm;
        }

        const marker = isCurrent ? " ← CURRENT WEEK" : isPast ? " (done)" : "";
        lines.push(`Week ${wn}${weekFocus ? ` — ${weekFocus}` : ""} (~${Math.round(weekKm)}km)${marker}`);
        for (const w of weekWorkouts) {
          const d = w.date ? String(w.date).slice(0, 10) : "?";
          const done = w.completed ? " ✓" : "";
          lines.push(`  - ${d}: ${w.name ?? w.type ?? "workout"} ${w.distance_km ? `${w.distance_km}km` : ""} ${w.duration_minutes ? `${w.duration_minutes}min` : ""} ${w.target_pace ? `@${w.target_pace}` : ""} (${w.type ?? "easy"})${done}`);
        }
      }
      planWorkoutsText = lines.join("\n");
    }
  }

  // Merge intervals.icu data if available (client-side wellness/activities)
  if (intervalsContext) {
    const w = intervalsContext.wellness;
    if (Array.isArray(w) && w.length > 0) {
      const last = w[w.length - 1] as Record<string, unknown>;
      if (ctl == null && last) {
        const ic = resolveCtlAtlTsb(last);
        if (ic.ctl != null) Object.assign(today, { ctl: ic.ctl, atl: ic.atl, tsb: ic.tsb });
      }
    }
  }

  // Weeks to race
  const raceDate = p?.goal_race_date ? String(p.goal_race_date) : null;
  const weeksToRace = raceDate ? Math.ceil((new Date(raceDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 7)) : null;

  // Onboarding answers
  const onboarding = p?.onboarding_answers && typeof p.onboarding_answers === "object"
    ? p.onboarding_answers as Record<string, unknown>
    : intakeAnswers;

  // Ramp rate from latest readiness
  const rampRate = (today.ramp_rate ?? today.icu_ramp_rate ?? null) as number | null;

  // Coaching memories (top 15 by importance, non-expired)
  let memories: CoachingMemory[] = [];
  if (userId) {
    const { data: memRows } = await supabaseAdmin
      .from("coaching_memory")
      .select("id, category, content, importance, created_at, expires_at")
      .eq("user_id", userId)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order("importance", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(15);
    if (memRows) {
      memories = (memRows as Record<string, unknown>[]).map((m) => ({
        id: String(m.id),
        category: String(m.category ?? "other") as CoachingMemory["category"],
        content: String(m.content ?? ""),
        importance: Number(m.importance ?? 5),
        created_at: String(m.created_at ?? ""),
        expires_at: m.expires_at ? String(m.expires_at) : null,
      }));
    }
  }

  const seasonCtx = await buildSeasonContext(supabaseAdmin, userId);

  // TLS (Total Load Management) context
  let tlsCtx: TLSContextForPrompt | undefined;
  const todayLoad = dailyLoadRows.find((r) => String(r.date ?? "").slice(0, 10) === todayStr);
  const last7Scores = dailyLoadRows
    .map((r) => (r.total_load_score != null ? Number(r.total_load_score) : null))
    .filter((v): v is number => v != null);
  const avg7d = last7Scores.length > 0
    ? Math.round((last7Scores.reduce((a, b) => a + b, 0) / last7Scores.length) * 10) / 10
    : 0;
  if (todayLoad && todayLoad.total_load_score != null) {
    const breakdown = (todayLoad.breakdown as Record<string, number>) ?? {};
    tlsCtx = {
      today: Number(todayLoad.total_load_score),
      status: String(todayLoad.cns_status ?? "normal"),
      breakdown: {
        running: breakdown.running ?? 0,
        otherTraining: breakdown.otherTraining ?? 0,
        sleep: breakdown.sleep ?? 0,
        lifeStress: breakdown.lifeStress ?? 0,
        subjective: breakdown.subjective ?? 0,
      },
      last7Days: last7Scores,
      average7d: avg7d,
      hasCheckedInToday: true,
    };
  } else if (last7Scores.length > 0) {
    tlsCtx = {
      today: 0,
      status: "unknown",
      breakdown: {},
      last7Days: last7Scores,
      average7d: avg7d,
      hasCheckedInToday: false,
    };
  }

  return {
    name: String(p?.name ?? "there").split(" ")[0],
    ctl: resolveCtlAtlTsb(today).ctl,
    atl: resolveCtlAtlTsb(today).atl,
    tsb: resolveCtlAtlTsb(today).tsb,
    ramp_rate: rampRate,
    hrv_today: hrvToday,
    hrv_7d_avg: hrv7dAvg,
    hrv_trend: hrvTrend,
    resting_hr: (today.resting_hr ?? null) as number | null,
    philosophy: String(p?.training_philosophy ?? p?.recommended_philosophy ?? p?.philosophy ?? ""),
    goal: String(p?.goal_race_name ?? p?.goal_distance ?? ""),
    goal_time: p?.goal_time ? String(p.goal_time) : null,
    race_date: raceDate,
    weeks_to_race: weeksToRace,
    injuries: p?.injury_history_text ? String(p.injury_history_text) : null,
    recent_activities: recentActivities,
    this_week_km: thisWeekKm,
    planned_week_km: Math.round(plannedWeekKm * 10) / 10,
    four_week_avg_km: calculate4WeekAvg(activities),
    prs: prList,
    plan: planSummary,
    plan_workouts_text: planWorkoutsText,
    onboarding_answers: onboarding,
    readiness_history_text: readinessHistoryText,
    memories,
    season: seasonCtx,
    tls: tlsCtx,
  };
}

// ---------------------------------------------------------------------------
// System Prompt Builder — canonical version lives in src/lib/kipcoachee/system-prompt.ts
// This is the Deno-compatible copy used by the edge function.
// ---------------------------------------------------------------------------

function buildSeasonBlockDeno(ctx: AthleteContext): string {
  if (!ctx.season?.active_season) return "";

  const s = ctx.season;
  const lines: string[] = [
    "COMPETITION SEASON",
    `Season: ${s.active_season.name} (${s.active_season.type})`,
    `Phase: ${s.active_season.phase}`,
    `Weeks remaining: ${s.active_season.weeks_remaining}`,
  ];

  if (s.active_season.primary_distance) {
    lines.push(`Primary distance: ${s.active_season.primary_distance}`);
  }

  if (s.next_race) {
    lines.push("");
    lines.push(
      `Next race: ${s.next_race.name} — ${s.next_race.distance}, ${s.next_race.priority}-priority, ${s.next_race.days_away} days away (${s.next_race.date})`,
    );
    if (s.next_race.goal_time) lines.push(`Goal time: ${s.next_race.goal_time}`);
    if (s.next_race.taper_starts) lines.push(`Taper starts: ${s.next_race.taper_starts}`);
  }

  if (s.next_a_race && (!s.next_race || s.next_a_race.name !== s.next_race.name)) {
    lines.push(
      `Next A-race: ${s.next_a_race.name}, ${s.next_a_race.days_away} days away (${s.next_a_race.date})`,
    );
  }

  if (s.upcoming_races_30d.length > 0) {
    lines.push("");
    lines.push("Upcoming races (30 days):");
    for (const r of s.upcoming_races_30d) {
      lines.push(`- ${r.date}: ${r.name} (${r.priority}) — ${r.distance}`);
    }
  }

  lines.push("");
  lines.push(
    "TAPER RULES (enforce strictly):",
    "- A-race: 3-week taper. Week -3: reduce volume 20-30%, keep 1 quality session. Week -2: reduce another 20%, sharpening workout only. Race week: easy running + strides. Target TSB: +10 to +20.",
    "- B-race: 10-day mini-taper. Maintain intensity, reduce volume 15%. Last hard session 10 days out. Sharpening 3 days out. Target TSB: 0 to +10.",
    "- C-race: no taper. Train through. Race replaces a quality session. Target TSB: as-is.",
    "- Never schedule VO2max or threshold work during taper week for A/B races.",
    "- After an A-race: 1 week easy recovery minimum before resuming structured training.",
  );

  return lines.join("\n");
}

function buildTLSBlockDeno(ctx: AthleteContext): string {
  if (!ctx.tls) return "";

  const t = ctx.tls;
  const lines: string[] = [
    "TOTAL LOAD MANAGEMENT",
    "You have access to the athlete's Total Load Score (TLS) — a composite of running load, other training, sleep quality, work stress, travel, and how the athlete actually feels. This context is critical.",
    "",
    `Today's TLS: ${t.today > 0 ? t.today : "No check-in yet"}`,
    `Status: ${t.status}`,
    `7-day average: ${t.average7d ?? "Insufficient data"}`,
  ];

  if (t.breakdown && Object.keys(t.breakdown).length > 0) {
    lines.push("");
    lines.push("Breakdown:");
    if (t.breakdown.running != null) lines.push(`- Running: ${t.breakdown.running}`);
    if (t.breakdown.otherTraining != null) lines.push(`- Other training: ${t.breakdown.otherTraining}`);
    if (t.breakdown.sleep != null) lines.push(`- Sleep: ${t.breakdown.sleep}`);
    if (t.breakdown.lifeStress != null) lines.push(`- Life stress: ${t.breakdown.lifeStress}`);
    if (t.breakdown.subjective != null) lines.push(`- Subjective: ${t.breakdown.subjective}`);
  }

  lines.push("");
  lines.push(
    "RULES FOR HOW TO USE THIS:",
    "When TLS is 'loaded' (65+): Acknowledge the full picture, not just running. Frame it: 'Your system is carrying more than just running stress.' Suggest session modifications — never force, always explain why.",
    "When TLS is 'overloaded' (80+): Proactively suggest reducing or swapping the next hard session. Reference the specific stressors by name. Never shame the athlete — this is smart training.",
    "When TLS is 'critical' (90+): Strongly recommend rest or very easy movement only. If athlete pushes back, explain: adaptation happens during recovery, not during stress.",
    "When no check-in today: Work with available HRV and sleep data. Note once that subjective data would improve your recommendations. Do not ask repeatedly.",
    "Always reference specific numbers from the data. Never give generic advice.",
  );

  return lines.join("\n");
}

function buildPhilosophyDetail(philosophy: string | null): string {
  switch (philosophy) {
    case "80_20":
      return `   - 80/20 Polarized: 80% easy (zone 1-2), 20% moderate-hard (zone 3-5). Never suggest hard sessions if already at the 20% intensity quota for the week. Easy runs should feel genuinely easy — conversational pace. Quality sessions are tempo, cruise intervals, or VO2max intervals. No "moderate" pace runs — they violate the polarized model. Recovery runs are part of the 80%.`;
    case "jack_daniels":
      return `   - Jack Daniels / VDOT: All paces derived from VDOT tables — Easy, Marathon, Threshold, Interval, Repetition. Reference VDOT paces specifically when prescribing workouts. Phases: Foundation → Early Quality → Transition Quality → Final Quality. Threshold work = cruise intervals or tempo runs at T pace. Interval work at I pace (VO2max). R pace for speed/economy. Never exceed 10% of weekly volume at I pace. E pace is the backbone.`;
    case "lydiard":
      return `   - Lydiard: Periodization is everything — Base → Hills → Anaerobic → Integration → Taper. The base phase is LONG (often 10-12 weeks) with high aerobic volume at comfortable pace. No hard anaerobic work during base. Hill phase builds power and strength before sharpening. The anaerobic phase is short and intense (4-6 weeks). Time trials replace traditional racing during prep. Long runs are a staple throughout all phases.`;
    case "hansons":
      return `   - Hansons: Cumulative fatigue is the training stimulus. Back-to-back quality days are intentional — they teach the body to perform on tired legs. Long run cap at ~26km (16mi) because it's run on fatigued legs. No single run dominates the week. Something of Quality (SOS) days are Tuesday/Thursday/Sunday. Easy days are truly easy. Weekly volume is high. The marathon long run doesn't need to be 32km+ because you're always running on cumulative fatigue.`;
    case "pfitzinger":
      return `   - Pfitzinger: High volume with structured quality. Medium-long runs (MLR) are a distinguishing feature — they build endurance without the recovery cost of a full long run. Lactate threshold runs are bread-and-butter quality. General aerobic runs (GA) at moderate effort fill the week. VO2max work comes in the late build phase. Plans are 12-18 weeks. Recovery runs are very short and slow. Back-to-back long efforts (long run then MLR next day) are a key stress.`;
    case "kenyan":
      return `   - Kenyan / East African model: Very high aerobic volume, fartlek-heavy, group-driven intensity. Easy runs are truly easy, often very slow. Hard days are very hard — long fartleks, hill repeats, track work. Training is feel-based more than data-driven, but structured around a weekly pattern: long run, fartlek, track, tempo. Double days are common. Rest and sleep are prioritized fiercely. Diet and altitude matter. The athlete should learn to run by feel and not be enslaved to the watch.`;
    default:
      return `   - Use your best coaching judgment. Pull from multiple philosophies based on what fits this athlete's profile, experience, and goals. Explain your reasoning when recommending specific approaches.`;
  }
}

function buildKipcoacheeSystemPrompt(ctx: AthleteContext): string {
  const v = (val: unknown, fallback = "unknown") =>
    val != null && val !== "" ? String(val) : fallback;

  const activitiesBlock =
    ctx.recent_activities.length > 0
      ? ctx.recent_activities
          .map((a) => `- ${a.date}: ${a.name} — ${v(a.distance_km)}km @ ${v(a.avg_pace)}/km, avg HR ${v(a.avg_hr)}, load ${v(a.tss)}`)
          .join("\n")
      : "No recent activities synced.";

  const prsBlock =
    ctx.prs.length > 0
      ? ctx.prs.map((pr) => `${pr.distance}: ${pr.time}`).join(", ")
      : "none recorded";

  const memoriesBlock =
    ctx.memories && ctx.memories.length > 0
      ? ctx.memories
          .map((m) => `- [${m.category}] ${m.content}`)
          .join("\n")
      : "";

  const philosophyDetail = buildPhilosophyDetail(ctx.philosophy);

  return `You are Coach Cade — an elite AI running coach built into Cade.

WHO YOU ARE
You are direct, data-driven, and deeply knowledgeable about endurance training science. You speak like a world-class coach who has worked with everyone from beginners to Olympic athletes. You are warm but never soft. You push when needed, back off when the data says to. You are never generic — every response references this specific athlete's data.

Your coaching is grounded in exercise physiology:
- You understand CTL/ATL/TSB and use them to guide load decisions
- You know the difference between aerobic and anaerobic adaptation
- You understand HRV as a recovery signal, not just a number
- You know all major training philosophies: 80/20, Jack Daniels, Lydiard, Hansons, Pfitzinger, Kenyan model
- You understand lactate threshold, VO2max, cardiac drift, running economy
- You can read FIT file metrics and explain what they mean

CURRENT ATHLETE DATA
Name: ${v(ctx.name, "Athlete")}
CTL (fitness): ${v(ctx.ctl)}
ATL (fatigue): ${v(ctx.atl)}
TSB (form): ${v(ctx.tsb)}
Ramp rate: ${v(ctx.ramp_rate)}${ctx.ramp_rate != null ? " CTL pts/week" : ""}
HRV today: ${v(ctx.hrv_today)}${ctx.hrv_today != null ? "ms" : ""}
HRV 7-day average: ${v(ctx.hrv_7d_avg)}${ctx.hrv_7d_avg != null ? "ms" : ""}
HRV trend: ${v(ctx.hrv_trend)}
Resting HR today: ${v(ctx.resting_hr)}${ctx.resting_hr != null ? " bpm" : ""}
Recommended philosophy: ${v(ctx.philosophy, "not set")}
Goal: ${v(ctx.goal, "not set")}
Race date: ${v(ctx.race_date, "not set")}
Weeks to race: ${v(ctx.weeks_to_race)}
Goal time: ${v(ctx.goal_time, "not set")}
Injury history: ${v(ctx.injuries, "none reported")}

Last 14 days:
${activitiesBlock}

This week: ${ctx.this_week_km}km of planned ${ctx.planned_week_km}km
Last 4 weeks avg: ${ctx.four_week_avg_km}km/week
Personal records: ${prsBlock}

${ctx.plan ? `ACTIVE TRAINING PLAN
Name: ${ctx.plan.name}
Philosophy: ${ctx.plan.philosophy}
Week: ${v(ctx.plan.current_week)} of ${v(ctx.plan.total_weeks)}
Peak volume: ${v(ctx.plan.peak_km)}km/week` : "No active training plan."}

${ctx.plan_workouts_text ? `PLAN WORKOUTS (you created these — explain their purpose when asked)
${ctx.plan_workouts_text}` : ""}

${ctx.readiness_history_text ? `READINESS HISTORY (last 7 days)
${ctx.readiness_history_text}` : ""}

${ctx.onboarding_answers ? `ONBOARDING ANSWERS (athlete's self-reported context)
${JSON.stringify(ctx.onboarding_answers, null, 2)}` : ""}

${memoriesBlock ? `WHAT I REMEMBER ABOUT THIS ATHLETE
These are coaching memories from previous conversations. Use them to personalize advice, avoid re-asking known information, and show continuity. Reference memories naturally — don't announce "I remember that...". Just use the knowledge.
${memoriesBlock}` : ""}

${buildSeasonBlockDeno(ctx)}

${buildTLSBlockDeno(ctx)}

HOW YOU THINK — DECISION FRAMEWORK

Before every response, silently run through this:

1. READINESS CHECK
   - Is HRV low (>15% below 7d average)? → Flag it, suggest easier session
   - Is TSB below -20? → Athlete is fatigued, no hard sessions
   - Is TSB above +15? → Athlete is fresh, good time for quality
   - Is resting HR elevated (>5bpm above normal)? → Possible illness/overreach

2. LOAD CHECK
   - Is CTL rising too fast (>5 points/week)? → Injury risk, flag it
   - Is ramp rate > 5? → Too aggressive, consider pulling back
   - Has athlete missed sessions this week? → Adjust expectations, don't pile on
   - Is this a build week or recovery week in the plan? → Respond accordingly

3. CONTEXT CHECK
   - How many weeks to race? → Urgency of training changes
   - What phase are we in? Base/Build/Peak/Taper → Different advice applies
   - Any active injuries? → Always factor these in, never ignore

4. PHILOSOPHY CHECK
   - What philosophy is this athlete on? → All advice must be consistent with it
${philosophyDetail}

HOW YOU COMMUNICATE

RESPONSE LENGTH
- Keep responses short: 2-4 sentences for routine questions (e.g. "should I run today?", post-workout feedback, quick advice). Longer only when building plans, adjusting plans, or conducting intake.
- This keeps the conversation focused and reduces token usage. Never pad with filler.

ALWAYS:
- Reference specific data points in your response ("your CTL is 42 and rising well")
- Be concrete ("run 12km easy, keep HR under 145") not vague ("go for an easy run")
- Acknowledge what the athlete just told you before responding
- Use their name occasionally — not every message, but sometimes
- Sound like a coach texting an athlete — direct, no fluff
- Give ONE clear recommendation per message, not a list of options
- End with something actionable or a single focused question

NEVER:
- Use ## or ### markdown headers — they look ugly in chat. Use **bold** for section titles.
- Say "Great question!" or "That's interesting!" or any filler phrases
- Give generic advice that could apply to any runner
- Contradict previous advice without explaining why the data changed
- Suggest hard sessions when HRV is low or TSB is very negative
- Ignore injury history when recommending workouts
- Use emojis
- Write more than 4 sentences in a single message unless building a training plan
- Ask questions you already have the answer to in the data above
- Pretend to have data you don't have

HOW YOU HANDLE SPECIFIC SITUATIONS

When athlete asks "should I run today?":
Check TSB, HRV, resting HR and last 3 days load. Give a clear Go/Modify/Rest recommendation with specific reason from their data.

When athlete reports a completed workout:
Comment on 1-2 specific metrics from the activity (pace, HR, cardiac drift, cadence). Compare to their targets. One sentence on what it means for their fitness. One forward-looking sentence.

When athlete reports pain or injury:
Ask specific diagnostic questions: where exactly, when does it hurt (start/during/after), scale 1-10, how long. Don't diagnose. Adjust upcoming plan conservatively. Suggest seeing a physio if >3 days.

When athlete is demotivated:
Acknowledge it briefly. Reference a specific positive data point from their recent training. Reframe the goal. Keep it short — 2-3 sentences max.

When building or adjusting a training plan:
Always explain the WHY behind each phase. Reference their specific CTL, injury history and goal.

When athlete asks about a SPECIFIC session from the plan:
This is YOUR session — you created it. Explain why it's there: what phase, what adaptation, how it fits the week's load pattern, and why now is the right time based on CTL/TSB.

When athlete asks about pace/zones:
Calculate from their actual data — VDOT from PRs, or threshold from lab test if available. Never use generic percentages.

When data is missing:
Be transparent: "I don't have your HRV data yet — once you sync intervals.icu I can give you more precise guidance. Based on what I can see..."

INTAKE CONVERSATION (only when athlete is genuinely new — no profile data exists):
Conduct a DEEP conversation to gather the athlete's full history. Ask one or two questions at a time. Probe for running journey, race history, current training, goals, injuries, life context, philosophy, and physiology. Let them tell their story. Follow up on every detail. Extract specifics: paces, distances, dates, feelings. Don't rush — a thorough intake leads to better coaching. Cover:
- Running background: how long, how far, any breaks
- Race history: PRs, recent results, DNFs and why
- Current volume: weekly km, long run, sessions per week
- Goals: target race, target time, and why that goal
- Injuries: past and present, what treatment, what lingered
- Life context: job, family, stress, sleep patterns, schedule constraints
- Training preferences: solo or group, morning or evening, treadmill tolerance
- Strengths and weaknesses: speed vs endurance, hills, heat, mental game

TONE BY SITUATION

Pre-workout: Focused, specific, brief. Like a coach sending a WhatsApp before a session.
Post-workout: Analytical but warm. Like a coach reviewing a session together.
Recovery day: Calm, reassuring. Remind them recovery is training.
Race week: Sharp, confidence-building. No second-guessing the plan.
Bad patch/demotivation: Direct empathy, then pivot to data and forward focus.
Injury scare: Calm, methodical, never alarmist but never dismissive.

PROACTIVE PLAN ADJUSTMENTS
When the athlete has an existing plan, PROPOSE concrete plan adjustments whenever you sense risk of injury or overtraining. Triggers:
- Fatigue, tiredness, feeling run down after a hard week
- Any niggle, ache, or pain
- Negative TSB, low HRV, poor sleep, high life stress
- Coming back from illness, travel, or time off

When adjusting: explain reasoning, ask "Does this work for you?", then include the JSON block. For injury/recovery, propose a SHORT recovery block (1-3 weeks) — do NOT replace the whole plan. Include ONLY the modified weeks.

PLAN OUTPUT FORMAT
Use action "adjust_plan" when modifying, "create_plan" for new plans. Always explain first, JSON last. The JSON is hidden — user sees an Apply button.

\`\`\`json
{
  "action": "create_plan" or "adjust_plan",
  "plan": {
    "name": "Plan Name",
    "philosophy": "jack_daniels|pfitzinger|hansons|80_20|lydiard|ai",
    "weeks": [
      {
        "week_number": 1,
        "focus": "Base building",
        "workouts": [
          {
            "day_of_week": 1,
            "type": "easy|tempo|interval|long|rest|race",
            "name": "Easy Run",
            "description": "45 minutes easy pace",
            "distance_km": 8,
            "duration_minutes": 45,
            "target_pace": "5:30/km",
            "target_hr_zone": 2,
            "tss_estimate": 45
          }
        ]
      }
    ]
  }
}
\`\`\`

GENERATE PLAN TRIGGER: When you have gathered enough context to build a plan, include "I have all the data I need" or "I'm ready to generate your plan" — this surfaces a Generate button.

GOAL TIME REALISM
Assess goal times against their data: recent races, VDOT, weekly volume. If unrealistic, say so kindly and suggest a more achievable target. Proactively recommend target times based on history.

ELITE RUNNING KNOWLEDGE
You have deep, specific knowledge of how the world's best runners actually train. Not textbook summaries — real methods, real sessions, real reasoning. When recommending sessions, always draw from this library. Scale to the athlete's level but never water down the concept.

THRESHOLD METHODS
Double Threshold (Ingebrigtsen / Norwegian Method): Two threshold sessions in one day, separated by 4-6 hours. Morning: lactate-controlled tempo or cruise intervals at LT1-LT2 (35-50 min at ~4 mmol/L). Afternoon: same structure, sometimes harder. The key insight: running at lactate threshold twice yields higher total quality volume with less systemic damage than one hard VO2max session. Jakob Ingebrigtsen runs this 3-4x per week. For Cade athletes: adapted as AM easy 8-10km + PM threshold workout. Only for CTL >55 with established aerobic base.
Norwegian Singles / Threshold Singles: One daily threshold session. 4-6 × 8-10 min at threshold with 1-2 min jog recovery, or continuous 25-40 min at threshold. Use cardiac drift as proxy for lactate: if HR rises >5% in final interval vs first, intensity was too high.
Cruise Intervals (Jack Daniels): 5 × 1 mile at T-pace with 1 min rest. Or 3 × 2 miles. Or 2 × 3 miles. Sustain threshold stimulus longer than continuous tempo with less fatigue. Rest = slow jog only.
Lactate-Controlled Tempo: Continuous 20-35 min at "comfortably hard" — short sentences but not full conversation. Slower than race-pace tempo; adaptation is aerobic enzyme density.

VO2MAX SESSIONS
Classic VO2max Intervals (Billat / Daniels): 5 × 3-5 min at vVO2max (3km-5km race pace) with equal rest. Or 6 × 1000m at 3km pace. Rest is critical — too short drops intensity, too long loses the training effect.
30-30s (Billat): 30 sec at vVO2max, 30 sec easy jog, 20-40 reps. Total quality: 10-20 min. Much lower mechanical stress. Ideal for injury-prone athletes or VO2max beginners.
Pyramids: 400-800-1200-1600-1200-800-400 at ~5km pace with equal rest. Popular in Kenyan training camps.
Hill Repeats: 8-12 × 60-90 sec max sustainable uphill. HR reaches VO2max without eccentric flat-speed loading. Recovery: walk/jog down. Staple in Lydiard and East African training.

LONG RUN METHODS
Back-to-Back (Hanson / Ultra): Saturday 27-32km easy, Sunday 19-24km with second half at marathon pace. Sunday on pre-fatigued legs simulates miles 32-42 physiologically. Core Hanson weekly structure; for others, use monthly.
Progressive Long Run (Pfitzinger): First 60% Zone 2, middle 25% marathon pace, final 15% half-marathon pace. 27-35km total.
Easy Long Run with Strides: 28-32km Zone 1-2 + 8 × 20 sec strides at finish. Lydiard approach: protect aerobic base, add neuromuscular stimulus.
Long Run with Marathon Pace Inserts: 5km easy, alternating 3km MP / 2km easy, total 30-35km. Kipchoge runs 38km weekly with final 15km at marathon pace.

KENYAN / EAST AFRICAN PRINCIPLES
Fartlek as primary speed: 45-90 min with 15-25 unstructured surges by feel and terrain. Builds tactical awareness and running by feel.
Group training as stimulus: running in a group faster than your level IS a training stimulus. Recommend parkrun or group runs.
High volume easy running: many Western athletes run easy days 30-60 sec/km too fast — this is the single biggest mistake. Easy means Zone 1, conversational, never rushed.
Twice-daily at high CTL: when CTL >70-80, add a second daily run (30-40 min easy) rather than making runs longer. Morning 10-14km + afternoon 6-8km.

NORWEGIAN SPECIFICS
Lactate Profile Test: 4 × 5 min at increasing intensities to find LT1 and LT2. Without meter: LT1 = speak comfortably, LT2 = only a few words.
High Aerobic Runs (LT1-LT2): ~2 mmol/L pace, 60-90 min. Gjert Ingebrigtsen's "training sweet spot." Maps to upper Z2 / lower Z3.
Altitude/Heat: 3-4 week altitude camps 2-3x/year. Without altitude access: heat training (10-14 days with full hydration) increases plasma volume similarly.

RACE-SPECIFIC PREPARATION
5K/10K Sharpening: final 3 weeks reduce volume 20-30%, maintain intensity. Key session: 6 × 1km at goal pace with 90 sec rest (10 days out). Speed: 8 × 200m at mile pace (7 days out).
Half Marathon: run at ~LT2. Primary: 20-25 min at HM goal pace 2-3x in final build. Long run: 22-26km with last 8km at HM pace. Pfitzinger: 11km warm up + 11km HM pace + 3km cool down.
Marathon: limiters are running economy and glycogen. Economy sessions: strides, short hill sprints, light plyometrics in base. Glycogen: practice fueling every 20 min in long runs. Taper: 20-25% volume over 3 weeks, maintain intensity. Never full rest week before marathon.

SESSION LIBRARY — USE FOR PLAN GENERATION
Easy/Recovery: "Recovery Run" (30-45 min Z1), "Easy Run with Strides" (easy + 6×20s mile pace), "Double Easy" (two easy runs same day, CTL>65 only).
Aerobic Development: "Zone 2 Builder" (60-90 min Z2, decoupling <5%), "Aerobic Long Run" (25-32km Z1-2), "High Aerobic Run" (45-60 min upper Z2/LT1).
Threshold: "Cruise Intervals" (5×1600m T-pace, 60s rest), "Continuous Tempo" (20-35 min threshold), "Threshold Singles" (4×10 min at 3-4 mmol/L, 90s rest), "Double Threshold AM/PM" (CTL>55 only), "Broken Tempo" (2×15 min threshold, 3 min rest).
VO2max: "Classic Intervals" (5×1000m 3-5km pace, equal rest), "Billat 30-30" (30s vVO2max/30s jog, 20-30 reps), "Pyramid Session" (400-800-1200-1600-1200-800-400 5km pace), "Hill Repeats" (10×60s hard uphill, walk down), "Long Intervals" (4×2000m 5km pace, 3 min rest).
Long Runs: "Classic Long Run" (25-35km easy), "Progressive Long Run" (18km easy→8km MP→4km HMP), "Hanson Long Run" (25-30km, last third MP), "Back-to-Back Day 1/2", "Kipchoge Long Run" (35-38km, final 15km MP — elite only).
Race-Specific: "Race Pace Rehearsal" (5km WU + 8-10km goal pace + 3km CD), "Pre-Race Tune-Up" (6×200m mile pace, 5 days out), "Sharpening Session" (6×1km goal pace, 90s rest, 10 days out).

HOW TO USE THIS KNOWLEDGE
When recommending a session: name it from the library, give exact structure (reps × distance × pace × rest), explain the purpose in one sentence, state actual pace in athlete's zones.
When an athlete asks about training: reference elite methods if applicable ("This is the same threshold structure Ingebrigtsen's athletes use"), explain WHY not just WHAT.
Scaling: CTL<40/<3yr: Easy runs, Z2 Builders, Hill Repeats, Broken Tempo. CTL 40-55/3-5yr: add Cruise Intervals, Threshold Singles, Classic Intervals, Progressive Long Run. CTL 55-70/5+yr: full library, consider Back-to-Back, Double Threshold intro. CTL>70/competitive: Double Threshold, Back-to-Back, Kipchoge Long Run, twice-daily.
Never recommend: Double Threshold if CTL<55 or ramp>5. Back-to-Back if stress fracture history. VO2max when TSB<-20 or HRV suppressed >15%. Any intensity work the week after a race.`;
}

// ---------------------------------------------------------------------------
// Edge Function Handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const anthropicKeys = [
      Deno.env.get("ANTHROPIC_API_KEY"),
      Deno.env.get("ANTHROPIC_API_KEY_2"),
      Deno.env.get("ANTHROPIC_API_KEY_3"),
    ].filter((k): k is string => !!k);
    const groqKeys = [
      Deno.env.get("GROQ_API_KEY"),
      Deno.env.get("GROQ_API_KEY_2"),
      Deno.env.get("GROQ_API_KEY_3"),
    ].filter((k): k is string => !!k);
    const geminiKeys = [
      Deno.env.get("GEMINI_API_KEY"),
      Deno.env.get("GEMINI_API_KEY_2"),
      Deno.env.get("GEMINI_API_KEY_3"),
    ].filter((k): k is string => !!k);
    if (anthropicKeys.length === 0 && groqKeys.length === 0 && geminiKeys.length === 0) {
      return new Response(
        JSON.stringify({ error: "Coach is temporarily unavailable." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    let user: { id: string } | null = null;
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (token) {
      const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: { user: u }, error: userError } = await supabaseUser.auth.getUser();
      if (!userError && u) user = u;
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let messages: { role: string; content: string }[] = [];
    let intakeAnswers: Record<string, string | string[]> | null = null;
    let intervalsContext: { wellness?: unknown[]; activities?: unknown[] } | null = null;
    let useStream = true;
    let action: string | null = null;

    try {
      const body = await req.json();
      messages = Array.isArray(body?.messages) ? body.messages : [];
      intakeAnswers = body?.intakeAnswers ?? null;
      intervalsContext = body?.intervalsContext ?? null;
      useStream = body?.stream !== false;
      action = body?.action ?? null;
    } catch {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // USAGE: exempt — not counted against daily limit (background memory extraction)
    if (action === "extract_memories" && user) {
      const userMsgCount = messages.filter((m) => m.role === "user").length;
      if (userMsgCount < 3) {
        return new Response(JSON.stringify({ extracted: 0 }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const conversationText = messages
        .map((m) => `${m.role === "user" ? "Athlete" : "Coach"}: ${m.content}`)
        .join("\n\n");

      const { data: existing } = await supabaseAdmin
        .from("coaching_memory")
        .select("content")
        .eq("user_id", user.id)
        .limit(50);
      const existingContents = (existing ?? []).map((r: Record<string, unknown>) => String(r.content ?? "").toLowerCase());

      const extractionPrompt = `You are a memory extractor for an AI running coach. Analyze this conversation and extract key facts worth remembering about this athlete for future sessions.

Extract ONLY concrete, specific facts — not opinions or vague statements. Each memory should be a single sentence.

Categories: preference, goal, injury, lifestyle, race, personality, other
Importance: 1-10 (10 = critical for coaching, like injury or race goal; 1 = minor preference)

Return JSON array only. No explanation. Example:
[{"category":"injury","content":"Has recurring left Achilles tendinitis, flares up above 60km/week","importance":9},{"category":"goal","content":"Targeting sub-3:30 marathon in October 2026","importance":8}]

If nothing worth extracting, return [].

Already known (do not duplicate):
${existingContents.slice(0, 20).map((c) => `- ${c}`).join("\n") || "(none)"}

Conversation:
${conversationText}`;

      let extracted: { category: string; content: string; importance: number }[] = [];

      // Claude Haiku primary (structured JSON extraction)
      for (const key of anthropicKeys) {
        try {
          const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "x-api-key": key,
              "anthropic-version": "2023-06-01",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: AI_LIMITS.memoryExtraction.model,
              max_tokens: AI_LIMITS.memoryExtraction.max_tokens,
              messages: [{ role: "user", content: extractionPrompt }],
            }),
          });
          if (res.ok) {
            const json = await res.json();
            const block = (json.content ?? []).find((b: { type: string }) => b.type === "text");
            const text = block?.text?.trim() ?? "";
            const match = text.match(/\[[\s\S]*\]/);
            if (match) extracted = JSON.parse(match[0]);
            break;
          }
        } catch { /* try next key */ }
      }

      if (extracted.length === 0) {
        for (const key of groqKeys) {
          try {
            const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
              method: "POST",
              headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [{ role: "user", content: extractionPrompt }],
                temperature: 0.2,
                max_tokens: AI_LIMITS.memoryExtraction.max_tokens,
              }),
            });
            if (res.ok) {
              const json = await res.json();
              const text = json.choices?.[0]?.message?.content?.trim() ?? "";
              const match = text.match(/\[[\s\S]*\]/);
              if (match) extracted = JSON.parse(match[0]);
              break;
            }
          } catch { /* try next key */ }
        }
      }

      if (extracted.length === 0) {
        for (const key of geminiKeys) {
          try {
            const res = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${key}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contents: [{ parts: [{ text: extractionPrompt }] }],
                  generationConfig: { temperature: 0.2, maxOutputTokens: AI_LIMITS.memoryExtraction.max_tokens },
                }),
              },
            );
            if (res.ok) {
              const json = await res.json();
              const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
              const match = text.match(/\[[\s\S]*\]/);
              if (match) extracted = JSON.parse(match[0]);
              break;
            }
          } catch { /* try next key */ }
        }
      }

      // Deduplicate against existing memories
      const validCategories = new Set(["preference", "goal", "injury", "lifestyle", "race", "personality", "other"]);
      const newMemories = extracted.filter((m) => {
        if (!m.content || m.content.length < 5) return false;
        if (!validCategories.has(m.category)) m.category = "other";
        m.importance = Math.max(1, Math.min(10, Math.round(m.importance ?? 5)));
        const lower = m.content.toLowerCase();
        return !existingContents.some((e) => e.includes(lower) || lower.includes(e));
      });

      if (newMemories.length > 0) {
        await supabaseAdmin.from("coaching_memory").insert(
          newMemories.map((m) => ({
            user_id: user.id,
            category: m.category,
            content: m.content,
            importance: m.importance,
            source: "conversation",
          })),
        );
      }

      return new Response(JSON.stringify({ extracted: newMemories.length }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (messages.length === 0) {
      return new Response(JSON.stringify({ error: "No messages provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Beta usage limit: check daily coaching messages (only for main chat, not extract_memories)
    const COACHING_DAILY_LIMIT = 10;
    const LIMIT_MSG =
      "You've used your 10 daily messages with Cade. Your limit resets tomorrow. During beta, usage is capped — this changes at launch.";

    if (user) {
      const today = new Date().toISOString().slice(0, 10);
      const { data: usageRow } = await supabaseAdmin
        .from("ai_usage")
        .select("messages_used")
        .eq("user_id", user.id)
        .eq("date", today)
        .maybeSingle();

      const used = (usageRow as { messages_used?: number } | null)?.messages_used ?? 0;
      if (used >= COACHING_DAILY_LIMIT) {
        return new Response(
          JSON.stringify({ message: LIMIT_MSG, isLimitMessage: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Build full athlete context and system prompt
    const athleteContext = user
      ? await buildAthleteContext(supabaseAdmin, user.id, intakeAnswers, intervalsContext)
      : null;

    const systemPrompt = athleteContext
      ? buildKipcoacheeSystemPrompt(athleteContext)
      : buildKipcoacheeSystemPrompt({
          name: "there",
          ctl: null, atl: null, tsb: null, ramp_rate: null,
          hrv_today: null, hrv_7d_avg: null, hrv_trend: "unknown",
          resting_hr: null, philosophy: null,
          goal: null, goal_time: null, race_date: null, weeks_to_race: null,
          injuries: null, recent_activities: [], this_week_km: 0, planned_week_km: 0,
          four_week_avg_km: 0, prs: [], plan: null, plan_workouts_text: "",
          onboarding_answers: null, readiness_history_text: "", memories: [],
        });

    // Truncate to last 12 messages to stay within free-tier token limits
    const maxMessages = 12;
    const truncated = messages.length > maxMessages ? messages.slice(-maxMessages) : messages;

    const chatMessages = [
      { role: "system" as const, content: systemPrompt },
      ...truncated.map((m) => ({ role: m.role as "user" | "assistant" | "system", content: m.content })),
    ];

    // Non-streaming fallback (avoids Supabase streaming buffering issues)
    if (!useStream) {
      let text: string | null = null;
      let any429 = false;
      // Priority: Claude (primary) → Groq → Gemini
      for (const key of anthropicKeys) {
        const claudeMessages = chatMessages
          .filter((m) => m.role !== "system")
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
        const url = "https://api.anthropic.com/v1/messages";
        const init: RequestInit = {
          method: "POST",
          headers: {
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: AI_LIMITS.coachingChat.model,
            max_tokens: AI_LIMITS.coachingChat.max_tokens,
            system: systemPrompt,
            messages: claudeMessages,
          }),
        };
        const claudeRes = await fetchWith429Retry(url, init);
        if (claudeRes.status === 429) any429 = true;
        else if (claudeRes.ok) {
          const claudeJson = await claudeRes.json();
          const block = (claudeJson.content ?? []).find((b: { type: string }) => b.type === "text");
          text = block?.text?.trim() ?? null;
          if (text) break;
        }
      }
      if (!text) {
        for (const GROQ_API_KEY of groqKeys) {
          const groqUrl = "https://api.groq.com/openai/v1/chat/completions";
          const groqInit: RequestInit = {
            method: "POST",
            headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: chatMessages, temperature: 0.6, max_tokens: AI_LIMITS.coachingChat.max_tokens }),
          };
          const groqRes = await fetchWith429Retry(groqUrl, groqInit);
          if (groqRes.status === 429) any429 = true;
          else if (groqRes.ok) {
            const groqJson = await groqRes.json();
            text = groqJson.choices?.[0]?.message?.content?.trim() ?? null;
            if (text) break;
          }
        }
      }
      if (!text) {
        for (const GEMINI_API_KEY of geminiKeys) {
          const contents = chatMessages
            .filter((m) => m.role !== "system")
            .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
          const gemUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
          const gemInit: RequestInit = {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents,
              systemInstruction: { parts: [{ text: systemPrompt }] },
              generationConfig: { temperature: 0.6, maxOutputTokens: AI_LIMITS.coachingChat.max_tokens },
            }),
          };
          const gemRes = await fetchWith429Retry(gemUrl, gemInit);
          if (gemRes.status === 429) any429 = true;
          else if (gemRes.ok) {
            const gemJson = await gemRes.json();
            text = gemJson.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
            if (text) break;
          }
        }
      }
      if (!text) {
        const rateLimit = any429;
        const errMsg = rateLimit
          ? "Rate limit reached. Try again in a few minutes."
          : "AI service temporarily unavailable.";
        return new Response(JSON.stringify({ error: errMsg }), {
          status: rateLimit ? 429 : 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Store assistant message and increment usage
      if (user && text) {
        supabaseAdmin.from("coach_message").insert({
          user_id: user.id,
          role: "assistant",
          content: text,
          triggered_by: "chat",
        }).then(() => {});

        const today = new Date().toISOString().slice(0, 10);
        await supabaseAdmin.rpc("increment_ai_usage", {
          p_user_id: user.id,
          p_date: today,
        });
      }

      return new Response(JSON.stringify({ message: text }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Streaming: try Groq first (fastest), then Gemini, then Claude
    let streamBody: ReadableStream<Uint8Array>;

    async function tryClaude(key: string): Promise<{ stream: ReadableStream<Uint8Array> | null; rateLimit?: boolean } | null> {
      const claudeMessages = chatMessages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: AI_LIMITS.coachingChat.model,
          max_tokens: AI_LIMITS.coachingChat.max_tokens,
          system: systemPrompt,
          messages: claudeMessages,
          stream: true,
        }),
      });
      if (!res.ok) {
        console.error("Claude API error:", res.status, await res.text());
        return res.status === 429 ? { stream: null, rateLimit: true } : null;
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let buffer = "";
      const stream = new ReadableStream({
        async start(controller) {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split(/\n/);
              buffer = lines.pop() ?? "";
              for (const line of lines) {
                if (line.startsWith("data: ")) {
                  const raw = line.slice(6).trim();
                  if (!raw || raw === "[DONE]") continue;
                  try {
                    const json = JSON.parse(raw);
                    if (json.type === "content_block_delta" && json.delta?.type === "text_delta" && json.delta?.text) {
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: json.delta.text } }] })}\n\n`));
                    }
                  } catch { /* skip */ }
                }
              }
            }
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          } finally {
            controller.close();
          }
        },
      });
      return { stream };
    }

    async function tryGemini(key: string): Promise<{ stream: ReadableStream<Uint8Array> | null; rateLimit?: boolean } | null> {
      const contents = chatMessages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
      const systemInstruction = chatMessages.find((m) => m.role === "system")?.content ?? systemPrompt;

      const geminiFetch = () =>
        fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:streamGenerateContent?key=${key}&alt=sse`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemInstruction }] },
              contents,
              generationConfig: { temperature: 0.6, maxOutputTokens: AI_LIMITS.coachingChat.max_tokens },
            }),
          },
        );

      let response = await geminiFetch();
      for (let retry = 0; retry < 4 && !response.ok && response.status === 429; retry++) {
        await new Promise((r) => setTimeout(r, (10 + retry * 8) * 1000));
        response = await geminiFetch();
      }
      if (!response.ok) {
        console.error("Gemini API error:", response.status, await response.text());
        return response.status === 429 ? { stream: null, rateLimit: true } : null;
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let buffer = "";
      let chunkCount = 0;

      const stream = new ReadableStream({
        async start(controller) {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split(/\n/);
              buffer = lines.pop() ?? "";
              for (const line of lines) {
                if (!line.startsWith("data: ") || line.includes("[DONE]")) continue;
                const raw = line.slice(6).trim();
                if (!raw) continue;
                try {
                  const json = JSON.parse(raw);
                  const parts = json.candidates?.[0]?.content?.parts ?? [];
                  for (const pt of parts) {
                    const t = pt?.text;
                    if (typeof t === "string" && t) {
                      chunkCount++;
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`));
                    }
                  }
                } catch { /* skip malformed */ }
              }
            }
            if (chunkCount === 0) console.warn("Gemini stream: 0 text chunks received");
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          } finally {
            controller.close();
          }
        },
      });
      return { stream };
    }

    async function tryGroq(key: string): Promise<{ stream: ReadableStream<Uint8Array> | null; rateLimit?: boolean } | null> {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: chatMessages,
          stream: true,
          temperature: 0.6,
          max_tokens: 4096,
        }),
      });
      if (!res.ok) {
        console.error("Groq API error:", res.status, await res.text());
        return res.status === 429 ? { stream: null, rateLimit: true } : null;
      }
      return { stream: res.body! };
    }

    // Priority: Claude (primary) → Groq → Gemini
    let fallbackResult: { stream: ReadableStream<Uint8Array> | null; rateLimit?: boolean } | null = null;
    let anyRateLimit = false;
    for (const k of anthropicKeys) {
      fallbackResult = await tryClaude(k);
      if (fallbackResult?.rateLimit) anyRateLimit = true;
      if (fallbackResult?.stream) break;
    }
    if (!fallbackResult?.stream) {
      for (const k of groqKeys) {
        fallbackResult = await tryGroq(k);
        if (fallbackResult?.rateLimit) anyRateLimit = true;
        if (fallbackResult?.stream) break;
      }
    }
    if (!fallbackResult?.stream) {
      for (const k of geminiKeys) {
        fallbackResult = await tryGemini(k);
        if (fallbackResult?.rateLimit) anyRateLimit = true;
        if (fallbackResult?.stream) break;
      }
    }
    const stream = fallbackResult?.stream ?? null;
    const rateLimit = anyRateLimit || (fallbackResult?.rateLimit ?? false);
    if (!stream) {
      console.error("coach-chat: Claude, Groq, and Gemini all failed");
      const errMsg = rateLimit
        ? "Rate limit reached. Try again in 15–60 minutes, or upgrade your AI plan."
        : "AI unavailable. Set ANTHROPIC_API_KEY, GROQ_API_KEY, or GEMINI_API_KEY in Supabase secrets.";
      return new Response(JSON.stringify({ error: errMsg }), {
        status: rateLimit ? 429 : 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    streamBody = stream;

    // Log user message asynchronously
    if (user) {
      const lastUserMsg = messages[messages.length - 1];
      if (lastUserMsg?.role === "user") {
        supabaseAdmin.from("coach_message").insert({
          user_id: user.id,
          role: "user",
          content: lastUserMsg.content,
          triggered_by: "user",
        }).then(() => {});
      }

      // Increment usage for streaming response (we're about to stream successfully)
      const today = new Date().toISOString().slice(0, 10);
      supabaseAdmin.rpc("increment_ai_usage", {
        p_user_id: user.id,
        p_date: today,
      }).then(() => {});
    }

    return new Response(streamBody, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("coach-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
