import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../shared/supabase";
import { useAppleHealth } from "./useAppleHealth";
import { syncAppleHealthActivities, syncAppleHealthWellness, syncAppleHealthStreams } from "../lib/appleHealth";

export const APPLE_HEALTH_SYNC_STORAGE_KEY = "apple_health_last_sync";

export interface AppleHealthSyncResult {
  activitiesFound: number;
  activities: number;
  wellness: number;
  streams: number;
  errors: string[];
}

async function runAppleHealthSync(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<AppleHealthSyncResult> {
  const result: AppleHealthSyncResult = { activitiesFound: 0, activities: 0, wellness: 0, streams: 0, errors: [] };

  console.log("[AppleHealthSync] starting sync…");

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) {
    console.warn("[AppleHealthSync] no session — user not logged in");
    result.errors.push("Not logged in");
    return result;
  }
  console.log("[AppleHealthSync] user:", user.id.slice(0, 8));

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

  // Run each sync step independently — one failure should not kill the others
  // Activities
  try {
    console.log("[AppleHealthSync] syncing activities…");
    const activitiesResult = await syncAppleHealthActivities(user.id, supabase, userMaxHr);
    result.activitiesFound = activitiesResult.found;
    result.activities = activitiesResult.synced;
    console.log(`[AppleHealthSync] activities: found=${activitiesResult.found} synced=${activitiesResult.synced}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[AppleHealthSync] activities error:", msg);
    result.errors.push(`Activities: ${msg}`);
  }

  // Wellness
  try {
    console.log("[AppleHealthSync] syncing wellness…");
    result.wellness = await syncAppleHealthWellness(user.id, supabase);
    console.log(`[AppleHealthSync] wellness: ${result.wellness} days`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[AppleHealthSync] wellness error:", msg);
    result.errors.push(`Wellness: ${msg}`);
  }

  // HR streams (after activities so DB rows exist for foreign keys)
  try {
    console.log("[AppleHealthSync] syncing streams…");
    result.streams = await syncAppleHealthStreams(user.id, supabase, userMaxHr);
    console.log(`[AppleHealthSync] streams: ${result.streams}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[AppleHealthSync] streams error:", msg);
    result.errors.push(`Streams: ${msg}`);
  }

  console.log(`[AppleHealthSync] done — activities=${result.activities} wellness=${result.wellness} streams=${result.streams} errors=${result.errors.length}`);

  await AsyncStorage.setItem(APPLE_HEALTH_SYNC_STORAGE_KEY, String(Date.now()));

  const refetchOpts = { refetchType: "all" as const };
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["activities-dashboard"], ...refetchOpts }),
    queryClient.invalidateQueries({ queryKey: ["daily_readiness-dashboard"], ...refetchOpts }),
    queryClient.invalidateQueries({ queryKey: ["activities"], ...refetchOpts }),
    queryClient.invalidateQueries({ queryKey: ["activity-streams"], ...refetchOpts }),
  ]);

  return result;
}

/**
 * Triggers a silent Apple Health sync on every app open when permission is granted.
 * Returns syncNow() for manual on-demand sync.
 */
export function useAppleHealthSync(): {
  syncing: boolean;
  lastResult: AppleHealthSyncResult | null;
  syncNow: () => Promise<AppleHealthSyncResult | null>;
} {
  const { kitAvailable, hasBeenPrompted, loading } = useAppleHealth();
  const queryClient = useQueryClient();
  const syncInProgress = useRef(false);
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<AppleHealthSyncResult | null>(null);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    if (loading) {
      console.log("[AppleHealthSync] waiting for health kit check…");
      return;
    }
    if (!kitAvailable) {
      console.log("[AppleHealthSync] HealthKit not available on this device");
      return;
    }
    if (!hasBeenPrompted) {
      console.log("[AppleHealthSync] HealthKit not yet authorized — skipping auto-sync");
      return;
    }

    let cancelled = false;

    (async () => {
      if (syncInProgress.current) {
        console.log("[AppleHealthSync] sync already in progress — skipping");
        return;
      }
      syncInProgress.current = true;
      try {
        const r = await runAppleHealthSync(queryClient);
        if (!cancelled) setLastResult(r);
      } catch (err) {
        if (!cancelled) {
          console.warn("[AppleHealthSync] top-level error:", err instanceof Error ? err.message : err);
        }
      } finally {
        syncInProgress.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [kitAvailable, hasBeenPrompted, loading, queryClient]);

  const syncNow = useCallback(async (): Promise<AppleHealthSyncResult | null> => {
    if (Platform.OS !== "ios" || !kitAvailable || !hasBeenPrompted) return null;
    if (syncInProgress.current) return null;
    syncInProgress.current = true;
    setSyncing(true);
    try {
      const r = await runAppleHealthSync(queryClient);
      setLastResult(r);
      return r;
    } catch (err) {
      console.warn("[AppleHealthSync] syncNow error:", err instanceof Error ? err.message : err);
      return null;
    } finally {
      syncInProgress.current = false;
      setSyncing(false);
    }
  }, [kitAvailable, hasBeenPrompted, queryClient]);

  return { syncing, lastResult, syncNow };
}
