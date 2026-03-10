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
  resting_hr: number | null;
  ctl: number | null;
  atl: number | null;
  tsb: number | null;
  /** VO2max from Garmin sync (intervals wellness); null if not available */
  vo2max?: number | null;
  /** Ramp rate (fitness change rate) from intervals wellness */
  ramp_rate?: number | null;
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
        .select("id, date, score, hrv, hrv_baseline, sleep_hours, sleep_quality, resting_hr, ctl, atl, tsb")
        .eq("user_id", user.id)
        .gte("date", oldest.toISOString().slice(0, 10))
        .order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ReadinessRow[];
    },
    staleTime: 2 * 60 * 1000,
  });
}
