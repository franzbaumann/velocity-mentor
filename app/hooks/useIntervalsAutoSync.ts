import { useEffect, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase, callEdgeFunctionWithRetry } from "../shared/supabase";
import { useIntervalsIntegration } from "./useIntervalsIntegration";

const STORAGE_KEY = "intervals_last_quick_sync";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Triggers a silent intervals.icu quick sync on app open when connected.
 * Runs at most once per 24 hours (tracked via AsyncStorage).
 * No loading UI, no notifications. Use "Sync Now" in Settings for a full sync.
 */
export function useIntervalsAutoSync(): void {
  const { isConnected } = useIntervalsIntegration();
  const hasRun = useRef(false);

  useEffect(() => {
    if (!isConnected || hasRun.current) return;
    hasRun.current = true;

    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const lastSync = raw ? parseInt(raw, 10) : 0;
        const oneDayAgo = Date.now() - ONE_DAY_MS;
        if (Number.isFinite(lastSync) && lastSync >= oneDayAgo) return;
        if (cancelled) return;

        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token || cancelled) return;

        const resp = await callEdgeFunctionWithRetry({
          functionName: "intervals-proxy",
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: { action: "quick_sync" },
          timeoutMs: 60000,
          maxRetries: 1,
          logContext: "useIntervalsAutoSync:quick_sync",
        });

        if (cancelled) return;
        if (resp.error) {
          console.warn("[IntervalsAutoSync] quick_sync failed:", resp.error.message);
          return;
        }

        await AsyncStorage.setItem(STORAGE_KEY, String(Date.now()));
      } catch (err) {
        console.warn("[IntervalsAutoSync] quick_sync error:", err instanceof Error ? err.message : err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isConnected]);
}
