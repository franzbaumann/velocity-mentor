import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../shared/supabase";
import { useAppleHealth } from "./useAppleHealth";
import { syncAppleHealthActivities, syncAppleHealthWellness } from "../lib/appleHealth";

export const APPLE_HEALTH_SYNC_STORAGE_KEY = "apple_health_last_sync";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

async function runAppleHealthSync(
  queryClient: ReturnType<typeof useQueryClient>,
  skipThrottle = false,
): Promise<{ activities: number; wellness: number } | null> {
  if (!skipThrottle) {
    const raw = await AsyncStorage.getItem(APPLE_HEALTH_SYNC_STORAGE_KEY);
    const lastSync = raw ? parseInt(raw, 10) : 0;
    const oneDayAgo = Date.now() - ONE_DAY_MS;
    if (Number.isFinite(lastSync) && lastSync >= oneDayAgo) {
      console.log("[AppleHealthSync] skipping — synced recently");
      return null;
    }
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return null;

  const [activities, wellness] = await Promise.all([
    syncAppleHealthActivities(user.id, supabase),
    syncAppleHealthWellness(user.id, supabase),
  ]);

  console.log(`[AppleHealthSync] synced ${activities} activities, ${wellness} wellness days`);

  await AsyncStorage.setItem(APPLE_HEALTH_SYNC_STORAGE_KEY, String(Date.now()));

  const refetchOpts = { refetchType: "all" as const };
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["activities-dashboard"], ...refetchOpts }),
    queryClient.invalidateQueries({ queryKey: ["daily_readiness-dashboard"], ...refetchOpts }),
  ]);

  return { activities, wellness };
}

/**
 * Triggers a silent Apple Health sync on app open when permission is granted.
 * Runs at most once per 24 hours automatically.
 * Returns syncNow() for manual on-demand sync.
 */
export function useAppleHealthSync(): { syncing: boolean; syncNow: () => Promise<void> } {
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
        await runAppleHealthSync(queryClient, false);
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

  const syncNow = useCallback(async () => {
    if (Platform.OS !== "ios" || !kitAvailable || !hasBeenPrompted) return;
    if (syncInProgress.current) return;
    syncInProgress.current = true;
    setSyncing(true);
    try {
      await AsyncStorage.removeItem(APPLE_HEALTH_SYNC_STORAGE_KEY);
      await runAppleHealthSync(queryClient, true);
    } catch (err) {
      console.warn("[AppleHealthSync] syncNow error:", err instanceof Error ? err.message : err);
    } finally {
      syncInProgress.current = false;
      setSyncing(false);
    }
  }, [kitAvailable, hasBeenPrompted, queryClient]);

  return { syncing, syncNow };
}
