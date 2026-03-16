import { useQuery } from "@tanstack/react-query";
import { subDays } from "date-fns";
import { getLocalDateString } from "../lib/date";
import { supabase } from "../shared/supabase";

/** Readiness row shape (aligned with useDashboardData ReadinessRow) */
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
  score: number | null;
  hrv_baseline: number | null;
  ai_summary: string | null;
  sleep_score?: number | null;
  icu_ctl?: number | null;
  icu_atl?: number | null;
  icu_tsb?: number | null;
  vo2max?: number | null;
  ramp_rate?: number | null;
  icu_ramp_rate?: number | null;
  readiness?: number | null;
  stress_score?: number | null;
  mood?: number | null;
  energy?: number | null;
  muscle_soreness?: number | null;
  steps?: number | null;
  weight?: number | null;
};

/** Raw activity row for merged data (date string, distance_km, etc.) */
export type MergedActivityRow = {
  id: string;
  date: string;
  type: string | null;
  name: string | null;
  distance_km: number | null;
  duration_seconds: number | null;
  avg_pace: string | null;
  avg_hr: number | null;
  max_hr?: number | null;
  source?: string | null;
};

const DEFAULT_DAYS = 730;

/**
 * Returns activities from DB. Thin wrapper around a dedicated activities query
 * (same shape as useDashboardData activities) for use in onboarding / training snapshot.
 */
export function useMergedActivities(limitDays: number = DEFAULT_DAYS) {
  const { data, isLoading } = useQuery({
    queryKey: ["merged-activities", limitDays],
    queryFn: async (): Promise<MergedActivityRow[]> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const oldest = subDays(new Date(), limitDays);
      const oldestStr = getLocalDateString(oldest);
      const { data: rows, error } = await supabase
        .from("activity")
        .select(
          "id, date, type, name, distance_km, duration_seconds, avg_pace, avg_hr, max_hr, source",
        )
        .eq("user_id", user.id)
        .gte("date", oldestStr)
        .order("date", { ascending: true })
        .limit(2000);
      if (error) throw error;
      return (rows ?? []) as MergedActivityRow[];
    },
    staleTime: 5 * 60 * 1000,
  });

  return {
    data: data ?? [],
    isLoading,
  };
}

/**
 * Returns readiness rows from DB. Thin wrapper around daily_readiness fetch
 * for use in onboarding (CTL/fitness context).
 */
export function useMergedReadiness(days: number = DEFAULT_DAYS) {
  const { data, isLoading } = useQuery({
    queryKey: ["merged-readiness", days],
    queryFn: async (): Promise<ReadinessRow[]> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const oldest = subDays(new Date(), days);
      const oldestStr = getLocalDateString(oldest);
      const { data: rows, error } = await supabase
        .from("daily_readiness")
        .select(
          "id, date, ctl, atl, tsb, hrv, resting_hr, sleep_hours, sleep_quality, score, hrv_baseline, ai_summary, sleep_score, icu_ctl, icu_atl, icu_tsb, vo2max, ramp_rate, icu_ramp_rate, steps, weight, readiness, stress_score, mood, energy, muscle_soreness",
        )
        .eq("user_id", user.id)
        .gte("date", oldestStr)
        .order("date", { ascending: true })
        .limit(2200);
      if (error) throw error;
      return (rows ?? []) as ReadinessRow[];
    },
    staleTime: 5 * 60 * 1000,
  });

  return {
    data: data ?? [],
    isLoading,
  };
}

/**
 * Combines useMergedActivities and useMergedReadiness.
 * Single hook for components needing both (e.g. onboarding welcome step).
 */
export function useMergedIntervalsData(limitDays: number = DEFAULT_DAYS) {
  const { data: activities, isLoading: activitiesLoading } = useMergedActivities(limitDays);
  const { data: readiness, isLoading: readinessLoading } = useMergedReadiness(limitDays);

  return {
    activities,
    readiness,
    isLoading: activitiesLoading || readinessLoading,
  };
}
