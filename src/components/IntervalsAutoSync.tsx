import { useEffect, useRef } from "react";
import { useIntervalsIntegration } from "@/hooks/useIntervalsIntegration";
import { useIntervalsSync } from "@/hooks/useIntervalsSync";

/**
 * Triggers intervals.icu quick sync on app load/refresh when connected.
 * Only fetches yesterday + today (fast when you've already synced all historical data).
 * Use "Sync Now" in Settings for a full sync.
 */
export function IntervalsAutoSync() {
  const { isConnected } = useIntervalsIntegration();
  const { runQuickSync } = useIntervalsSync();
  const hasRun = useRef(false);

  useEffect(() => {
    if (!isConnected || hasRun.current) return;
    hasRun.current = true;
    runQuickSync();
  }, [isConnected, runQuickSync]);

  return null;
}
