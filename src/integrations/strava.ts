import { supabase } from "@/integrations/supabase/client";
import { addDays, format, startOfWeek } from "date-fns";
import { isRunningActivity } from "@/lib/analytics";

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

/** Calendar week Mon–Sun in local TZ, aligned with dashboard week volume */
export async function getWeekStats() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const today = new Date();
  const mon = startOfWeek(today, { weekStartsOn: 1 });
  const sun = addDays(mon, 6);
  const monStr = format(mon, "yyyy-MM-dd");
  const sunStr = format(sun, "yyyy-MM-dd");
  const { data } = await supabase
    .from("activity")
    .select("distance_km, duration_seconds, type")
    .eq("user_id", session.user.id)
    .gte("date", monStr)
    .lte("date", sunStr);
  if (!data) return null;
  const runs = data.filter((a) => isRunningActivity(a.type));
  const totalKm = runs.reduce((sum, a) => sum + (a.distance_km ?? 0), 0);
  return { actualKm: Math.round(totalKm * 10) / 10, runs: runs.length };
}
