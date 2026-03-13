import { useEffect, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase, callEdgeFunctionWithRetry } from "../shared/supabase";

const STORAGE_KEY = "activity_streams_sync_last_ts";
const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
const MAX_CONCURRENT = 5;

function isRun(a: { type?: string | null }): boolean {
  const t = String(a?.type ?? "").toLowerCase();
  return t === "run" || t.includes("run");
}

function toArray(s: unknown): number[] {
  if (Array.isArray(s)) return s.map((x) => Number(x)).filter((n) => !isNaN(n));
  if (s && typeof s === "object" && "data" in (s as object)) {
    const d = (s as { data: unknown[] }).data;
    return Array.isArray(d) ? d.map((x) => Number(x)).filter((n) => !isNaN(n)) : [];
  }
  return [];
}

function velocityToPace(v: number): number {
  if (!v || v < 0.05) return 0;
  return 1000 / (v * 60);
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let idx = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      await fn(items[i]);
    }
  });
  await Promise.all(workers);
}

/** Activity list item shape: need type and externalId (intervals.icu id) for sync */
type ActivityLike = { type?: string | null; externalId?: string | null; rawId?: string };

async function syncStreamsForActivities(
  activities: ActivityLike[],
  userId: string,
  accessToken: string,
): Promise<void> {
  const runs = activities.filter((a) => isRun(a) && a.externalId);
  if (runs.length === 0) return;

  const { data: existing } = await supabase
    .from("activity_streams")
    .select("activity_id")
    .eq("user_id", userId);
  const existingIds = new Set((existing ?? []).map((r) => r.activity_id));

  const toSync = runs.filter((a) => a.externalId && !existingIds.has(a.externalId));
  if (toSync.length === 0) return;

  await runPool(toSync, MAX_CONCURRENT, async (a) => {
    const activityId = String(a.externalId!);
    try {
      const resp = await callEdgeFunctionWithRetry({
        functionName: "intervals-proxy",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: { action: "streams", activityId },
        timeoutMs: 20000,
        maxRetries: 2,
        logContext: "useActivityStreamsSync:streams",
      });

      if (resp.error) return;
      const raw = resp.data as Record<string, unknown> | null;
      if (raw && typeof raw === "object" && "error" in raw) return;
      if (!raw || typeof raw !== "object") return;

      const getStream = (k: string) =>
        toArray(raw[k] ?? raw[k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())]);

      const timeArr = getStream("time");
      const hrArr = getStream("heartrate");
      const cadenceArr = getStream("cadence");
      const altitudeArr = getStream("altitude");
      const velocityArr = getStream("velocity_smooth");
      const distanceArr = getStream("distance");
      const paceArr = velocityArr.map(velocityToPace);

      if (timeArr.length === 0 && hrArr.length === 0) return;

      await supabase.from("activity_streams").upsert(
        {
          user_id: userId,
          activity_id: activityId,
          heartrate: hrArr.length ? hrArr : null,
          cadence: cadenceArr.length ? cadenceArr : null,
          altitude: altitudeArr.length ? altitudeArr : null,
          pace: paceArr.length ? paceArr : null,
          distance: distanceArr.length ? distanceArr : null,
          time: timeArr.length ? timeArr.map(Math.round) : null,
        },
        { onConflict: "user_id,activity_id" },
      );
    } catch {
      /* skip failed activity */
    }
  });
}

/**
 * Syncs activity streams from intervals-proxy for activities missing streams.
 * Runs in background, rate-limited to once per hour via AsyncStorage.
 * Only runs when intervals.icu is connected.
 */
export function useActivityStreamsSync(
  activities: unknown[],
  isConnected: boolean,
): void {
  const syncedRef = useRef(false);

  useEffect(() => {
    if (!isConnected || !Array.isArray(activities) || activities.length === 0) return;
    if (syncedRef.current) return;

    const arr = activities.filter(
      (a): a is ActivityLike => typeof a === "object" && a !== null && "type" in a,
    );

    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const lastTs = raw ? parseInt(raw, 10) : 0;
        if (Number.isFinite(lastTs) && Date.now() - lastTs < COOLDOWN_MS) return;
        if (cancelled) return;

        syncedRef.current = true;

        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || cancelled) return;

        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token || cancelled) return;

        await syncStreamsForActivities(arr, user.id, session.access_token);
        if (!cancelled) await AsyncStorage.setItem(STORAGE_KEY, String(Date.now()));
      } catch {
        /* silent */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activities, isConnected]);
}

export { syncStreamsForActivities };
