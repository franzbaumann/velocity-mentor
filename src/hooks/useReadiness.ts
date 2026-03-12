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
  /** intervals.icu readiness (0–100) when score is null */
  readiness?: number | null;
  /** intervals.icu fallbacks when main columns are null */
  icu_ctl?: number | null;
  icu_atl?: number | null;
  icu_tsb?: number | null;
  /** VO2max from Garmin sync (intervals wellness); null if not available */
  vo2max?: number | null;
  /** Ramp rate (fitness change rate) from intervals wellness */
  ramp_rate?: number | null;
  /** icu_ramp_rate — select and map to ramp_rate for charts */
  icu_ramp_rate?: number | null;
  /** Weight (kg) from intervals.icu wellness */
  weight?: number | null;
  /** Steps from intervals.icu wellness */
  steps?: number | null;
  /** Stress (0–4: None→Extreme) from intervals.icu */
  stress_score?: number | null;
  /** Mood (1–4: Poor→Excellent) from intervals.icu */
  mood?: number | null;
  /** Energy (1–4) from intervals.icu */
  energy?: number | null;
  /** Muscle soreness (0–4: None→Extreme) from intervals.icu */
  muscle_soreness?: number | null;
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
        .select("*")
        .eq("user_id", user.id)
        .gte("date", oldest.toISOString().slice(0, 10))
        .order("date", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as Record<string, unknown>[];
      return rows.map((r) => ({
        id: String(r.id ?? ""),
        date: String(r.date ?? ""),
        score: r.score != null ? Number(r.score) : null,
        readiness: r.readiness != null ? Number(r.readiness) : null,
        hrv: r.hrv != null ? Number(r.hrv) : null,
        hrv_baseline: r.hrv_baseline != null ? Number(r.hrv_baseline) : null,
        sleep_hours: r.sleep_hours != null ? Number(r.sleep_hours) : null,
        sleep_quality: r.sleep_quality != null ? Number(r.sleep_quality) : null,
        sleep_score: r.sleep_score != null ? Number(r.sleep_score) : null,
        resting_hr: r.resting_hr != null ? Number(r.resting_hr) : null,
        ctl: r.ctl != null ? Number(r.ctl) : null,
        atl: r.atl != null ? Number(r.atl) : null,
        tsb: r.tsb != null ? Number(r.tsb) : null,
        icu_ctl: r.icu_ctl != null ? Number(r.icu_ctl) : null,
        icu_atl: r.icu_atl != null ? Number(r.icu_atl) : null,
        icu_tsb: r.icu_tsb != null ? Number(r.icu_tsb) : null,
        icu_ramp_rate: r.icu_ramp_rate != null ? Number(r.icu_ramp_rate) : null,
        ramp_rate: r.icu_ramp_rate != null ? Number(r.icu_ramp_rate) : null,
        vo2max: r.vo2max != null ? Number(r.vo2max) : null,
        weight: r.weight != null ? Number(r.weight) : null,
        steps: r.steps != null ? Number(r.steps) : null,
        stress_score: r.stress_score != null ? Number(r.stress_score) : null,
        mood: r.mood != null ? Number(r.mood) : null,
        energy: r.energy != null ? Number(r.energy) : null,
        muscle_soreness: r.muscle_soreness != null ? Number(r.muscle_soreness) : null,
      } as ReadinessRow));
    },
    staleTime: 2 * 60 * 1000,
    refetchOnMount: "always",
  });
}
