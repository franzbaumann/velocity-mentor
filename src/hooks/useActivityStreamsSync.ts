import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

function isRun(a: Record<string, unknown>): boolean {
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

const MAX_CONCURRENT = 5;

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

async function syncStreamsForActivities(
  activities: Record<string, unknown>[],
  userId: string,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const runs = activities.filter(isRun);
  if (runs.length === 0) return;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return;

  const { data: existing } = await supabase
    .from("activity_streams")
    .select("activity_id")
    .eq("user_id", userId);
  const existingIds = new Set((existing ?? []).map((r) => r.activity_id));

  const toSync = runs.filter((a) => {
    const rawId = a.id ?? a.uid;
    return rawId && !existingIds.has(String(rawId));
  });

  if (toSync.length === 0) return;
  let done = 0;

  await runPool(toSync, MAX_CONCURRENT, async (a) => {
    const activityId = String(a.id ?? a.uid);
    try {
      const { data: streamsData, error } = await supabase.functions.invoke("intervals-proxy", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { action: "streams", activityId },
      });

      if (error || (streamsData && typeof streamsData === "object" && "error" in streamsData)) {
        done++;
        onProgress?.(done, toSync.length);
        return;
      }

      const raw = streamsData as Record<string, unknown> | null;
      if (!raw || typeof raw !== "object") {
        done++;
        onProgress?.(done, toSync.length);
        return;
      }

      const getStream = (k: string) =>
        toArray(raw[k] ?? raw[k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())]);

      const timeArr = getStream("time");
      const hrArr = getStream("heartrate");
      const cadenceArr = getStream("cadence");
      const altitudeArr = getStream("altitude");
      const velocityArr = getStream("velocity_smooth");
      const distanceArr = getStream("distance");
      const paceArr = velocityArr.map(velocityToPace);

      if (timeArr.length === 0 && hrArr.length === 0) {
        done++;
        onProgress?.(done, toSync.length);
        return;
      }

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
    done++;
    onProgress?.(done, toSync.length);
  });
}

export function useActivityStreamsSync(
  activities: unknown[],
  isConnected: boolean,
): void {
  const syncedRef = useRef(false);

  useEffect(() => {
    if (!isConnected || !Array.isArray(activities) || activities.length === 0) return;
    if (syncedRef.current) return;
    syncedRef.current = true;

    const arr = activities.filter(
      (a): a is Record<string, unknown> => typeof a === "object" && a !== null,
    );
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user ?? null;
      if (!user) return;
      syncStreamsForActivities(arr, user.id);
    });
  }, [activities, isConnected]);
}

export { syncStreamsForActivities };
