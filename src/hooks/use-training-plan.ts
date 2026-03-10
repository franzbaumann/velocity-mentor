import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
      const { data: { user } } = await supabase.auth.getUser();
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
      const { data: { user } } = await supabase.auth.getUser();
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
      if (weeksErr || !weeks?.length) return { plan: planRow, weeks: [] };

      const weeksWithSessions = await Promise.all(
        weeks.map(async (w) => {
          const { data: sessions } = await supabase
            .from("training_session")
            .select("*")
            .eq("week_id", w.id)
            .order("order_index", { ascending: true });
          return { ...w, sessions: sessions ?? [] };
        })
      );

      return {
        plan: planRow,
        weeks: weeksWithSessions,
      };
    },
  });

  const rescheduleMutation = useMutation({
    mutationFn: async ({ sessionId, newDate }: { sessionId: string; newDate: string }) => {
      const { error } = await supabase
        .from("training_session")
        .update({ scheduled_date: newDate })
        .eq("id", sessionId);
      if (error) throw error;
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
      const { error } = await supabase
        .from("training_session")
        .update({ completed_at: done ? new Date().toISOString() : null })
        .eq("id", sessionId);
      if (error) throw error;
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

  return {
    plan,
    isLoading,
    rescheduleSession: rescheduleMutation.mutate,
    isRescheduling: rescheduleMutation.isPending,
    markSessionDone: markDoneMutation.mutate,
    isMarkingDone: markDoneMutation.isPending,
  };
}
