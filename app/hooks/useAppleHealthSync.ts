import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../shared/supabase";
import { useAppleHealth } from "./useAppleHealth";
import { syncAppleHealthActivities, syncAppleHealthWellness, syncAppleHealthStreams } from "../lib/appleHealth";

export const APPLE_HEALTH_SYNC_STORAGE_KEY = "apple_health_last_sync";

async function runAppleHealthSync(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<{ activitiesFound: number; activities: number; wellness: number; streams: number } | null> {

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return null;

  // Fetch user's max HR for accurate HR zone computation
  let userMaxHr: number | null = null;
  try {
    const { data: profile } = await supabase
      .from("athlete_profile")
      .select("max_hr")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profile?.max_hr) userMaxHr = Number(profile.max_hr);
  } catch {
    // Fall back to default (190)
  }

  const [activitiesResult, wellness] = await Promise.all([
    syncAppleHealthActivities(user.id, supabase, userMaxHr),
    syncAppleHealthWellness(user.id, supabase),
  ]);

  const { found: activitiesFound, synced: activities } = activitiesResult;

  // Sync HR streams after activities are upserted (streams reference activity UUIDs)
  const streams = await syncAppleHealthStreams(user.id, supabase, userMaxHr);

  console.log(`[AppleHealthSync] found ${activitiesFound} workouts in HealthKit, synced ${activities} activities, ${wellness} wellness days, ${streams} HR streams`);

  await AsyncStorage.setItem(APPLE_HEALTH_SYNC_STORAGE_KEY, String(Date.now()));

  const refetchOpts = { refetchType: "all" as const };
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["activities-dashboard"], ...refetchOpts }),
    queryClient.invalidateQueries({ queryKey: ["daily_readiness-dashboard"], ...refetchOpts }),
    queryClient.invalidateQueries({ queryKey: ["activities"], ...refetchOpts }),
    queryClient.invalidateQueries({ queryKey: ["activity-streams"], ...refetchOpts }),
  ]);

  return { activitiesFound, activities, wellness, streams };
}

/**
 * Triggers a silent Apple Health sync on every app open when permission is granted.
 * Returns syncNow() for manual on-demand sync.
 */
export function useAppleHealthSync(): { syncing: boolean; syncNow: () => Promise<{ activitiesFound: number; activities: number; wellness: number; streams: number } | null> } {
  const { kitAvailable, hasBeenPrompted, loading } = useAppleHealth();
  const queryClient = useQueryClient();
  const syncInProgress = useRef(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    if (loading) return;
    if (!kitAvailable || !hasBeenPrompted) return;

    let cancelled = false;

    (async () => {
      if (syncInProgress.current) return;
      syncInProgress.current = true;
      try {
        await runAppleHealthSync(queryClient);
      } catch (err) {
        if (!cancelled) {
          console.warn("[AppleHealthSync] error:", err instanceof Error ? err.message : err);
        }
      } finally {
        syncInProgress.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [kitAvailable, hasBeenPrompted, loading, queryClient]);

  const syncNow = useCallback(async (): Promise<{ activitiesFound: number; activities: number; wellness: number; streams: number } | null> => {
    if (Platform.OS !== "ios" || !kitAvailable || !hasBeenPrompted) return null;
    if (syncInProgress.current) return null;
    syncInProgress.current = true;
    setSyncing(true);
    try {
      return await runAppleHealthSync(queryClient);
    } catch (err) {
      console.warn("[AppleHealthSync] syncNow error:", err instanceof Error ? err.message : err);
      return null;
    } finally {
      syncInProgress.current = false;
      setSyncing(false);
    }
  }, [kitAvailable, hasBeenPrompted, queryClient]);

  return { syncing, syncNow };
}
