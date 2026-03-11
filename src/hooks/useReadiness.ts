import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subDays } from "date-fns";

export interface ReadinessRow {
  id: string;
  date: string;
  score: number | null;
  hrv: number | null;
  hrv_baseline: number | null;
  sleep_hours: number | null;
  sleep_quality: number | null;
  /** Sleep score from intervals.icu wellness (0–100) */
  sleep_score: number | null;
  resting_hr: number | null;
  ctl: number | null;
  atl: number | null;
  tsb: number | null;
  /** intervals.icu fallbacks when main columns are null */
  icu_ctl?: number | null;
  icu_atl?: number | null;
  icu_tsb?: number | null;
  /** VO2max from Garmin sync (intervals wellness); null if not available */
  vo2max?: number | null;
  /** Ramp rate (fitness change rate) from intervals wellness */
  ramp_rate?: number | null;
}

/** Resolve CTL/ATL/TSB with icu_* fallbacks and derive TSB = CTL - ATL when null */
export function resolveCtlAtlTsb(r: {
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

export function useReadiness(days = 1095) {
  return useQuery({
    queryKey: ["daily_readiness", days],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const oldest = subDays(new Date(), days);
      const { data, error } = await supabase
        .from("daily_readiness")
        .select("id, date, score, hrv, hrv_baseline, sleep_hours, sleep_quality, sleep_score, resting_hr, ctl, atl, tsb, icu_ctl, icu_atl, icu_tsb")
        .eq("user_id", user.id)
        .gte("date", oldest.toISOString().slice(0, 10))
        .order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ReadinessRow[];
    },
    staleTime: 2 * 60 * 1000,
    refetchOnMount: "always",
  });
}
