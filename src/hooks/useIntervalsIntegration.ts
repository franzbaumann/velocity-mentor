import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSafeAccessToken } from "@/lib/supabase-auth-safe";
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
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      if (!user) return null;
      const { data, error } = await supabase
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
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
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
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
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
    isConnected: !!integration?.api_key,
    save: saveMutation.mutate,
    isSaving: saveMutation.isPending,
    disconnect: disconnectMutation.mutate,
    disconnectAsync: disconnectMutation.mutateAsync,
  };
}

/** Normalize intervals.icu API response - array, object with nested array, or object keyed by date (wellness) */
function normalizeResponse(data: unknown, endpoint?: string): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const k of ["wellness", "activities", "data", "items"]) {
      const v = obj[k];
      if (Array.isArray(v)) return v as unknown[];
      // activities can be nested object: { activities: { "id1": {...}, "id2": {...} } }
      if (k === "activities" && v && typeof v === "object" && !Array.isArray(v)) {
        const inner = v as Record<string, unknown>;
        const arr: unknown[] = [];
        for (const [id, val] of Object.entries(inner)) {
          if (val && typeof val === "object") arr.push({ ...(val as Record<string, unknown>), id });
        }
        if (arr.length > 0) return arr;
      }
    }
    // intervals.icu wellness returns { "2025-03-05": { ctLoad, atl, ... }, ... } (CTL/ATL/TSB, HRV, sleep)
    if (endpoint === "wellness" && Object.keys(obj).length > 0) {
      const arr: unknown[] = [];
      for (const [key, val] of Object.entries(obj)) {
        if (val && typeof val === "object" && /^\d{4}-\d{2}-\d{2}$/.test(key)) {
          arr.push({ ...(val as Record<string, unknown>), id: key, date: key, calendarDate: key });
        }
      }
      if (arr.length > 0) return arr;
    }
    // activities: object with activity IDs as keys
    if (endpoint === "activities" && Object.keys(obj).length > 0) {
      const arr: unknown[] = [];
      for (const [id, val] of Object.entries(obj)) {
        if (val && typeof val === "object") arr.push({ ...(val as Record<string, unknown>), id });
      }
      if (arr.length > 0) return arr;
    }
  }
  return [];
}

const OLDEST_ACTIVITIES = "2018-01-01";

/** Fetch all activities. Proxy handles chunking (oldest=2018-01-01, newest=today). */
export function useIntervalsActivitiesChunked(enabled = true) {
  return useQuery({
    queryKey: ["intervals-activities-chunked"],
    queryFn: async () => {
      const token = await getSafeAccessToken();
      const newest = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase.functions.invoke("intervals-proxy", {
        headers: { Authorization: `Bearer ${token}` },
        body: { endpoint: "activities", oldest: OLDEST_ACTIVITIES, newest },
      });
      if (data && typeof data === "object" && "error" in data) throw new Error((data as { error: string }).error);
      if (error) throw error;
      return Array.isArray(data) ? data : normalizeResponse(data, "activities");
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnMount: "always",
  });
}

const OLDEST_5Y = (() => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 5);
  return d.toISOString().slice(0, 10);
})();
const NEWEST = new Date().toISOString().slice(0, 10);

export function useIntervalsData(endpoint: string, oldest: string, newest: string, enabled = true) {
  return useQuery({
    queryKey: ["intervals-data", endpoint, oldest, newest],
    queryFn: async () => {
      const token = await getSafeAccessToken();
      const { data, error } = await supabase.functions.invoke("intervals-proxy", {
        headers: { Authorization: `Bearer ${token}` },
        body: { endpoint, oldest, newest },
      });
      // Proxy returns { error: string } on failure - check data first for clearer messages
      if (data && typeof data === "object" && "error" in data) {
        throw new Error((data as { error: string }).error);
      }
      if (error) {
        // Extract message from function error response body when available
        const err = error as { context?: { json?: () => Promise<{ error?: string }> } };
        if (typeof err?.context?.json === "function") {
          try {
            const body = await err.context.json();
            if (body?.error) throw new Error(body.error);
          } catch {
            /* not JSON or missing error field — fall through */
          }
        }
        throw error;
      }
      return normalizeResponse(data, endpoint);
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: endpoint === "activities" ? 2 : 1,
    refetchOnMount: endpoint === "activities" ? "always" : true,
  });
}
