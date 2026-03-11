import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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

type ActivityRow = {
  id: string;
  date: string;
  type: string | null;
  name: string | null;
  distance_km: number | null;
  duration_seconds: number | null;
  avg_pace: string | null;
  avg_hr: number | null;
  max_hr: number | null;
};

type ReadinessRow = {
  date: string;
  ctl: number | null;
  atl: number | null;
  tsb: number | null;
  hrv: number | null;
  resting_hr: number | null;
  sleep_hours: number | null;
  sleep_quality: number | null;
  score: number | null;
  hrv_baseline: number | null;
  ai_summary: string | null;
};

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

function isRunningActivity(type: string | null | undefined): boolean {
  const t = (type ?? "").toLowerCase();
  return t === "run" || t.includes("run") || t === "trailrun" || t.includes("jog");
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

export function useDashboardData() {
  const { data: activities = [], isLoading: activitiesLoading, isRefetching, refetch } = useQuery({
    queryKey: ["activities-dashboard"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [] as ActivityRow[];
      const oldest = subDays(new Date(), 365 * 2);
      const { data, error } = await supabase
        .from("activity")
        .select(
          "id, date, type, name, distance_km, duration_seconds, avg_pace, avg_hr, max_hr",
        )
        .eq("user_id", user.id)
        .gte("date", oldest.toISOString().slice(0, 10))
        .order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ActivityRow[];
    },
    staleTime: 2 * 60 * 1000,
  });

  const { data: readinessRows = [], isLoading: readinessLoading } = useQuery({
    queryKey: ["daily_readiness-dashboard"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [] as ReadinessRow[];
      const oldest = subDays(new Date(), 365 * 2);
      const { data, error } = await supabase
        .from("daily_readiness")
        .select(
          "date, ctl, atl, tsb, hrv, resting_hr, sleep_hours, sleep_quality, score, hrv_baseline, ai_summary",
        )
        .eq("user_id", user.id)
        .gte("date", oldest.toISOString().slice(0, 10))
        .order("date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ReadinessRow[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: athleteProfile } = useQuery({
    queryKey: ["athlete_profile-mobile"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("athlete_profile")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
  });

  const lastActivity = useMemo(() => {
    const runs = activities.filter(
      (a) =>
        isRunningActivity(a.type) &&
        (a.distance_km ?? 0) >= 0.01 &&
        (a.distance_km ?? 0) <= 150,
    );
    const last = runs[runs.length - 1];
    if (!last) return mockLastActivity;
    const z = { z1: 5, z2: 18, z3: 32, z4: 40, z5: 5 };
    return {
      type: last.type ?? "Run",
      date: formatMonthDay(new Date(last.date)),
      distance: last.distance_km ?? 0,
      avgPace: last.avg_pace ?? "--",
      avgHr: Math.round(last.avg_hr ?? 0),
      maxHr: Math.round(last.max_hr ?? 0),
      duration: formatDuration(last.duration_seconds),
      hrZones: z,
    };
  }, [activities]);

  const weekStats = useMemo(() => {
    const runningActivities = activities.filter(
      (a) =>
        isRunningActivity(a.type) &&
        (a.distance_km ?? 0) > 0 &&
        (a.distance_km ?? 0) <= 150,
    );
    const mon = startOfWeekMonday(new Date());
    const monStr = getLocalDateString(mon);
    const sun = addDays(mon, 6);
    const sunStr = getLocalDateString(sun);
    const thisWeekKm = runningActivities
      .filter((a) => a.date >= monStr && a.date <= sunStr)
      .reduce((sum, a) => sum + (a.distance_km ?? 0), 0);

    if (runningActivities.length > 0) {
      const plannedKm = 81;
      const actualKm = Math.round(thisWeekKm * 10) / 10;
      const qualityPlanned = 3;
      const qualityDone = Math.min(qualityPlanned, Math.floor(actualKm / 20));
      return {
        plannedKm,
        actualKm,
        qualityDone,
        qualityPlanned,
        tssData: mockWeekStats.tssData,
      };
    }

    return mockWeekStats;
  }, [activities]);

  const recoveryMetrics = useMemo(() => {
    const todayStr = getLocalDateString();
    const latest = readinessRows.find((r) => r.date === todayStr) ?? readinessRows[0];
    if (!latest) return mockRecoveryMetrics;
    const hrvVals = readinessRows.map((r) => r.hrv ?? 0).filter(Boolean).reverse();
    const rhrVals = readinessRows.map((r) => r.resting_hr ?? 0).filter(Boolean).reverse();
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
      restingHrTrend:
        rhrVals.length >= 7
          ? rhrVals.slice(-7)
          : mockRecoveryMetrics.restingHrTrend,
    };
  }, [readinessRows]);

  const readiness = useMemo(() => {
    const todayStr = getLocalDateString();
    const todayRow = readinessRows.find((r) => r.date === todayStr);
    const latest = todayRow ?? readinessRows[0];
    if (!latest) return mockReadiness;
    const hasReal =
      latest.hrv != null ||
      latest.sleep_hours != null ||
      latest.ctl != null ||
      latest.atl != null ||
      latest.tsb != null ||
      latest.resting_hr != null;
    if (!hasReal) return mockReadiness;
    const tsb = latest.tsb != null ? latest.tsb : null;
    const ctl = latest.ctl ?? null;
    const atl = latest.atl ?? null;
    const hrv = latest.hrv ?? null;
    const sleep = latest.sleep_hours ?? null;
    const rhr = latest.resting_hr ?? null;
    const explicitScore = latest.score ?? null;
    const derivedScore =
      explicitScore != null
        ? Math.round(Math.min(100, Math.max(0, explicitScore)))
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
    return {
      score,
      hrv: hrv ?? mockReadiness.hrv,
      hrvBaseline: latest.hrv_baseline ?? mockReadiness.hrvBaseline,
      sleepHours: sleep ?? mockReadiness.sleepHours,
      sleepQuality: latest.sleep_quality ?? mockReadiness.sleepQuality,
      restingHr: rhr ?? mockReadiness.restingHr,
      ctl: ctl ?? mockReadiness.ctl,
      atl: atl ?? mockReadiness.atl,
      tsb: tsb != null ? Math.round(tsb * 10) / 10 : mockReadiness.tsb,
      aiSummary: summary,
      hrvTrend: "neutral" as const,
    };
  }, [readinessRows]);

  const weekPlan = useMemo(() => {
    const mon = startOfWeekMonday(new Date());
    const todayStr = getLocalDateString();
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
      const today = todayStr === dateStr;
      const mock = mockWeekPlan[i] ?? mockWeekPlan[0];
      const hasReal = activities.length > 0;
      return {
        day: formatWeekdayShort(d),
        date: formatMonthDay(d),
        type: (act
          ? (act.type ?? "run").toLowerCase()
          : hasReal
          ? "rest"
          : mock.type) as
          | "easy"
          | "tempo"
          | "interval"
          | "long"
          | "recovery"
          | "rest",
        title: act
          ? `${act.type ?? "Run"} ${Math.round((act.distance_km ?? 0) * 10) / 10} km`
          : hasReal
          ? "—"
          : mock.title,
        distance: act ? Math.round((act.distance_km ?? 0) * 10) / 10 : 0,
        detail: act?.avg_pace ?? (hasReal ? "" : mock.detail),
        isToday: today,
      };
    });
  }, [activities]);

  const hasRealReadiness = readinessRows.length > 0;
  const hasRealActivities = activities.length > 0;
  const isSampleData = !hasRealReadiness && !hasRealActivities;

  return {
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
    todaysWorkout: mockTodaysWorkout,
    weekStats,
    lastActivity,
    recoveryMetrics,
    weekPlan,
    isSampleData,
    activities,
    isLoading: activitiesLoading || readinessLoading,
    isRefetching,
    refetch,
    hasRealReadiness,
    hasRealActivities,
  };
}

