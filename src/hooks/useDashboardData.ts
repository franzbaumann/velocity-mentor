import { useMemo } from "react";
import { useMergedActivities, useMergedReadiness } from "@/hooks/useMergedIntervalsData";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { subDays, startOfWeek, addDays, format } from "date-fns";
import {
  lastActivity as mockLastActivity,
  weekStats as mockWeekStats,
  recoveryMetrics as mockRecoveryMetrics,
  readiness as mockReadiness,
  weekPlan as mockWeekPlan,
  todaysWorkout as mockTodaysWorkout,
} from "@/data/mockData";
import { getWeekStats as getRealWeekStats } from "@/integrations/strava";
import { isRunningActivity } from "@/lib/analytics";
import { formatDistance } from "@/lib/format";

/** Format duration seconds to "HH:MM" or "M:SS" */
function formatDuration(sec: number | null): string {
  if (sec == null) return "--";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m >= 60) return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function useDashboardData() {
  const { user } = useAuth();
  const { data: activities = [] } = useMergedActivities(120);

  const { data: weekStatsReal } = useQuery({
    queryKey: ["weekStats", user?.id],
    queryFn: async () => {
      if (!user) return null;
      return getRealWeekStats();
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });

  const { data: readinessRows = [] } = useMergedReadiness(730);

  const { data: athleteProfile } = useQuery({
    queryKey: ["athlete_profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase.from("athlete_profile").select("*").eq("user_id", user.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const lastActivity = useMemo(() => {
    const runs = activities.filter(
      (a) => isRunningActivity(a.type) && (a.distance_km ?? 0) >= 0.01 && (a.distance_km ?? 0) <= 150
    );
    const last = runs[runs.length - 1];
    if (!last) return mockLastActivity;
    const hrZones = last.hr_zones ?? undefined;
    const z = hrZones ?? { z1: 5, z2: 18, z3: 32, z4: 40, z5: 5 };
    return {
      type: last.type ?? "Run",
      date: format(new Date(last.date), "MMM d"),
      distance: last.distance_km ?? 0,
      avgPace: last.avg_pace ?? "--",
      avgHr: Math.round(last.avg_hr ?? 0),
      maxHr: Math.round(last.max_hr ?? 0),
      duration: formatDuration(last.duration_seconds),
      hrZones: {
        z1: z.z1 ?? 0,
        z2: z.z2 ?? 0,
        z3: z.z3 ?? 0,
        z4: z.z4 ?? 0,
        z5: z.z5 ?? 0,
      },
    };
  }, [activities]);

  const weekStats = useMemo(() => {
    const runningActivities = activities.filter((a) => isRunningActivity(a.type) && (a.distance_km ?? 0) > 0 && (a.distance_km ?? 0) <= 150);
    const mon = startOfWeek(new Date(), { weekStartsOn: 1 });
    const monStr = mon.toISOString().slice(0, 10);
    const sunStr = format(addDays(mon, 6), "yyyy-MM-dd");
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
    if (weekStatsReal) {
      const plannedKm = 81;
      const rawKm = weekStatsReal.actualKm;
      const actualKm = rawKm > 500 ? 0 : Math.round(rawKm * 10) / 10;
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
  }, [weekStatsReal, activities]);

  const recoveryMetrics = useMemo(() => {
    const latest = readinessRows[0];
    if (!latest) return mockRecoveryMetrics;
    const hrvVals = readinessRows.map((r) => r.hrv ?? 0).filter(Boolean).reverse();
    const rhrVals = readinessRows.map((r) => r.resting_hr ?? 0).filter(Boolean).reverse();
    const avgHrv = hrvVals.length ? Math.round(hrvVals.reduce((a, b) => a + b, 0) / hrvVals.length) : mockRecoveryMetrics.hrv7dayAvg;
    return {
      hrv: latest.hrv ?? mockRecoveryMetrics.hrv,
      hrv7dayAvg: avgHrv,
      hrvTrend: hrvVals.length >= 7 ? hrvVals.slice(-7) : mockRecoveryMetrics.hrvTrend,
      sleepHours: latest.sleep_hours ?? mockRecoveryMetrics.sleepHours,
      sleepQuality: latest.sleep_quality ?? mockRecoveryMetrics.sleepQuality,
      restingHrTrend: rhrVals.length >= 7 ? rhrVals.slice(-7) : mockRecoveryMetrics.restingHrTrend,
    };
  }, [readinessRows]);

  const readiness = useMemo(() => {
    const latest = readinessRows[0];
    if (!latest) return mockReadiness;
    const hasReal = latest.hrv != null || latest.sleep_hours != null || latest.ctl != null || latest.atl != null || latest.tsb != null || latest.resting_hr != null;
    if (!hasReal) return mockReadiness;
    const tsb = latest.tsb != null ? latest.tsb : null;
    const ctl = latest.ctl ?? null;
    const atl = latest.atl ?? null;
    const hrv = latest.hrv ?? null;
    const sleep = latest.sleep_hours ?? null;
    const rhr = latest.resting_hr ?? null;
    const explicitScore = latest.score ?? null;
    const derivedScore = explicitScore != null ? Math.round(Math.min(100, Math.max(0, explicitScore))) : (tsb != null ? Math.round(Math.min(100, Math.max(0, 50 + tsb * 2.5))) : (ctl != null ? Math.round(Math.min(100, Math.max(0, ctl))) : null));
    const score = derivedScore ?? mockReadiness.score;
    const summary = latest.ai_summary ?? (tsb != null || hrv != null || sleep != null
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
    const mon = startOfWeek(new Date(), { weekStartsOn: 1 });
    return [0, 1, 2, 3, 4, 5, 6].map((i) => {
      const d = addDays(mon, i);
      const dateStr = d.toISOString().slice(0, 10);
      const dayActs = activities.filter((a) => isRunningActivity(a.type) && a.date === dateStr && (a.distance_km ?? 0) >= 0.01 && (a.distance_km ?? 0) <= 150);
      const act = dayActs[0];
      const today = format(new Date(), "yyyy-MM-dd") === dateStr;
      const mock = mockWeekPlan[i] ?? mockWeekPlan[0];
      const hasReal = activities.length > 0;
      return {
        day: format(d, "EEE").slice(0, 3),
        date: format(d, "MMM d"),
        type: (act ? (act.type ?? "run").toLowerCase() : hasReal ? "rest" : mock.type) as "easy" | "tempo" | "interval" | "long" | "recovery" | "rest",
        title: act ? `${act.type ?? "Run"} ${formatDistance(act.distance_km ?? 0)}` : hasReal ? "—" : mock.title,
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
    lastActivity,
    weekStats,
    recoveryMetrics,
    readiness,
    weekPlan,
    todaysWorkout: mockTodaysWorkout,
    isSampleData,
    hasRealReadiness,
    hasRealActivities,
    activities,
    athlete: athleteProfile
      ? {
          name: athleteProfile.name || "Athlete",
          currentPhase: (athleteProfile.goal_race as { phase?: string })?.phase ?? "Build",
          goalRace: {
            type: (athleteProfile.goal_race as { type?: string })?.type ?? "Marathon",
            weeksRemaining: (athleteProfile.goal_race as { weeksRemaining?: number })?.weeksRemaining ?? 14,
          },
        }
      : { name: "Athlete", currentPhase: "Build" as const, goalRace: { type: "Marathon", weeksRemaining: 14 } },
  };
}
