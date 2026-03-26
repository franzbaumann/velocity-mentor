import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays as addDaysFns, parseISO, startOfWeek as startOfWeekFns, isWithinInterval } from "date-fns";
import { getLocalDateString } from "../lib/date";
import { supabase } from "../shared/supabase";
import {
  athlete as mockAthlete,
  readiness as mockReadiness,
  todaysWorkout as mockTodaysWorkout,
  weekStats as mockWeekStats,
  lastActivity as mockLastActivity,
  recoveryMetrics as mockRecoveryMetrics,
  weekPlan as mockWeekPlan,
} from "../data/mockDashboard";
import { useAthleteProfile } from "./useAthleteProfile";
import { useTrainingPlan } from "./useTrainingPlan";
import { isRunningActivity, dailyTSSFromActivities } from "../lib/analytics";
import { formatDistance } from "../lib/format";

export type ActivityRow = {
  id: string;
  date: string;
  type: string | null;
  name: string | null;
  distance_km: number | null;
  duration_seconds: number | null;
  avg_pace: string | null;
  avg_hr: number | null;
  max_hr: number | null;
  source?: string | null;
  external_id?: string | null;
  hr_zones?: Record<string, number> | null;
  hr_zone_times?: number[] | null;
  icu_training_load?: number | null;
  trimp?: number | null;
};

export type ReadinessRow = {
  id?: string | null;
  date: string;
  ctl: number | null;
  atl: number | null;
  tsb: number | null;
  hrv: number | null;
  resting_hr: number | null;
  sleep_hours: number | null;
  sleep_quality: number | null;
  /** Readiness / recovery score (0–100) */
  score: number | null;
  hrv_baseline: number | null;
  ai_summary: string | null;
  /** Sleep score from intervals.icu wellness (0–100) */
  sleep_score?: number | null;
  /** intervals.icu fallbacks when main columns are null */
  icu_ctl?: number | null;
  icu_atl?: number | null;
  icu_tsb?: number | null;
  /** VO2max from Garmin sync (intervals wellness); null if not available */
  vo2max?: number | null;
  /** Ramp rate (fitness change rate) from intervals wellness */
  ramp_rate?: number | null;
  /** intervals.icu readiness (0–100) when score is null */
  readiness?: number | null;
  /** Stress (0–4) from intervals.icu */
  stress_score?: number | null;
  /** Mood (1–4) from intervals.icu */
  mood?: number | null;
  /** Energy (1–4) from intervals.icu */
  energy?: number | null;
  /** Muscle soreness (0–4) from intervals.icu */
  muscle_soreness?: number | null;
  /** icu_ramp_rate — select and map to ramp_rate for charts */
  icu_ramp_rate?: number | null;
};

/** Resolve CTL/ATL/TSB with icu_* fallbacks and derive TSB = CTL - ATL when null (match web). */
function resolveCtlAtlTsb(r: {
  ctl?: number | null;
  atl?: number | null;
  tsb?: number | null;
  icu_ctl?: number | null;
  icu_atl?: number | null;
  icu_tsb?: number | null;
}) {
  const ctl = r.ctl ?? r.icu_ctl ?? null;
  const atl = r.atl ?? r.icu_atl ?? null;
  const tsb = r.tsb ?? r.icu_tsb ?? (ctl != null && atl != null ? ctl - atl : null);
  return { ctl, atl, tsb };
}

function subDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - days);
  return d;
}

function startOfWeekMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 (Sun) – 6 (Sat)
  const diff = (day + 6) % 7; // make Monday=0
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatMonthDay(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatWeekdayShort(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: "short" });
}

function formatDuration(sec: number | null): string {
  if (sec == null || !isFinite(sec)) return "--";
  const total = Math.max(0, Math.round(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function useDashboardData(selectedDate?: string) {
  const anchorDate = selectedDate ? new Date(`${selectedDate}T12:00:00`) : new Date();
  const anchorDateStr = selectedDate ?? getLocalDateString(anchorDate);
  const todayStr = getLocalDateString();
  const {
    data: activities = [],
    isLoading: activitiesLoading,
    isRefetching,
    refetch: refetchActivities,
    dataUpdatedAt: activitiesUpdatedAt,
  } = useQuery({
    queryKey: ["activities-dashboard"],
    queryFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) return [] as ActivityRow[];
      const user = session.user;
      const oldestDate = subDays(new Date(), 365 * 2);
      const oldestStr = getLocalDateString(oldestDate);
      const { data, error } = await supabase
        .from("activity")
        .select(
          "id, date, type, name, distance_km, duration_seconds, avg_pace, avg_hr, max_hr, source, external_id, hr_zones, hr_zone_times, icu_training_load, trimp",
        )
        .eq("user_id", user.id)
        .gte("date", oldestStr)
        .order("date", { ascending: true })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as ActivityRow[];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: "always",
  });

  const {
    data: readinessRows = [],
    isLoading: readinessLoading,
    refetch: refetchReadiness,
    dataUpdatedAt: readinessUpdatedAt,
  } = useQuery({
    queryKey: ["daily_readiness-dashboard"],
    queryFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) return [] as ReadinessRow[];
      const user = session.user;
      const oldestDate = subDays(new Date(), 365 * 2);
      const oldestStr = getLocalDateString(oldestDate);
      const { data, error } = await supabase
        .from("daily_readiness")
        .select(
          "id, date, ctl, atl, tsb, hrv, resting_hr, sleep_hours, sleep_quality, score, hrv_baseline, ai_summary, sleep_score, icu_ctl, icu_atl, icu_tsb, vo2max, ramp_rate, icu_ramp_rate, steps, weight, readiness, stress_score, mood, energy, muscle_soreness",
        )
        .eq("user_id", user.id)
        .gte("date", oldestStr)
        .order("date", { ascending: true })
        .limit(2200);
      if (error) throw error;
      return (data ?? []) as ReadinessRow[];
    },
    staleTime: 5 * 60 * 1000,
    refetchOnMount: "always",
  });

  const { profile: athleteProfile, refetch: refetchAthleteProfile } = useAthleteProfile();
  const { plan: planData } = useTrainingPlan();

  /** Strava week stats fallback when no intervals data; app has no Strava integration yet so returns null */
  const { data: weekStatsReal } = useQuery({
    queryKey: ["weekStats-strava"],
    queryFn: async (): Promise<{ actualKm: number } | null> => null,
    staleTime: 2 * 60 * 1000,
  });

  /** Normalize hr_zones/hr_zone_times into { z1..z5 } percentages for last-activity widget */
  const normalizeHrZones = (a: { hr_zones?: Record<string, number> | null; hr_zone_times?: number[] | null }) => {
    const times = a.hr_zone_times;
    if (Array.isArray(times) && times.length > 0 && times.some((t) => t > 0)) {
      const total = times.reduce((s, t) => s + t, 0);
      if (total > 0) {
        const z5Sum = (times[4] ?? 0) + (times[5] ?? 0);
        return {
          z1: Math.round(((times[0] ?? 0) / total) * 100),
          z2: Math.round(((times[1] ?? 0) / total) * 100),
          z3: Math.round(((times[2] ?? 0) / total) * 100),
          z4: Math.round(((times[3] ?? 0) / total) * 100),
          z5: Math.round((z5Sum / total) * 100),
        };
      }
    }
    const raw = a.hr_zones;
    if (raw && typeof raw === "object") {
      const get = (keys: string[]) =>
        keys
          .map((k) => raw[k])
          .find((v) => typeof v === "number") as number | undefined;
      return {
        z1: get(["z1", "zone1", "1"]) ?? 0,
        z2: get(["z2", "zone2", "2"]) ?? 0,
        z3: get(["z3", "zone3", "3"]) ?? 0,
        z4: get(["z4", "zone4", "4"]) ?? 0,
        z5: get(["z5", "zone5", "5"]) ?? 0,
      };
    }
    return null;
  };

  const lastActivity = useMemo(() => {
    const runs = activities.filter(
      (a) =>
        isRunningActivity(a.type) &&
        a.date <= anchorDateStr &&
        (a.distance_km ?? 0) >= 0.01 &&
        (a.distance_km ?? 0) <= 150,
    );
    const last = runs[runs.length - 1];
    if (!last) {
      return { ...mockLastActivity, detailId: null as string | null };
    }

    const z = normalizeHrZones(last) ?? mockLastActivity.hrZones;
    const isIcu = last.source === "intervals_icu" && last.external_id;
    const detailId: string =
      isIcu && last.external_id ? `icu_${last.external_id}` : last.id;
    return {
      type: last.type ?? "Run",
      date: formatMonthDay(new Date(last.date)),
      distance: last.distance_km ?? 0,
      avgPace: last.avg_pace ?? "--",
      avgHr: Math.round(last.avg_hr ?? 0),
      maxHr: Math.round(last.max_hr ?? 0),
      duration: formatDuration(last.duration_seconds),
      hrZones: z,
      detailId,
    };
  }, [activities, anchorDateStr]);

  const weekStats = useMemo(() => {
    const runningActivities = activities.filter(
      (a) =>
        isRunningActivity(a.type) &&
        (a.distance_km ?? 0) > 0 &&
        (a.distance_km ?? 0) <= 150,
    );
    const mon = startOfWeekMonday(anchorDate);
    const monStr = getLocalDateString(mon);
    const sun = addDays(mon, 6);
    const sunStr = getLocalDateString(sun);
    const thisWeekKm = runningActivities
      .filter((a) => a.date >= monStr && a.date <= sunStr)
      .reduce((sum, a) => sum + (a.distance_km ?? 0), 0);

    let plannedKm = 81;
    let qualityPlanned = 3;
    if (planData?.weeks?.length) {
      const today = new Date(anchorDate);
      const planStart = planData.plan?.start_date ? parseISO(planData.plan.start_date) : mon;
      const weekStart = startOfWeekFns(planStart, { weekStartsOn: 1 });
      const currentWeekNum = Math.floor((today.getTime() - weekStart.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
      const thisWeekData = planData.weeks.find((w) => w.week_number === currentWeekNum)
        ?? planData.weeks.find((w) => w.week_number <= currentWeekNum)
        ?? planData.weeks[planData.weeks.length - 1];
      if (thisWeekData) {
        plannedKm = Math.round((thisWeekData.total_km ?? 81) * 10) / 10;
        const sess = thisWeekData.sessions ?? [];
        qualityPlanned = sess.filter((s) => !/rest|recovery/i.test(s.session_type ?? "")).length || 3;
      }
    }

    const activitiesForTSS = activities as { date: string; avg_hr?: number | null; duration_seconds?: number | null; icu_training_load?: number | null; trimp?: number | null }[];
    const dailyTSS = dailyTSSFromActivities(activitiesForTSS);
    const tssData = [0, 1, 2, 3, 4, 5, 6].map((i) => {
      const d = addDays(mon, i);
      const key = getLocalDateString(d);
      return Math.round((dailyTSS.get(key) ?? 0) * 10) / 10;
    });

    if (runningActivities.length > 0) {
      const actualKm = Math.round(thisWeekKm * 10) / 10;
      const qualityDone = Math.min(qualityPlanned, Math.floor(actualKm / 20));
      return {
        plannedKm,
        actualKm,
        qualityDone,
        qualityPlanned,
        tssData: tssData.some((v) => v > 0) ? tssData : mockWeekStats.tssData,
      };
    }
    if (weekStatsReal) {
      const rawKm = weekStatsReal.actualKm;
      const actualKm = rawKm > 500 ? 0 : Math.round(rawKm * 10) / 10;
      const qualityDone = Math.min(qualityPlanned, Math.floor(actualKm / 20));
      return {
        plannedKm,
        actualKm,
        qualityDone,
        qualityPlanned,
        tssData: tssData.some((v) => v > 0) ? tssData : mockWeekStats.tssData,
      };
    }
    return { ...mockWeekStats, plannedKm, qualityPlanned, tssData: tssData.some((v) => v > 0) ? tssData : mockWeekStats.tssData };
  }, [weekStatsReal, activities, planData, anchorDate]);

  const recoveryMetrics = useMemo(() => {
    // Match web: use latest row (most recent), same as src/hooks/useDashboardData.ts
    const rowsUpToAnchor = readinessRows.filter((r) => r.date <= anchorDateStr);
    const latest = rowsUpToAnchor.length > 0 ? rowsUpToAnchor[rowsUpToAnchor.length - 1] : null;
    if (!latest) return mockRecoveryMetrics;
    const hrvVals = rowsUpToAnchor.map((r) => r.hrv ?? 0).filter(Boolean).reverse();
    const rhrVals = rowsUpToAnchor.map((r) => r.resting_hr ?? 0).filter(Boolean).reverse();
    const avgHrv = hrvVals.length
      ? Math.round(hrvVals.reduce((a, b) => a + b, 0) / hrvVals.length)
      : mockRecoveryMetrics.hrv7dayAvg;
    return {
      hrv: latest.hrv ?? mockRecoveryMetrics.hrv,
      hrv7dayAvg: avgHrv,
      hrvTrend:
        hrvVals.length >= 7 ? hrvVals.slice(-7) : mockRecoveryMetrics.hrvTrend,
      sleepHours: latest.sleep_hours ?? mockRecoveryMetrics.sleepHours,
      sleepQuality: latest.sleep_quality ?? mockRecoveryMetrics.sleepQuality,
      sleepScore: latest.sleep_score ?? (mockRecoveryMetrics as { sleepScore?: number | null }).sleepScore ?? null,
      restingHrTrend:
        rhrVals.length >= 7
          ? rhrVals.slice(-7)
          : mockRecoveryMetrics.restingHrTrend,
    };
  }, [readinessRows, anchorDateStr]);

  const readiness = useMemo(() => {
    // Match web: use latest row (most recent), same as src/hooks/useDashboardData.ts
    const rowsUpToAnchor = readinessRows.filter((r) => r.date <= anchorDateStr);
    const latest = rowsUpToAnchor.length > 0 ? rowsUpToAnchor[rowsUpToAnchor.length - 1] : null;
    if (!latest) return mockReadiness;
    const { ctl, atl, tsb } = resolveCtlAtlTsb(latest);
    const hasReal =
      latest.hrv != null ||
      latest.sleep_hours != null ||
      ctl != null ||
      atl != null ||
      tsb != null ||
      latest.resting_hr != null ||
      latest.sleep_score != null ||
      latest.readiness != null ||
      latest.score != null;
    if (!hasReal) return mockReadiness;
    const hrv = latest.hrv ?? null;
    const sleep = latest.sleep_hours ?? null;
    const rhr = latest.resting_hr ?? null;
    const explicitScore = latest.score ?? null;
    const derivedScore =
      explicitScore != null
        ? Math.round(Math.min(100, Math.max(0, explicitScore)))
        : latest.readiness != null
        ? Math.round(Math.min(100, Math.max(0, latest.readiness)))
        : tsb != null
        ? Math.round(Math.min(100, Math.max(0, 50 + tsb * 2.5)))
        : ctl != null
        ? Math.round(Math.min(100, Math.max(0, ctl)))
        : null;
    const score = derivedScore ?? mockReadiness.score;
    const summary =
      latest.ai_summary ??
      (tsb != null || hrv != null || sleep != null
        ? "Synced from intervals.icu"
        : mockReadiness.aiSummary);
    const isToday = latest.date === todayStr;

    const previousRow = rowsUpToAnchor.length >= 2 ? rowsUpToAnchor[rowsUpToAnchor.length - 2] : null;
    const { tsb: prevTsb } = previousRow ? resolveCtlAtlTsb(previousRow) : { tsb: null as number | null };
    const previousScore =
      previousRow?.score ??
      (previousRow?.readiness != null
        ? Math.round(Math.min(100, Math.max(0, previousRow.readiness)))
        : prevTsb != null
          ? Math.round(Math.min(100, Math.max(0, 50 + prevTsb * 2.5)))
          : null);
    const scoreDelta = previousScore != null && score != null ? score - previousScore : null;

    return {
      score,
      hrv: hrv ?? mockReadiness.hrv,
      hrvBaseline: latest.hrv_baseline ?? mockReadiness.hrvBaseline,
      sleepHours: sleep ?? mockReadiness.sleepHours,
      sleepQuality: latest.sleep_quality ?? mockReadiness.sleepQuality,
      sleepScore: latest.sleep_score ?? (mockReadiness as { sleepScore?: number | null }).sleepScore ?? null,
      restingHr: rhr ?? mockReadiness.restingHr,
      ctl: ctl ?? mockReadiness.ctl,
      atl: atl ?? mockReadiness.atl,
      tsb: tsb != null ? Math.round(tsb * 10) / 10 : mockReadiness.tsb,
      aiSummary: summary,
      hrvTrend: "neutral" as const,
      date: latest.date,
      isToday,
      scoreDelta,
    };
  }, [readinessRows, anchorDateStr, todayStr]);

  const weekPlan = useMemo(() => {
    const mon = startOfWeekMonday(anchorDate);
    const monStr = getLocalDateString(mon);
    const sunStr = getLocalDateString(addDays(mon, 6));
    const activeDayStr = anchorDateStr;
    const planSessionsByDate = new Map<string, { type: string; description: string; distance_km?: number; pace_target?: string }[]>();
    if (planData?.weeks?.length) {
      for (const week of planData.weeks) {
        for (const s of week.sessions ?? []) {
          const d = s.scheduled_date ? String(s.scheduled_date).slice(0, 10) : null;
          if (d && d >= monStr && d <= sunStr) {
            const arr = planSessionsByDate.get(d) ?? [];
            arr.push({
              type: (s.session_type ?? "easy").toLowerCase(),
              description: s.description ?? "",
              distance_km: s.distance_km ?? undefined,
              pace_target: s.pace_target ?? undefined,
            });
            planSessionsByDate.set(d, arr);
          }
        }
      }
    }

    return [0, 1, 2, 3, 4, 5, 6].map((i) => {
      const d = addDays(mon, i);
      const dateStr = getLocalDateString(d);
      const dayActs = activities.filter(
        (a) =>
          isRunningActivity(a.type) &&
          a.date === dateStr &&
          (a.distance_km ?? 0) >= 0.01 &&
          (a.distance_km ?? 0) <= 150,
      );
      const act = dayActs[0];
      const planned = planSessionsByDate.get(dateStr)?.[0];
      const today = activeDayStr === dateStr;
      const mock = mockWeekPlan[i] ?? mockWeekPlan[0];
      const hasReal = activities.length > 0;
      const hasPlan = planSessionsByDate.size > 0;
      const detailId = act
        ? (act.external_id && act.source === "intervals_icu" ? `icu_${act.external_id}` : act.id)
        : null;

      const type = (act ? (act.type ?? "run").toLowerCase() : planned ? planned.type : hasReal || hasPlan ? "rest" : mock.type) as "easy" | "tempo" | "interval" | "long" | "recovery" | "rest";
      const title = act
        ? `${act.type ?? "Run"} ${formatDistance(act.distance_km ?? 0)}`
        : planned
          ? (planned.description?.trim() || (planned.distance_km != null ? `Run ${formatDistance(planned.distance_km)}` : planned.type || "Run"))
          : hasReal || hasPlan
            ? "Rest"
            : mock.title;
      const distance = act ? Math.round((act.distance_km ?? 0) * 10) / 10 : (planned?.distance_km ?? 0);
      const detail = act?.avg_pace ?? planned?.pace_target ?? (hasReal || hasPlan ? "" : mock.detail);

      return {
        day: formatWeekdayShort(d),
        date: formatMonthDay(d),
        type,
        title,
        distance,
        detail,
        isToday: today,
        detailId,
      };
    });
  }, [activities, planData, anchorDate, anchorDateStr]);

  const todaysWorkout = useMemo(() => {
    const targetDayStr = anchorDateStr;
    if (!planData?.weeks?.length) return mockTodaysWorkout;
    const day = new Date(anchorDate);
    let thisWeekData = planData.weeks.find((w) => {
      const start = w.start_date ? parseISO(w.start_date) : null;
      if (!start) return false;
      const end = addDaysFns(start, 6);
      return isWithinInterval(day, { start, end });
    });
    if (!thisWeekData) {
      const planStart = planData.plan?.start_date ? parseISO(planData.plan.start_date) : startOfWeekFns(new Date(), { weekStartsOn: 1 });
      const weekStart = startOfWeekFns(planStart, { weekStartsOn: 1 });
      const currentWeekNum = Math.floor((day.getTime() - weekStart.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
      thisWeekData = planData.weeks.find((w) => w.week_number === currentWeekNum)
        ?? planData.weeks[planData.weeks.length - 1];
    }
    const todaySession = (thisWeekData?.sessions ?? []).find(
      (s) => s.scheduled_date && String(s.scheduled_date).slice(0, 10) === targetDayStr,
    );
    if (todaySession) {
      const type = (todaySession.session_type ?? "easy").toLowerCase() as "easy" | "tempo" | "interval" | "long" | "recovery" | "rest";
      return {
        type,
        title: todaySession.description ?? type,
        distance: todaySession.distance_km ?? 0,
        description: todaySession.description ?? "",
        paceRange: todaySession.pace_target ?? "",
      };
    }
    return { ...mockTodaysWorkout, type: "rest" as const, title: "Rest day", description: "Rest day" };
  }, [planData, anchorDate, anchorDateStr]);

  const hasRealReadiness = readinessRows.length > 0;
  const hasRealActivities = activities.length > 0;
  const isSampleData = !hasRealReadiness && !hasRealActivities;

  const refetchAll = useCallback(async () => {
    const promises: Promise<unknown>[] = [
      refetchActivities(),
      refetchReadiness(),
      refetchAthleteProfile(),
    ];
    const results = await Promise.allSettled(promises);
    const hasRejected = results.some((r) => r.status === "rejected");
    if (hasRejected) {
      throw new Error("Failed to refresh dashboard data");
    }
  }, [refetchActivities, refetchReadiness, refetchAthleteProfile]);

  const lastFetchedAt = Math.max(activitiesUpdatedAt ?? 0, readinessUpdatedAt ?? 0);

  return {
    trainingPlan: planData,
    athleteProfile,
    lastFetchedAt,
    athlete: athleteProfile
      ? {
          name: athleteProfile.name || mockAthlete.name,
          currentPhase:
            (athleteProfile.goal_race as { phase?: string })?.phase ??
            mockAthlete.currentPhase,
          goalRace: {
            type:
              (athleteProfile.goal_race as { type?: string })?.type ??
              mockAthlete.goalRace.type,
            weeksRemaining:
              (athleteProfile.goal_race as { weeksRemaining?: number })
                ?.weeksRemaining ?? mockAthlete.goalRace.weeksRemaining,
          },
        }
      : mockAthlete,
    readiness,
    todaysWorkout,
    weekStats,
    lastActivity,
    recoveryMetrics,
    weekPlan,
    isSampleData,
    activities,
    readinessRows,
    isLoading: activitiesLoading || readinessLoading,
    isRefetching,
    refetch: refetchActivities,
    refetchAll,
    hasRealReadiness,
    hasRealActivities,
  };
}

