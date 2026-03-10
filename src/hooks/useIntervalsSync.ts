import { useState, useCallback, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const POLL_INTERVAL_MS = 2000;

export interface SyncProgress {
  stage: string;
  detail: string;
  done: boolean;
  runsCount: number;
  wellnessDays: number;
  streamsProgress?: { done: number; total: number };
  ctl?: number;
  atl?: number;
  tsb?: number;
}

interface SyncProgressRow {
  stage?: string;
  detail?: string;
  done?: boolean;
  error?: string;
  activities_total?: number;
  activities_upserted?: number;
  streams_done?: number;
  streams_total?: number;
  intervals_count?: number;
  wellness_days?: number;
  pbs_count?: number;
  ctl?: number;
  atl?: number;
  tsb?: number;
}

function mapProgressRow(row: SyncProgressRow | null): SyncProgress {
  if (!row) {
    return { stage: "idle", detail: "", done: true, runsCount: 0, wellnessDays: 0 };
  }
  const runsCount = row.activities_total ?? row.activities_upserted ?? 0;
  const wellnessDays = row.wellness_days ?? 0;
  const streamsProgress =
    row.streams_total != null && row.streams_total > 0
      ? { done: row.streams_done ?? 0, total: row.streams_total }
      : undefined;
  return {
    stage: row.stage ?? "idle",
    detail: row.error ?? row.detail ?? "",
    done: row.done ?? false,
    runsCount,
    wellnessDays,
    streamsProgress,
    ctl: row.ctl,
    atl: row.atl,
    tsb: row.tsb,
  };
}

export function useIntervalsSync() {
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const queryClient = useQueryClient();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runSync = useCallback(async () => {
    setSyncing(true);
    setProgress({
      stage: "starting",
      detail: "Starting full sync — activities, streams, intervals, wellness, PBs...",
      done: false,
      runsCount: 0,
      wellnessDays: 0,
    });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setProgress({ stage: "error", detail: "Not signed in", done: true, runsCount: 0, wellnessDays: 0 });
        setSyncing(false);
        return;
      }

      const token = session.access_token;
      const invoke = (body: Record<string, unknown>) =>
        supabase.functions.invoke("intervals-proxy", {
          headers: { Authorization: `Bearer ${token}` },
          body,
        });

      const { data: startData, error: startError } = await invoke({ action: "start_sync" });

      if (startError) {
        const msg = startError.message ?? "Sync failed";
        const hint = msg.includes("Refresh Token") || msg.includes("401") || msg.includes("403")
          ? " Sign out and sign back in, then try again."
          : "";
        setProgress({ stage: "error", detail: msg + hint, done: true, runsCount: 0, wellnessDays: 0 });
        setSyncing(false);
        return;
      }

      const started = (startData as { started?: boolean; error?: string })?.started;
      const startErr = (startData as { started?: boolean; error?: string })?.error;
      if (!started) {
        const detail = startErr ?? "Failed to start sync";
        const hint = detail.includes("Access denied") || detail.includes("Unauthorized")
          ? " Check your intervals.icu API key in Settings → API and regenerate if needed."
          : "";
        setProgress({ stage: "error", detail: detail + hint, done: true, runsCount: 0, wellnessDays: 0 });
        setSyncing(false);
        return;
      }

      const poll = async () => {
        const { data, error } = await invoke({ action: "get_sync_progress" });
        if (error) return;
        const row = data as SyncProgressRow | null;
        const mapped = mapProgressRow(row);
        setProgress(mapped);

        if (mapped.done || mapped.stage === "error") {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          setSyncing(false);
          const refetchOpts = { refetchType: "all" as const };
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["activities"], ...refetchOpts }),
            queryClient.invalidateQueries({ queryKey: ["daily_readiness"], ...refetchOpts }),
            queryClient.invalidateQueries({ queryKey: ["intervals-activities-chunked"], ...refetchOpts }),
            queryClient.invalidateQueries({ queryKey: ["intervals-data"], ...refetchOpts }),
            queryClient.invalidateQueries({ queryKey: ["weekStats"], ...refetchOpts }),
            queryClient.invalidateQueries({ queryKey: ["athlete_profile"], ...refetchOpts }),
            queryClient.invalidateQueries({ queryKey: ["activityCount"], ...refetchOpts }),
            queryClient.invalidateQueries({ queryKey: ["personal_records"], ...refetchOpts }),
          ]);
        }
      };

      pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
      poll();
    } catch (e) {
      setProgress({
        stage: "error",
        detail: `Error: ${e instanceof Error ? e.message : String(e)}`,
        done: true,
        runsCount: 0,
        wellnessDays: 0,
      });
      setSyncing(false);
    }
  }, [queryClient]);

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  return { syncing, progress, runSync };
}
