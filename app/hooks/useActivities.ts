import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getLocalDateString } from "../lib/date";
import { supabase } from "../shared/supabase";

type ActivitySource = "garmin" | "strava" | "intervals_icu";

export type ActivityListItem = {
  id: string;
  /** Primary key in activity table */
  rawId: string;
  /** External id (e.g. intervals.icu id) if present */
  externalId?: string | null;
  date: Date;
  name: string;
  type: string;
  km: number;
  nonDist: boolean;
  pace: string | null;
  duration: string;
  durationSeconds: number | null;
  hr: number | null;
  source: ActivitySource | "sample";
};

export type ActivitiesSection = {
  title: string;
  data: ActivityListItem[];
};

type ActivityRow = {
  id: string;
  date: string;
  type: string | null;
  name: string | null;
  distance_km: number | null;
  duration_seconds: number | null;
  avg_pace: string | null;
  avg_hr: number | null;
  source: string | null;
  external_id?: string | null;
};

function formatDuration(sec: number | null): string {
  if (sec == null || !isFinite(sec)) return "--";
  const total = Math.max(0, Math.round(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

function buildSections(activities: ActivityListItem[]): ActivitiesSection[] {
  const byDate = new Map<string, ActivityListItem[]>();
  for (const a of activities) {
    const key = getLocalDateString(a.date);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(a);
  }
  const keys = Array.from(byDate.keys()).sort((a, b) => b.localeCompare(a));
  return keys.map((key) => {
    const date = new Date(key);
    const label = date.toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
    const list = byDate
      .get(key)!
      .slice()
      .sort((a, b) => {
        const aDate = a.date instanceof Date ? a.date : new Date(a.date as unknown as string);
        const bDate = b.date instanceof Date ? b.date : new Date(b.date as unknown as string);
        const aTime = typeof aDate?.getTime === "function" ? aDate.getTime() : 0;
        const bTime = typeof bDate?.getTime === "function" ? bDate.getTime() : 0;
        return bTime - aTime;
      });
    return { title: label, data: list };
  });
}

export function useActivitiesList(days = 120) {
  const query = useQuery({
    queryKey: ["activities", days],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [] as ActivityListItem[];

      const oldest = new Date();
      oldest.setDate(oldest.getDate() - days);
      const { data, error } = await supabase
        .from("activity")
        .select(
          "id, date, type, name, distance_km, duration_seconds, avg_pace, avg_hr, source, external_id",
        )
        .eq("user_id", user.id)
        .gte("date", oldest.toISOString().slice(0, 10))
        .order("date", { ascending: true });

      if (error) throw error;

      const rows = (data ?? []) as ActivityRow[];

      return rows.map((row) => {
        const raw = row.date != null ? new Date(row.date) : new Date();
        const date = raw instanceof Date && !Number.isNaN(raw.getTime()) ? raw : new Date();
        const km = row.distance_km ?? 0;
        const nonDist = !km || km <= 0;
        const isIcu = row.source === "intervals_icu" && row.external_id;
        const detailId =
          isIcu && row.external_id ? `icu_${row.external_id}` : row.id;
        return {
          id: detailId,
          rawId: row.id,
          externalId: row.external_id ?? null,
          date,
          name: row.name || (row.type ?? "Activity"),
          type: row.type ?? "Run",
          km: km > 0 ? Math.round(km * 10) / 10 : 0,
          nonDist,
          pace: row.avg_pace,
          duration: formatDuration(row.duration_seconds),
          durationSeconds: row.duration_seconds,
          hr: row.avg_hr,
          source: (row.source as ActivitySource | null) ?? "sample",
        };
      });
    },
    staleTime: 2 * 60 * 1000,
  });

  const items = query.data ?? [];
  const sections = useMemo(() => buildSections(items), [items]);

  return {
    sections,
    items,
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    refetch: query.refetch,
    isEmpty: items.length === 0,
  };
}

export function useActivityById(id: string) {
  const { items } = useActivitiesList(730);
  const activity = useMemo(() => items.find((a) => a.id === id) ?? null, [items, id]);
  return { activity };
}

