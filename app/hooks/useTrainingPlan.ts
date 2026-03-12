import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";
import { supabase } from "../shared/supabase";

type TrainingPlanRow = {
  id: string;
  plan_name?: string | null;
  philosophy?: string | null;
  race_type?: string | null;
  goal_date?: string | null;
  race_date?: string | null;
  goal_time?: string | null;
  target_time?: string | null;
};

export type TrainingPlanSession = {
  id: string;
  scheduled_date: string | null;
  session_type: string;
  description: string;
  distance_km: number | null;
  duration_min: number | null;
  pace_target: string | null;
  key_focus: string | null;
  target_hr_zone: number | null;
  tss_estimate?: number | null;
  completed_at: string | null;
  coach_note?: string | null;
  adjustment_notes?: string | null;
  supportsCoachNote?: boolean;
};

export type TrainingPlanWeek = {
  id: string;
  week_number: number;
  start_date: string;
  phase?: string;
  total_km?: number;
  sessions: TrainingPlanSession[];
};

export type TrainingPlanData = {
  plan: TrainingPlanRow;
  weeks: TrainingPlanWeek[];
} | null;

async function loadTrainingPlan(): Promise<TrainingPlanData> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: planRow, error: planErr } = await supabase
    .from("training_plan")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<TrainingPlanRow>();

  if (planErr || !planRow) return null;

  const { data: weeks, error: weeksErr } = await supabase
    .from("training_week")
    .select("*")
    .eq("plan_id", planRow.id)
    .order("week_number", { ascending: true });

  if (!weeksErr && weeks?.length) {
    const weeksWithSessions: TrainingPlanWeek[] = [];

    for (const w of weeks as any[]) {
      const { data: sessions } = await supabase
        .from("training_session")
        .select("*")
        .eq("week_id", w.id)
        .order("order_index", { ascending: true });

      const raw = (sessions ?? []) as any[];
      const sess: TrainingPlanSession[] = raw.map((s) => ({
        id: s.id,
        scheduled_date: s.scheduled_date,
        session_type: s.session_type ?? "easy",
        description: s.description ?? "",
        distance_km: s.distance_km,
        duration_min: s.duration_min,
        pace_target: s.pace_target,
        key_focus: s.notes ?? null,
        target_hr_zone: (s as { target_hr_zone?: number }).target_hr_zone ?? null,
        completed_at: (s as { completed_at?: string | null }).completed_at ?? null,
        supportsCoachNote: false,
      }));

      const total_km = sess.reduce((sum, x) => sum + (x.distance_km ?? 0), 0);

      weeksWithSessions.push({
        id: w.id as string,
        week_number: w.week_number as number,
        start_date: w.start_date as string,
        phase: (w as { notes?: string | null }).notes ?? undefined,
        total_km,
        sessions: sess,
      });
    }

    return { plan: planRow, weeks: weeksWithSessions };
  }

  const { data: workouts } = await supabase
    .from("training_plan_workout")
    .select("*")
    .eq("plan_id", planRow.id)
    .order("date", { ascending: true });

  if (!workouts?.length) {
    return { plan: planRow, weeks: [] };
  }

  const weekMap = new Map<
    number,
    {
      id: string;
      week_number: number;
      start_date: string;
      phase?: string;
      total_km?: number;
      sessions: TrainingPlanSession[];
    }
  >();

  for (const w of workouts as any[]) {
    const wn = (w.week_number as number | null) ?? 1;
    if (!weekMap.has(wn)) {
      const start = w.date ? new Date(w.date as string) : new Date();
      const mon = new Date(start);
      const day = mon.getDay() || 7;
      mon.setDate(mon.getDate() - day + 1);
      weekMap.set(wn, {
        id: `workout_${wn}`,
        week_number: wn,
        start_date: mon.toISOString().slice(0, 10),
        phase: (w.phase as string | null) ?? undefined,
        sessions: [],
      });
    }
    const rec = weekMap.get(wn)!;
    rec.sessions.push({
      id: w.id as string,
      scheduled_date: (w.date as string | null) ?? null,
      session_type: (w.type as string | null) ?? "easy",
      description: (w.description as string | null) ?? (w.name as string | null) ?? "",
      distance_km: (w.distance_km as number | null) ?? null,
      duration_min: (w.duration_minutes as number | null) ?? null,
      pace_target: (w.target_pace as string | null) ?? null,
      key_focus: (w.key_focus as string | null) ?? null,
      target_hr_zone: (w.target_hr_zone as number | null) ?? null,
      tss_estimate: (w.tss_estimate as number | null) ?? null,
      completed_at: (w.completed as boolean | null)
        ? ((w.date as string | null)
            ? `${w.date as string}T12:00:00Z`
            : new Date().toISOString())
        : null,
      coach_note: (w.coach_note as string | null) ?? null,
      adjustment_notes: (w.notes as string | null) ?? null,
      supportsCoachNote: true,
    });
  }

  for (const rec of weekMap.values()) {
    rec.total_km = rec.sessions.reduce(
      (sum, x) => sum + (x.distance_km ?? 0),
      0,
    );
  }

  const weeksWithSessions = Array.from(weekMap.values()).sort(
    (a, b) => a.week_number - b.week_number,
  );

  return { plan: planRow, weeks: weeksWithSessions };
}

export function useTrainingPlan() {
  const queryClient = useQueryClient();

  const { data: plan, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ["training-plan"],
    queryFn: loadTrainingPlan,
  });

  const rescheduleMutation = useMutation({
    mutationFn: async ({
      sessionId,
      newDate,
    }: {
      sessionId: string;
      newDate: string;
    }) => {
      const { error: sessionErr } = await supabase
        .from("training_session")
        .update({ scheduled_date: newDate })
        .eq("id", sessionId);
      if (!sessionErr) return;

      const { error: workoutErr } = await supabase
        .from("training_plan_workout")
        .update({ date: newDate })
        .eq("id", sessionId);

      if (workoutErr) {
        throw workoutErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training-plan"] });
    },
    onError: (e: any) => {
      Alert.alert("Failed to move session", e?.message ?? "Unknown error");
    },
  });

  const markDoneMutation = useMutation({
    mutationFn: async ({
      sessionId,
      done,
    }: {
      sessionId: string;
      done: boolean;
    }) => {
      const { error: sessionErr } = await supabase
        .from("training_session")
        .update({ completed_at: done ? new Date().toISOString() : null })
        .eq("id", sessionId);
      if (!sessionErr) return { sessionId, done };

      const { error: workoutErr } = await supabase
        .from("training_plan_workout")
        .update({ completed: done })
        .eq("id", sessionId);

      if (workoutErr) {
        throw workoutErr;
      }

      return { sessionId, done };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training-plan"] });
    },
    onError: (e: any) => {
      Alert.alert("Failed to update session", e?.message ?? "Unknown error");
    },
  });

  return {
    plan,
    isLoading,
    isRefetching,
    refetch,
    rescheduleSession: rescheduleMutation.mutate,
    isRescheduling: rescheduleMutation.isPending,
    markSessionDone: markDoneMutation.mutate,
    isMarkingDone: markDoneMutation.isPending,
  };
}

