import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subDays } from "date-fns";

export interface ActivityRow {
  id: string;
  date: string;
  type: string | null;
  name: string | null;
  distance_km: number | null;
  duration_seconds: number | null;
  avg_pace: string | null;
  avg_hr: number | null;
  max_hr: number | null;
  source: string | null;
  splits: unknown;
  hr_zones?: Record<string, number> | null;
  hr_zone_times?: number[] | null;
  external_id?: string | null;
  icu_training_load?: number | null;
  trimp?: number | null;
}

export function useActivities(days = 120) {
  return useQuery({
    queryKey: ["activities", days],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const oldest = subDays(new Date(), days);
      const { data, error } = await supabase
        .from("activity")
        .select("id, date, type, name, distance_km, duration_seconds, avg_pace, avg_hr, max_hr, source, splits, hr_zones, hr_zone_times, external_id, icu_training_load, trimp")
        .eq("user_id", user.id)
        .gte("date", oldest.toISOString().slice(0, 10))
        .order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ActivityRow[];
    },
    staleTime: 2 * 60 * 1000,
  });
}
