import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../shared/supabase";

type SyncState =
  | { status: "idle"; message: null }
  | { status: "running"; message: string }
  | { status: "done"; message: string }
  | { status: "error"; message: string };

export function useIntervalsSync() {
  const [state, setState] = useState<SyncState>({ status: "idle", message: null });
  const queryClient = useQueryClient();

  const runSync = useCallback(async () => {
    setState({ status: "running", message: "Syncar aktiviteter och readiness från intervals.icu..." });

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setState({ status: "error", message: "Inte inloggad – logga in och försök igen." });
        return;
      }

      const { data, error } = await supabase.functions.invoke("intervals-proxy", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { action: "full_sync" },
      });

      const result = (data ?? {}) as {
        runs?: number;
        upserted?: number;
        wellness?: number;
        streams?: { ok?: number; failed?: number; skipped?: number };
        error?: string;
        log?: string[];
      };

      if (error) {
        const bodyMsg = result.error ?? (result.log?.length ? result.log.slice(-2).join("\n") : null);
        setState({
          status: "error",
          message: bodyMsg ? `Sync-fel: ${bodyMsg}` : `Sync-fel: ${error.message}`,
        });
        return;
      }

      if (result.error) {
        const logTail = (result.log ?? []).slice(-3).join(" | ");
        setState({ status: "error", message: `${result.error}${logTail ? `\n${logTail}` : ""}` });
        return;
      }

      const runs = result.runs ?? 0;
      const upserted = result.upserted ?? 0;
      const wellness = result.wellness ?? 0;
      const streamsOk = result.streams?.ok ?? 0;

      const msg = runs > 0
        ? `Klar – ${upserted} sparade av ${runs} aktiviteter, ${streamsOk} streams, ${wellness} readiness-dagar.`
        : `Klar – 0 aktiviteter hittades.\n${(result.log ?? []).slice(-4).join("\n")}`;

      setState({ status: runs > 0 ? "done" : "error", message: msg });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["activities"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    } catch (e) {
      setState({
        status: "error",
        message: e instanceof Error ? e.message : "Okänt fel vid sync.",
      });
    }
  }, [queryClient]);

  return {
    runSync,
    isSyncing: state.status === "running",
    status: state.status,
    message: state.message,
  };
}

