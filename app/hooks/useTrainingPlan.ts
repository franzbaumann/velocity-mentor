import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";
import Toast from "react-native-toast-message";
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "../shared/supabase";

const COACH_CHAT_URL = `${SUPABASE_URL}/functions/v1/coach-chat`;

async function triggerNutritionMessage(sessionId: string): Promise<void> {
  const { data: session } = await supabase
    .from("training_session")
    .select("session_type, distance_km, duration_min, description")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return;

  const {
    data: { session: authSession },
  } = await supabase.auth.getSession();
  if (!authSession?.access_token) return;

  const workoutSummary = [
    session.session_type,
    session.distance_km ? `${session.distance_km}km` : "",
    session.duration_min ? `${session.duration_min}min` : "",
    session.description,
  ]
    .filter(Boolean)
    .join(" · ");

  const nutritionPrompt = `The athlete just completed this workout: ${workoutSummary}. As a sports nutritionist, calculate exact recovery nutrition needs and recommend specific foods with quantities. Be specific: '2 bananas + 300g rice + 500ml chocolate milk' not general advice. Include: immediate recovery (0-30 min), main meal (1-2 hours), and hydration.`;

  try {
    const res = await fetch(COACH_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY } : {}),
        Authorization: `Bearer ${authSession.access_token}`,
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: nutritionPrompt }],
        trigger: "nutrition",
      }),
    });
    if (!res.ok) return;

    let fullText = "";
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
      }
    }

    if (fullText.trim()) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("coach_message").insert({
          user_id: user.id,
          role: "assistant",
          content: fullText.trim(),
          message_type: "nutrition",
          trigger: "workout_completed",
        });
      }
    }
  } catch {
    // Nutrition message is best-effort
  }
}

type TrainingPlanRow = {
  id: string;
  plan_name?: string | null;
  philosophy?: string | null;
  race_type?: string | null;
  goal_date?: string | null;
  race_date?: string | null;
  goal_time?: string | null;
  target_time?: string | null;
  is_active?: boolean | null;
  start_date?: string | null;
  end_date?: string | null;
  goal_race?: string | null;
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
  completed_activity_id?: string | null;
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
    .select(
      "id, plan_name, philosophy, race_type, goal_date, race_date, goal_time, target_time, is_active, start_date, end_date, goal_race",
    )
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<TrainingPlanRow>();

  if (planErr || !planRow) return null;

  const { data: weeks, error: weeksErr } = await supabase
    .from("training_week")
    .select("id, plan_id, week_number, start_date, notes")
    .eq("plan_id", planRow.id)
    .order("week_number", { ascending: true });

  if (!weeksErr && weeks?.length) {
    const weekRows = weeks as any[];
    const weekIds = weekRows.map((w) => w.id as string);

    const { data: allSessions } = await supabase
      .from("training_session")
      .select(
        "id, week_id, scheduled_date, session_type, description, distance_km, duration_min, pace_target, notes, target_hr_zone, completed_at, tss_estimate, completed_activity_id",
      )
      .in("week_id", weekIds)
      .order("week_id", { ascending: true })
      .order("order_index", { ascending: true });

    const sessionsByWeek = new Map<string, any[]>();
    for (const s of (allSessions ?? []) as any[]) {
      const wid = s.week_id as string;
      const list = sessionsByWeek.get(wid) ?? [];
      list.push(s);
      sessionsByWeek.set(wid, list);
    }

    const weeksWithSessions: TrainingPlanWeek[] = weekRows.map((w) => {
      const raw = (sessionsByWeek.get(w.id as string) ?? []) as any[];
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
        tss_estimate: (s as { tss_estimate?: number | null }).tss_estimate ?? null,
        completed_activity_id: (s as { completed_activity_id?: string | null }).completed_activity_id ?? null,
        supportsCoachNote: false,
      }));

      const total_km = sess.reduce((sum, x) => sum + (x.distance_km ?? 0), 0);

      return {
        id: w.id as string,
        week_number: w.week_number as number,
        start_date: w.start_date as string,
        phase: (w as { notes?: string | null }).notes ?? undefined,
        total_km,
        sessions: sess,
      };
    });

    return { plan: planRow, weeks: weeksWithSessions };
  }

  const { data: workouts } = await supabase
    .from("training_plan_workout")
    .select(
      "id, plan_id, date, week_number, phase, type, description, name, distance_km, duration_minutes, target_pace, key_focus, target_hr_zone, tss_estimate, completed, coach_note, notes",
    )
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
      Toast.show({ type: "success", text1: "Session rescheduled ✓", position: "bottom" });
    },
    onError: (e: any) => {
      Toast.show({ type: "error", text1: e?.message ?? "Failed to move session", position: "bottom" });
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
    onSuccess: (_, { sessionId, done }) => {
      queryClient.invalidateQueries({ queryKey: ["training-plan"] });
      if (done) {
        Toast.show({ type: "success", text1: "Session marked complete ✓", position: "bottom" });
        triggerNutritionMessage(sessionId).catch(() => {});
      }
    },
    onError: (e: any) => {
      Toast.show({ type: "error", text1: e?.message ?? "Failed to update session", position: "bottom" });
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

