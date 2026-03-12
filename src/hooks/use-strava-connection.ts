import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface StravaConnection {
  connected: boolean;
  athleteName: string | null;
  athleteId: string | null;
  lastSyncAt: string | null;
  loading: boolean;
  error: string | null;
}

const STRAVA_CLIENT_ID = import.meta.env.VITE_STRAVA_CLIENT_ID as string;
const REDIRECT_URI = `${window.location.origin}/auth/strava/callback`;
const STRAVA_SCOPE = "read,activity:read_all";

export function buildStravaAuthUrl(): string {
  if (!STRAVA_CLIENT_ID || STRAVA_CLIENT_ID.trim() === "") {
    throw new Error("Strava Client ID not configured. Add VITE_STRAVA_CLIENT_ID to .env");
  }
  const params = new URLSearchParams({
    client_id: STRAVA_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    approval_prompt: "auto",
    scope: STRAVA_SCOPE,
  });
  return `https://www.strava.com/oauth/authorize?${params.toString()}`;
}

export function useStravaConnection() {
  const [state, setState] = useState<StravaConnection>({
    connected: false,
    athleteName: null,
    athleteId: null,
    lastSyncAt: null,
    loading: true,
    error: null,
  });

  const fetchConnection = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));

    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user ?? null;
    if (!user) {
      setState({ connected: false, athleteName: null, athleteId: null, lastSyncAt: null, loading: false, error: null });
      return;
    }

    const { data, error } = await supabase
      .from("oauth_connections")
      .select("athlete_name, athlete_id, last_sync_at")
      .eq("provider", "strava")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      setState((s) => ({ ...s, loading: false, error: error.message }));
      return;
    }

    setState({
      connected: !!data,
      athleteName: data?.athlete_name ?? null,
      athleteId: data?.athlete_id ?? null,
      lastSyncAt: data?.last_sync_at ?? null,
      loading: false,
      error: null,
    });
  }, []);

  useEffect(() => {
    fetchConnection();
  }, [fetchConnection]);

  const connectStrava = useCallback(() => {
    window.location.href = buildStravaAuthUrl();
  }, []);

  const disconnectStrava = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));

    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user ?? null;
    if (!user) return;

    const { error } = await supabase
      .from("oauth_tokens")
      .delete()
      .eq("provider", "strava")
      .eq("user_id", user.id);

    if (error) {
      setState((s) => ({ ...s, loading: false, error: error.message }));
      return;
    }

    setState({ connected: false, athleteName: null, athleteId: null, lastSyncAt: null, loading: false, error: null });
  }, []);

  return { ...state, connectStrava, disconnectStrava, refetch: fetchConnection };
}
