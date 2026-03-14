import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { OtherTraining } from "@/lib/totalLoad/calculateTLS";

export interface DailyLoadRow {
  id: string;
  user_id: string;
  date: string;
  running_atl: number | null;
  hrv_score: number | null;
  sleep_hours: number | null;
  sleep_score: number | null;
  resting_hr: number | null;
  other_training: OtherTraining[] | null;
  work_stress: number | null;
  life_stress: number | null;
  travel: boolean | null;
  travel_note: string | null;
  life_note: string | null;
  mood: number | null;
  energy: number | null;
  legs: number | null;
  total_load_score: number | null;
  recovery_score: number | null;
  cns_status: string | null;
  created_at: string;
}

export interface CheckInPayload {
  mood: number;
  energy: number;
  legs: number;
  other_training?: OtherTraining[];
  work_stress?: number;
  life_stress?: number;
  travel?: boolean;
  life_note?: string;
}

const QK = ["daily_load"] as const;

export function useDailyLoad() {
  const qc = useQueryClient();
  const todayStr = new Date().toISOString().slice(0, 10);

  const { data: todayLoad, isLoading } = useQuery({
    queryKey: [...QK, todayStr],
    queryFn: async (): Promise<DailyLoadRow | null> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return null;
      const { data, error } = await supabase
        .from("daily_load")
        .select("*")
        .eq("user_id", session.user.id)
        .eq("date", todayStr)
        .maybeSingle();
      if (error) throw error;
      return data as DailyLoadRow | null;
    },
    staleTime: 30_000,
  });

  const upsertMutation = useMutation({
    mutationFn: async (payload: CheckInPayload) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error("Not authenticated");
      const { error } = await supabase.from("daily_load").upsert(
        {
          user_id: session.user.id,
          date: todayStr,
          mood: payload.mood,
          energy: payload.energy,
          legs: payload.legs,
          other_training: payload.other_training ?? [],
          work_stress: payload.work_stress ?? 1,
          life_stress: payload.life_stress ?? 1,
          travel: payload.travel ?? false,
          life_note: payload.life_note ?? null,
        },
        { onConflict: "user_id,date" }
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });

  const calcMutation = useMutation({
    mutationFn: async () => {
      await supabase.auth.refreshSession();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error("Not authenticated");
      const { data, error } = await supabase.functions.invoke("calculate-daily-load", {
        body: { date: todayStr },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });

  const checkIn = async (payload: CheckInPayload) => {
    await upsertMutation.mutateAsync(payload);
    try {
      await calcMutation.mutateAsync();
    } catch {
      // Edge function may not be deployed; check-in data is already saved
    }
  };

  const hasCheckedInToday = todayLoad?.mood != null;

  return {
    todayLoad,
    isLoading,
    hasCheckedInToday,
    checkIn,
    isCheckingIn: upsertMutation.isPending || calcMutation.isPending,
  };
}

export interface DailyLoadWithBreakdown extends DailyLoadRow {
  breakdown?: { running?: number; otherTraining?: number; sleep?: number; lifeStress?: number; subjective?: number } | null;
}

export function useDailyLoadHistory(days = 28) {
  const start = new Date();
  start.setDate(start.getDate() - days);
  const startStr = start.toISOString().slice(0, 10);
  const todayStr = new Date().toISOString().slice(0, 10);

  return useQuery({
    queryKey: [...QK, "history", startStr, todayStr],
    queryFn: async (): Promise<DailyLoadWithBreakdown[]> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return [];
      const { data, error } = await supabase
        .from("daily_load")
        .select("date, total_load_score, breakdown")
        .eq("user_id", session.user.id)
        .gte("date", startStr)
        .lte("date", todayStr)
        .order("date", { ascending: true });
      if (error) {
        const { data: fallback, error: fallbackErr } = await supabase
          .from("daily_load")
          .select("date, total_load_score")
          .eq("user_id", session.user.id)
          .gte("date", startStr)
          .lte("date", todayStr)
          .order("date", { ascending: true });
        if (fallbackErr) throw fallbackErr;
        return ((fallback ?? []) as DailyLoadWithBreakdown[]).map((r) => ({ ...r, breakdown: null }));
      }
      return (data ?? []) as DailyLoadWithBreakdown[];
    },
    staleTime: 60_000,
  });
}
