import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../shared/supabase";

type IntervalsIntegration = {
  athlete_id: string | null;
  api_key: string | null;
};

export function useIntervalsIntegration() {
  const queryClient = useQueryClient();
  let lastError: string | null = null;

  const { data: integration, isLoading, error: loadError } = useQuery({
    queryKey: ["intervals-integration"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Sign in to connect intervals.icu.");
      }
      const { data, error } = await supabase
        .from("integrations")
        .select("athlete_id, api_key")
        .eq("user_id", user.id)
        .eq("provider", "intervals_icu")
        .maybeSingle();
      if (error) throw error;
      return (data as IntervalsIntegration) ?? null;
    },
    retry: 0,
  });

  if (loadError instanceof Error) {
    lastError = loadError.message;
  }

  const saveMutation = useMutation({
    mutationFn: async ({ athleteId, apiKey }: { athleteId: string; apiKey: string }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in to save intervals.icu settings.");
      const cleanAthlete = athleteId.trim();
      // Intervals UI sometimes shows athlete IDs like "i401784".
      // Backend expects digits for /athlete/{id}. Treat athlete_id as optional.
      const digitsOnly = cleanAthlete.replace(/\D/g, "");
      const safeAthlete = digitsOnly || "0";
      const { error } = await supabase
        .from("integrations")
        .upsert(
          {
            user_id: user.id,
            provider: "intervals_icu",
            athlete_id: safeAthlete,
            api_key: apiKey,
          },
          { onConflict: "user_id,provider" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      lastError = null;
      queryClient.invalidateQueries({ queryKey: ["intervals-integration"] });
    },
    onError: (e) => {
      if (e instanceof Error) {
        lastError = e.message;
      }
      // also log for debugging
      console.error("[intervals] save error", e);
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in to disconnect intervals.icu.");
      const { error } = await supabase
        .from("integrations")
        .delete()
        .eq("user_id", user.id)
        .eq("provider", "intervals_icu");
      if (error) throw error;
    },
    onSuccess: () => {
      lastError = null;
      queryClient.invalidateQueries({ queryKey: ["intervals-integration"] });
    },
    onError: (e) => {
      if (e instanceof Error) {
        lastError = e.message;
      }
      console.error("[intervals] disconnect error", e);
    },
  });

  const errorMessage =
    lastError ??
    (saveMutation.error instanceof Error
      ? saveMutation.error.message
      : disconnectMutation.error instanceof Error
      ? disconnectMutation.error.message
      : null);

  return {
    integration,
    isLoading,
    isConnected: !!integration?.api_key,
    save: saveMutation.mutate,
    isSaving: saveMutation.isPending,
    disconnect: disconnectMutation.mutate,
    disconnectAsync: disconnectMutation.mutateAsync,
    errorMessage,
  };
}

