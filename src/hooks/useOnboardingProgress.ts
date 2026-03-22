import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type OnboardingProgress = Database["public"]["Tables"]["onboarding_progress"]["Row"];

type ProgressFields = Partial<
  Omit<Database["public"]["Tables"]["onboarding_progress"]["Update"], "user_id">
>;

export function useOnboardingProgress() {
  const queryClient = useQueryClient();

  const { data: progress, isLoading } = useQuery({
    queryKey: ["onboarding_progress"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return null;
      const { data, error } = await supabase
        .from("onboarding_progress")
        .select("*")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 30_000,
  });

  const upsertMutation = useMutation({
    mutationFn: async (fields: ProgressFields) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("onboarding_progress")
        .upsert(
          { user_id: session.user.id, ...fields },
          { onConflict: "user_id" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding_progress"] });
    },
  });

  const markStep = useCallback(
    (step: number, fields?: ProgressFields) => {
      upsertMutation.mutate({
        step_completed: step,
        ...fields,
      });
    },
    [upsertMutation]
  );

  return { progress, isLoading, markStep, isSaving: upsertMutation.isPending };
}
