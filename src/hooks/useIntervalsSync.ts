import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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

interface FullSyncResult {
  runs: number;
  upserted: number;
  streams: { ok: number; failed: number; skipped: number };
  wellness: number;
  ctl: number | null;
  atl: number | null;
  tsb: number | null;
  log: string[];
  error?: string;
}

export function useIntervalsSync() {
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const queryClient = useQueryClient();

  const runSync = useCallback(async () => {
    setSyncing(true);
    setProgress({
      stage: "syncing",
      detail: "Starting full sync — activities, streams, wellness, profile...",
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
        body: { action: "full_sync" },
      });

      if (error) {
        setProgress({ stage: "error", detail: `Sync error: ${error.message}`, done: true, runsCount: 0, wellnessDays: 0 });
        setSyncing(false);
        return;
      }

      const result = data as FullSyncResult;

      if (result.error) {
        setProgress({
          stage: "error",
          detail: `Error: ${result.error}`,
          done: true,
          runsCount: result.runs ?? 0,
          wellnessDays: result.wellness ?? 0,
        });
        setSyncing(false);
        return;
      }

      const ctl = result.ctl ?? undefined;
      const atl = result.atl ?? undefined;
      const tsb = result.tsb ?? undefined;
      const streamsTotal = result.streams.ok + result.streams.failed + result.streams.skipped;

      const detailParts = [
        `${result.runs} activities`,
        `${result.upserted} saved`,
        `${result.streams.ok} streams`,
        `${result.wellness} wellness days`,
      ];
      if (ctl != null) detailParts.push(`CTL: ${Math.round(ctl)}`);
      if (atl != null) detailParts.push(`ATL: ${Math.round(atl)}`);
      if (tsb != null && isFinite(tsb)) detailParts.push(`Form: ${tsb > 0 ? "+" : ""}${Math.round(tsb)}`);

      setProgress({
        stage: "done",
        detail: `Done — ${detailParts.join(" · ")}`,
        done: true,
        runsCount: result.runs,
        wellnessDays: result.wellness,
        streamsProgress: { done: result.streams.ok, total: streamsTotal },
        ctl,
        atl,
        tsb,
      });

      if (result.log.length > 0) {
        console.log("[intervals sync log]", result.log.join("\n"));
      }

      // Invalidate all activity/readiness caches so UI refreshes with new data
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["activities"] }),
        queryClient.invalidateQueries({ queryKey: ["daily_readiness"] }),
        queryClient.invalidateQueries({ queryKey: ["intervals-activities-chunked"] }),
        queryClient.invalidateQueries({ queryKey: ["intervals-data"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["athlete-profile"] }),
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

  return { syncing, progress, runSync };
}
