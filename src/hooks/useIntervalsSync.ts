import { useState, useCallback, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const POLL_INTERVAL_MS = 2000;

export interface SyncProgress {
  stage: string;
  detail: string;
  done: boolean;
  runsCount: number;
  wellnessDays: number;
  streamsProgress?: { done: number; total: number };
  yearsCompleted?: Record<string, number>;
  updatedAt?: string;
  ctl?: number;
  atl?: number;
  tsb?: number;
  pbsCount?: number;
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
  years_completed?: Record<string, number>;
  updated_at?: string;
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
        let msg = startError.message ?? "Sync failed";
        if (startError instanceof FunctionsHttpError && startError.context) {
          try {
            const body = (await startError.context.json()) as { error?: string };
            if (body?.error) msg = String(body.error);
          } catch {
            // keep default msg
          }
        }
        const hint = msg.includes("Refresh Token") || msg.includes("401") || msg.includes("403")
          ? " Sign out and sign back in, then try again."
          : msg.includes("sync_progress") || msg.includes("migration")
          ? " Run Supabase migrations: supabase db push or apply migrations in Dashboard."
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
            queryClient.invalidateQueries({ queryKey: ["sync_progress"], ...refetchOpts }),
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

  const runQuickSync = useCallback(async () => {
    setSyncing(true);
    setProgress({
      stage: "quick_sync",
      detail: "Syncing last 30 days...",
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

      const { data, error } = await supabase.functions.invoke("intervals-proxy", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { action: "quick_sync" },
      });

      if (error) {
        let msg = error.message ?? "Quick sync failed";
        if (error instanceof FunctionsHttpError && error.context) {
          try {
            const body = (await error.context.json()) as { error?: string };
            if (body?.error) msg = String(body.error);
          } catch {
            // keep default
          }
        }
        setProgress({ stage: "error", detail: msg, done: true, runsCount: 0, wellnessDays: 0 });
        setSyncing(false);
        return;
      }

      const result = data as { done?: boolean; activities?: number; wellness?: number; error?: string } | null;
      if (result?.error) {
        setProgress({ stage: "error", detail: result.error, done: true, runsCount: 0, wellnessDays: 0 });
        setSyncing(false);
        return;
      }

      setProgress({
        stage: "done",
        detail: `Done — ${result?.activities ?? 0} activities, ${result?.wellness ?? 0} wellness days`,
        done: true,
        runsCount: result?.activities ?? 0,
        wellnessDays: result?.wellness ?? 0,
      });

      const refetchOpts = { refetchType: "all" as const };
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["activities"], ...refetchOpts }),
        queryClient.invalidateQueries({ queryKey: ["daily_readiness"], ...refetchOpts }),
        queryClient.invalidateQueries({ queryKey: ["intervals-activities-chunked"], ...refetchOpts }),
        queryClient.invalidateQueries({ queryKey: ["intervals-data"], ...refetchOpts }),
        queryClient.invalidateQueries({ queryKey: ["weekStats"], ...refetchOpts }),
        queryClient.invalidateQueries({ queryKey: ["athlete_profile"], ...refetchOpts }),
        queryClient.invalidateQueries({ queryKey: ["activityCount"], ...refetchOpts }),
      ]);
    } catch (e) {
      setProgress({
        stage: "error",
        detail: `Error: ${e instanceof Error ? e.message : String(e)}`,
        done: true,
        runsCount: 0,
        wellnessDays: 0,
      });
    } finally {
      setSyncing(false);
    }
  }, [queryClient]);

  return { syncing, progress, runSync, runQuickSync };
}
