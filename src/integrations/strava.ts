import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/** Sync activities from Strava via Edge Function (uses server-side token refresh) */
export async function syncStravaActivities(): Promise<number> {
  const { data: { session }, error: sessionError } = await supabase.auth.refreshSession();
  if (sessionError) throw new Error("Session expired. Sign out and sign back in.");
  if (!session?.access_token) throw new Error("Not logged in");

  const res = await fetch(`${SUPABASE_URL}/functions/v1/strava-sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: SUPABASE_ANON_KEY,
    },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = (data as { detail?: string; error?: string }).detail ?? (data as { error?: string }).error ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }

  if (data && typeof data === "object" && "error" in data) {
    const err = data as { error: string; detail?: string };
    throw new Error(err.detail ?? err.error ?? "Sync failed");
  }

  return (data as { synced?: number })?.synced ?? 0;
}

export async function getRecentActivities(limit = 10) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return [];
  const { data } = await supabase
    .from("activity")
    .select("*")
    .eq("user_id", session.user.id)
    .order("date", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function getWeekStats() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const monday = new Date();
  monday.setDate(monday.getDate() - monday.getDay() + 1);
  monday.setHours(0, 0, 0, 0);
  const { data } = await supabase
    .from("activity")
    .select("distance_km, duration_seconds")
    .eq("user_id", session.user.id)
    .gte("date", monday.toISOString().slice(0, 10));
  if (!data) return null;
  const totalKm = data.reduce((sum, a) => sum + (a.distance_km ?? 0), 0);
  return { actualKm: Math.round(totalKm * 10) / 10, runs: data.length };
}
