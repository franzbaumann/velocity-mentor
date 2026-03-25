import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { resolveWorkoutVolumeForDisplay } from "@/lib/training/librarySessionVolume";
import { resolveSessionStructureForWorkout } from "@/lib/training/sessionStructureUi";

async function triggerNutritionMessage(sessionId: string): Promise<void> {
  const { data: session } = await supabase.from("training_session").select("*").eq("id", sessionId).maybeSingle();
  if (!session) return;

  const { data: { session: authSession } } = await supabase.auth.getSession();
  if (!authSession?.access_token) return;

  const workoutSummary = [
    session.session_type,
    session.distance_km ? `${session.distance_km}km` : "",
    session.duration_min ? `${session.duration_min}min` : "",
    session.description,
  ].filter(Boolean).join(" · ");

  const nutritionPrompt = `The athlete just completed this workout: ${workoutSummary}. As a sports nutritionist, calculate exact recovery nutrition needs and recommend specific foods with quantities. Be specific: '2 bananas + 300g rice + 500ml chocolate milk' not general advice. Include: immediate recovery (0-30 min), main meal (1-2 hours), and hydration.`;

  try {
    const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/coach-chat`;
    const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
    const res = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apikey ? { apikey } : {}),
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
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user ?? null;
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

export function useTrainingPlan() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: plan, isLoading } = useQuery({
    queryKey: ["training-plan"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      if (!user) return null;
      const { data: planRow, error: planErr } = await supabase
        .from("training_plan")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (planErr || !planRow) return null;

      const { data: weeks, error: weeksErr } = await supabase
        .from("training_week")
        .select("*")
        .eq("plan_id", planRow.id)
        .order("week_number", { ascending: true });

      if (weeksErr) return { plan: planRow, weeks: [] };

      if (weeks?.length) {
        const weeksWithSessions = await Promise.all(
          weeks.map(async (w) => {
            const { data: sessions } = await supabase
              .from("training_session")
              .select("*")
              .eq("week_id", w.id)
              .order("order_index", { ascending: true });
            const raw = sessions ?? [];
            const sess = raw.map((s) => ({
              id: s.id,
              scheduled_date: s.scheduled_date,
              session_type: s.session_type ?? "easy",
              description: s.description ?? "",
              distance_km: s.distance_km,
              duration_min: s.duration_min,
              pace_target: s.pace_target,
              key_focus: s.notes ?? null,
              target_hr_zone: (s as { target_hr_zone?: number }).target_hr_zone ?? null,
              completed_at: (s as { completed_at?: string }).completed_at ?? null,
              status: (s as { status?: string }).status ?? null,
              effort_rating: (s as { effort_rating?: string }).effort_rating ?? null,
              supportsCoachNote: false, // from training_session, no coach_note support
            }));
            const total_km = sess.reduce((s, x) => s + (x.distance_km ?? 0), 0);
            return { ...w, sessions: sess, total_km, phase: w.notes ?? undefined };
          })
        );
        return { plan: planRow, weeks: weeksWithSessions };
      }

      const { data: workouts } = await supabase
        .from("training_plan_workout")
        .select("*")
        .eq("plan_id", planRow.id)
        .order("date", { ascending: true });
      if (!workouts?.length) return { plan: planRow, weeks: [] };

      const weekMap = new Map<number, { id: string; week_number: number; start_date: string; phase?: string; total_km?: number; sessions: unknown[] }>();
      for (const w of workouts) {
        const wn = w.week_number ?? 1;
        if (!weekMap.has(wn)) {
          const start = w.date ? new Date(w.date) : new Date();
          const mon = new Date(start);
          mon.setDate(mon.getDate() - (mon.getDay() || 7) + 1);
          weekMap.set(wn, {
            id: `workout_${wn}`,
            week_number: wn,
            start_date: mon.toISOString().slice(0, 10),
            phase: w.phase ?? undefined,
            sessions: [],
          });
        }
        const rec = weekMap.get(wn)!;
        const row = w as {
          session_structure?: unknown;
          structure_json?: unknown;
          pace_guidance_json?: unknown;
          primary_metric?: string | null;
          control_tool?: string | null;
          why_this_session?: string | null;
          session_library_id?: string | null;
        };
        const vol = resolveWorkoutVolumeForDisplay({
          distance_km: w.distance_km,
          duration_minutes: w.duration_minutes,
          session_library_id: row.session_library_id ?? null,
        });
        rec.sessions.push({
          id: w.id,
          scheduled_date: w.date,
          session_type: w.type ?? "easy",
          name: (w as { name?: string | null }).name ?? null,
          description: w.description ?? w.name ?? "",
          distance_km: vol.distanceKm,
          duration_min: vol.durationMin,
          pace_target: w.target_pace,
          key_focus: w.key_focus ?? null,
          target_hr_zone: w.target_hr_zone ?? null,
          tss_estimate: w.tss_estimate ?? null,
          completed_at: (w as { completed_at?: string }).completed_at ?? (w.completed ? (w.date ? `${w.date}T12:00:00Z` : new Date().toISOString()) : null),
          status: (w as { status?: string }).status ?? (w.completed ? "completed" : "scheduled"),
          effort_rating: (w as { effort_rating?: string }).effort_rating ?? null,
          coach_note: (w as { coach_note?: string | null }).coach_note ?? null,
          adjustment_notes: (w as { notes?: string | null }).notes ?? null,
          workout_steps: (w as { workout_steps?: unknown }).workout_steps ?? null,
          supportsCoachNote: true,
          week_number: w.week_number ?? null,
          phase: w.phase ?? null,
          session_structure: resolveSessionStructureForWorkout({
            session_structure: row.session_structure,
            structure_json: row.structure_json,
            pace_guidance_json: row.pace_guidance_json,
            primary_metric: row.primary_metric ?? null,
            control_tool: row.control_tool ?? null,
            why_this_session: row.why_this_session ?? null,
            coach_note: (w as { coach_note?: string | null }).coach_note ?? null,
            key_focus: w.key_focus ?? null,
            description: w.description ?? null,
            distance_km: vol.distanceKm,
            duration_minutes: vol.durationMin,
            target_pace: w.target_pace ?? null,
          }),
        });
      }
      for (const rec of weekMap.values()) {
        rec.total_km = (rec.sessions as { distance_km?: number }[]).reduce((s, x) => s + (x.distance_km ?? 0), 0);
      }
      const weeksWithSessions = Array.from(weekMap.values()).sort((a, b) => a.week_number - b.week_number);
      return { plan: planRow, weeks: weeksWithSessions };
    },
  });

  const rescheduleMutation = useMutation({
    mutationFn: async ({ sessionId, newDate }: { sessionId: string; newDate: string }) => {
      const { error: sessionErr } = await supabase
        .from("training_session")
        .update({ scheduled_date: newDate })
        .eq("id", sessionId);
      if (!sessionErr) return;
      const { error: workoutErr } = await supabase
        .from("training_plan_workout")
        .update({ date: newDate })
        .eq("id", sessionId);
      if (workoutErr) throw workoutErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training-plan"] });
      toast({ title: "Session moved", description: "Training plan updated." });
    },
    onError: (e) => {
      toast({ title: "Failed to move", description: e.message, variant: "destructive" });
    },
  });

  const markDoneMutation = useMutation({
    mutationFn: async ({ sessionId, done }: { sessionId: string; done: boolean }) => {
      const now = new Date().toISOString();
      const { data: updatedSessions, error: sessionErr } = await supabase
        .from("training_session")
        .update({
          completed_at: done ? now : null,
          status: done ? "completed" : "scheduled",
        } as never)
        .eq("id", sessionId)
        .select("id");
      if (!sessionErr && updatedSessions && updatedSessions.length > 0) return { sessionId, done };
      const { error: workoutErr } = await supabase
        .from("training_plan_workout")
        .update({
          completed: done,
          completed_at: done ? now : null,
          status: done ? "completed" : "scheduled",
        } as never)
        .eq("id", sessionId);
      if (workoutErr) throw workoutErr;
      return { sessionId, done };
    },
    onSuccess: async (_, { sessionId, done }) => {
      queryClient.invalidateQueries({ queryKey: ["training-plan"] });
      toast({ title: done ? "Session marked done" : "Session unchecked", description: "Training plan updated." });
      if (done) {
        triggerNutritionMessage(sessionId).catch(() => {});
      }
    },
    onError: (e) => {
      toast({ title: "Failed to update", description: e.message, variant: "destructive" });
    },
  });

  const skipMutation = useMutation({
    mutationFn: async ({ sessionId }: { sessionId: string }) => {
      const { data, error } = await supabase
        .from("training_session")
        .update({ status: "skipped" } as never)
        .eq("id", sessionId)
        .select("id");
      if (!error && data && data.length > 0) return;
      const { error: workoutErr } = await supabase
        .from("training_plan_workout")
        .update({ status: "skipped" } as never)
        .eq("id", sessionId);
      if (workoutErr) throw workoutErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training-plan"] });
    },
    onError: (e) => {
      toast({ title: "Failed to skip", description: e.message, variant: "destructive" });
    },
  });

  const effortMutation = useMutation({
    mutationFn: async ({ sessionId, effort }: { sessionId: string; effort: "easy" | "normal" | "hard" }) => {
      const { data, error } = await supabase
        .from("training_session")
        .update({ effort_rating: effort } as never)
        .eq("id", sessionId)
        .select("id");
      if (!error && data && data.length > 0) return;
      const { error: workoutErr } = await supabase
        .from("training_plan_workout")
        .update({ effort_rating: effort } as never)
        .eq("id", sessionId);
      if (workoutErr) throw workoutErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training-plan"] });
    },
    onError: (e) => {
      toast({ title: "Failed to save effort", description: e.message, variant: "destructive" });
    },
  });

  return {
    plan,
    isLoading,
    rescheduleSession: rescheduleMutation.mutate,
    isRescheduling: rescheduleMutation.isPending,
    markSessionDone: markDoneMutation.mutate,
    isMarkingDone: markDoneMutation.isPending,
    skipSession: skipMutation.mutate,
    updateEffort: effortMutation.mutate,
  };
}
