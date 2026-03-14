import { useMemo } from "react";
import { useMergedActivities, useMergedReadiness } from "@/hooks/useMergedIntervalsData";
import { resolveCtlAtlTsb } from "@/hooks/useReadiness";
import { useAuth } from "@/hooks/use-auth";
import { useTrainingPlan } from "@/hooks/use-training-plan";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { subDays, startOfWeek, addDays, format, parseISO, isWithinInterval } from "date-fns";
import {
  lastActivity as mockLastActivity,
  weekStats as mockWeekStats,
  recoveryMetrics as mockRecoveryMetrics,
  readiness as mockReadiness,
  weekPlan as mockWeekPlan,
  todaysWorkout as mockTodaysWorkout,
} from "@/data/mockData";
import { getWeekStats as getRealWeekStats } from "@/integrations/strava";
import { isRunningActivity, dailyTSSFromActivities } from "@/lib/analytics";
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
  const { plan: planData } = useTrainingPlan();

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

  /** Normalize hr_zones/hr_zone_times to { z1..z5 } percentages */
  const normalizeHrZones = (a: { hr_zones?: Record<string, number> | null; hr_zone_times?: number[] | null }) => {
    const times = a.hr_zone_times;
    if (Array.isArray(times) && times.length > 0 && times.some((t) => t > 0)) {
      const total = times.reduce((s, t) => s + t, 0);
      if (total > 0) {
        const z5 = (times[4] ?? 0) + (times[5] ?? 0);
        return {
          z1: Math.round(((times[0] ?? 0) / total) * 100),
          z2: Math.round(((times[1] ?? 0) / total) * 100),
          z3: Math.round(((times[2] ?? 0) / total) * 100),
          z4: Math.round(((times[3] ?? 0) / total) * 100),
          z5: Math.round((z5 / total) * 100),
        };
      }
    }
    const raw = a.hr_zones;
    if (raw && typeof raw === "object") {
      const get = (keys: string[]) => keys.map((k) => raw[k]).find((v) => typeof v === "number");
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
      (a) => isRunningActivity(a.type) && (a.distance_km ?? 0) >= 0.01 && (a.distance_km ?? 0) <= 150
    );
    const last = runs[runs.length - 1];
    if (!last) return { ...mockLastActivity, detailId: null as string | null };
    const z = normalizeHrZones(last) ?? { z1: 5, z2: 18, z3: 32, z4: 40, z5: 5 };
    const detailId = last.external_id && last.source === "intervals_icu"
      ? `icu_${last.external_id}`
      : last.id;
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
      detailId,
    };
  }, [activities]);

  const weekStats = useMemo(() => {
    const runningActivities = activities.filter((a) => isRunningActivity(a.type) && (a.distance_km ?? 0) > 0 && (a.distance_km ?? 0) <= 150);
    const mon = startOfWeek(new Date(), { weekStartsOn: 1 });
    const sun = addDays(mon, 6);
    const monStr = mon.toISOString().slice(0, 10);
    const sunStr = format(sun, "yyyy-MM-dd");
    const thisWeekKm = runningActivities
      .filter((a) => a.date >= monStr && a.date <= sunStr)
      .reduce((sum, a) => sum + (a.distance_km ?? 0), 0);

    let plannedKm: number | null = null;
    let qualityPlanned = 3;
    let isCurrentWeekInPlan = false;

    if (planData?.weeks?.length) {
      const weeks = planData.weeks as { start_date?: string; week_number?: number; total_km?: number; sessions?: { type?: string }[] }[];
      const firstWeek = weeks[0];
      const lastWeek = weeks[weeks.length - 1];
      const planStartStr = planData.plan?.start_date ?? firstWeek?.start_date;
      const planEndStr = planData.plan?.end_date ?? (lastWeek?.start_date ? format(addDays(parseISO(lastWeek.start_date), 6), "yyyy-MM-dd") : null);

      if (planStartStr && planEndStr) {
        isCurrentWeekInPlan = monStr >= planStartStr && sunStr <= planEndStr;
      }

      if (isCurrentWeekInPlan) {
        const today = new Date();
        const planStart = planData.plan?.start_date ? parseISO(planData.plan.start_date) : mon;
        const weekStart = startOfWeek(planStart, { weekStartsOn: 1 });
        const currentWeekNum = Math.floor((today.getTime() - weekStart.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
        const thisWeekData = weeks.find((w) => w.week_number === currentWeekNum)
          ?? weeks.find((w) => (w.week_number ?? 0) <= currentWeekNum) ?? lastWeek;
        if (thisWeekData) {
          plannedKm = Math.round((thisWeekData.total_km ?? 81) * 10) / 10;
          const sess = thisWeekData.sessions ?? [];
          qualityPlanned = sess.filter((s) => !/rest|recovery/i.test(s.type ?? "")).length || 3;
        }
      }
    }

    const dailyTSS = dailyTSSFromActivities(activities as { date: string; avg_hr?: number | null; duration_seconds?: number | null; icu_training_load?: number | null; trimp?: number | null }[]);
    const tssData = [0, 1, 2, 3, 4, 5, 6].map((i) => {
      const d = addDays(mon, i);
      const key = format(d, "yyyy-MM-dd");
      return Math.round((dailyTSS.get(key) ?? 0) * 10) / 10;
    });

    const base = {
      plannedKm,
      actualKm: 0,
      qualityDone: 0,
      qualityPlanned,
      isCurrentWeekInPlan,
      tssData: tssData.some((v) => v > 0) ? tssData : mockWeekStats.tssData,
    };

    if (runningActivities.length > 0) {
      const actualKm = Math.round(thisWeekKm * 10) / 10;
      const qualityDone = Math.min(qualityPlanned, Math.floor(actualKm / 20));
      return { ...base, actualKm, qualityDone };
    }
    if (weekStatsReal) {
      const rawKm = weekStatsReal.actualKm;
      const actualKm = rawKm > 500 ? 0 : Math.round(rawKm * 10) / 10;
      const qualityDone = Math.min(qualityPlanned, Math.floor(actualKm / 20));
      return { ...base, actualKm, qualityDone };
    }
    return { ...mockWeekStats, ...base, actualKm: mockWeekStats.actualKm };
  }, [weekStatsReal, activities, planData]);

  const recoveryMetrics = useMemo(() => {
    // readinessRows is sorted by date ascending; latest = most recent (last element)
    const latest = readinessRows.length > 0 ? readinessRows[readinessRows.length - 1] : null;
    if (!latest) return mockRecoveryMetrics;
    const hrvVals = readinessRows.map((r) => r.hrv ?? 0).filter(Boolean).slice(-7);
    const rhrVals = readinessRows.map((r) => r.resting_hr ?? 0).filter(Boolean).slice(-7);
    const avgHrv = hrvVals.length ? Math.round(hrvVals.reduce((a, b) => a + b, 0) / hrvVals.length) : mockRecoveryMetrics.hrv7dayAvg;
    return {
      hrv: latest.hrv ?? mockRecoveryMetrics.hrv,
      hrv7dayAvg: avgHrv,
      hrvTrend: hrvVals.length >= 7 ? hrvVals.slice(-7) : mockRecoveryMetrics.hrvTrend,
      sleepHours: latest.sleep_hours ?? mockRecoveryMetrics.sleepHours,
      sleepQuality: latest.sleep_quality ?? mockRecoveryMetrics.sleepQuality,
      sleepScore: latest.sleep_score ?? mockRecoveryMetrics.sleepScore ?? null,
      restingHrTrend: rhrVals.length >= 7 ? rhrVals.slice(-7) : mockRecoveryMetrics.restingHrTrend,
    };
  }, [readinessRows]);

  const readiness = useMemo(() => {
    // readinessRows is sorted by date ascending; latest = most recent (last element)
    const latest = readinessRows.length > 0 ? readinessRows[readinessRows.length - 1] : null;
    if (!latest) return mockReadiness;
    const { ctl, atl, tsb } = resolveCtlAtlTsb(latest);
    const hasReal = latest.hrv != null || latest.sleep_hours != null || ctl != null || atl != null || tsb != null || latest.resting_hr != null;
    if (!hasReal) return mockReadiness;
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
      sleepScore: latest.sleep_score ?? mockReadiness.sleepScore ?? null,
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
    const monStr = format(mon, "yyyy-MM-dd");
    const sunStr = format(addDays(mon, 6), "yyyy-MM-dd");
    const planSessionsByDate = new Map<string, { type: string; description: string; distance_km?: number; pace_target?: string }[]>();
    if (planData?.weeks?.length) {
      for (const week of planData.weeks as { sessions?: { scheduled_date?: string; session_type?: string; description?: string; distance_km?: number; pace_target?: string }[]; start_date?: string }[]) {
        for (const s of week.sessions ?? []) {
          const d = s.scheduled_date ? String(s.scheduled_date).slice(0, 10) : null;
          if (d && d >= monStr && d <= sunStr) {
            const arr = planSessionsByDate.get(d) ?? [];
            arr.push({
              type: (s.session_type ?? "easy").toLowerCase(),
              description: s.description ?? "",
              distance_km: s.distance_km,
              pace_target: s.pace_target ?? undefined,
            });
            planSessionsByDate.set(d, arr);
          }
        }
      }
    }

    return [0, 1, 2, 3, 4, 5, 6].map((i) => {
      const d = addDays(mon, i);
      const dateStr = format(d, "yyyy-MM-dd");
      const dayActs = activities.filter((a) => isRunningActivity(a.type) && a.date === dateStr && (a.distance_km ?? 0) >= 0.01 && (a.distance_km ?? 0) <= 150);
      const act = dayActs[0];
      const planned = planSessionsByDate.get(dateStr)?.[0];
      const today = format(new Date(), "yyyy-MM-dd") === dateStr;
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
          ? (planned.description?.trim() || (planned.distance_km ? `Run ${formatDistance(planned.distance_km)}` : planned.type || "Run"))
          : hasReal || hasPlan
            ? "Rest"
            : mock.title;
      const distance = act ? Math.round((act.distance_km ?? 0) * 10) / 10 : (planned?.distance_km ?? 0);
      const detail = act?.avg_pace ?? planned?.pace_target ?? (hasReal || hasPlan ? "" : mock.detail);

      return {
        day: format(d, "EEE").slice(0, 3),
        date: format(d, "MMM d"),
        type,
        title,
        distance,
        detail,
        isToday: today,
        detailId,
      };
    });
  }, [activities, planData]);

  const todaysWorkout = useMemo(() => {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    if (planData?.weeks?.length) {
      const today = new Date();
      const thisMon = startOfWeek(today, { weekStartsOn: 1 });
      let thisWeekData = planData.weeks.find((w: { start_date?: string }) => {
        const start = w.start_date ? parseISO(w.start_date) : null;
        if (!start) return false;
        const end = addDays(start, 6);
        return isWithinInterval(today, { start, end });
      });
      if (!thisWeekData) {
        const planStart = planData.plan?.start_date ? parseISO(planData.plan.start_date) : startOfWeek(new Date(), { weekStartsOn: 1 });
        const weekStart = startOfWeek(planStart, { weekStartsOn: 1 });
        const currentWeekNum = Math.floor((today.getTime() - weekStart.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
        thisWeekData = planData.weeks.find((w: { week_number: number }) => w.week_number === currentWeekNum)
          ?? planData.weeks[planData.weeks.length - 1];
      }
      const todaySession = (thisWeekData?.sessions ?? []).find(
        (s: { scheduled_date?: string }) => s.scheduled_date && String(s.scheduled_date).slice(0, 10) === todayStr
      ) as { session_type?: string; description?: string; distance_km?: number } | undefined;
      if (todaySession) {
        const type = (todaySession.session_type ?? "easy").toLowerCase() as "easy" | "tempo" | "interval" | "long" | "recovery" | "rest";
        return {
          type,
          title: todaySession.description ?? type,
          distance: todaySession.distance_km ?? 0,
          description: todaySession.description ?? "",
          paceRange: "",
        };
      }
      return { ...mockTodaysWorkout, type: "rest" as const, title: "Rest day", description: "Rest day" };
    }
    return mockTodaysWorkout;
  }, [planData]);

  const hasRealReadiness = readinessRows.length > 0;
  const hasRealActivities = activities.length > 0;
  const isSampleData = !hasRealReadiness && !hasRealActivities;

  return {
    lastActivity,
    weekStats,
    recoveryMetrics,
    readiness,
    weekPlan,
    todaysWorkout,
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
