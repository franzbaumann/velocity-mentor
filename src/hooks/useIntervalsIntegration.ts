import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface IntervalsIntegration {
  athlete_id: string;
  api_key: string;
}

export function useIntervalsIntegration() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: integration, isLoading } = useQuery({
    queryKey: ["intervals-integration"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await (supabase as any)
        .from("integrations")
        .select("athlete_id, api_key")
        .eq("user_id", user.id)
        .eq("provider", "intervals_icu")
        .maybeSingle();
      if (error) throw error;
      return data as IntervalsIntegration | null;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async ({ athleteId, apiKey }: { athleteId: string; apiKey: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await (supabase as any)
        .from("integrations")
        .upsert(
          { user_id: user.id, provider: "intervals_icu", athlete_id: athleteId, api_key: apiKey },
          { onConflict: "user_id,provider" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["intervals-integration"] });
      queryClient.invalidateQueries({ queryKey: ["intervals-"] });
      toast({ title: "Saved", description: "intervals.icu credentials saved." });
    },
    onError: (e) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await (supabase as any)
        .from("integrations")
        .delete()
        .eq("user_id", user.id)
        .eq("provider", "intervals_icu");
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["intervals-integration"] });
      queryClient.invalidateQueries({ queryKey: ["intervals-"] });
      toast({ title: "Disconnected", description: "intervals.icu disconnected." });
    },
  });

  return {
    integration,
    isLoading,
    isConnected: !!integration?.athlete_id && !!integration?.api_key,
    save: saveMutation.mutate,
    isSaving: saveMutation.isPending,
    disconnect: disconnectMutation.mutate,
  };
}

export function useIntervalsData(endpoint: string, oldest: string, newest: string, enabled = true) {
  return useQuery({
    queryKey: ["intervals-data", endpoint, oldest, newest],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const { data, error } = await supabase.functions.invoke("intervals-proxy", {
        body: { endpoint, oldest, newest },
      });
      if (error) throw error;
      return data;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}
