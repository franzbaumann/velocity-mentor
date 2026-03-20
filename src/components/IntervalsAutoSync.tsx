import { useEffect, useRef } from "react";
import { useIntervalsIntegration } from "@/hooks/useIntervalsIntegration";
import { supabase } from "@/integrations/supabase/client";
import { getSafeAccessToken } from "@/lib/supabase-auth-safe";

const LAST_QUICK_SYNC_KEY = "lastQuickSync";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Triggers a silent intervals.icu quick sync on app load when connected.
 * Runs at most once per 24 hours (tracked via localStorage).
 * No loading UI, no notifications. Use "Sync Now" in Settings for a full sync.
 */
export function IntervalsAutoSync() {
  const { isConnected } = useIntervalsIntegration();
  const hasRun = useRef(false);

  useEffect(() => {
    if (!isConnected || hasRun.current) return;
    hasRun.current = true;

    const lastSync = localStorage.getItem(LAST_QUICK_SYNC_KEY);
    const oneDayAgo = Date.now() - ONE_DAY_MS;
    if (lastSync && parseInt(lastSync, 10) >= oneDayAgo) return;

    void getSafeAccessToken()
      .then((token) =>
        supabase.functions.invoke("intervals-proxy", {
          headers: { Authorization: `Bearer ${token}` },
          body: { action: "quick_sync" },
        })
      )
      .then(() => {
        localStorage.setItem(LAST_QUICK_SYNC_KEY, String(Date.now()));
      })
      .catch(() => {
        // Silent fail — no toast, no UI
      });
  }, [isConnected]);

  return null;
}
