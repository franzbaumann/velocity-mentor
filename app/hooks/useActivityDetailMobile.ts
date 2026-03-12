import { useQuery } from "@tanstack/react-query";
import { supabase } from "../shared/supabase";

export interface ActivityStreams {
  time: number[];
  heartrate: number[];
  cadence: number[];
  altitude: number[];
  pace: number[];
}

export interface LapData {
  duration: string;
  pace: string;
  hr: number | null;
  zone: string;
  zoneColor: string;
}

export interface ActivityDetailData {
  id: string;
  date: string;
  type: string;
  name?: string;
  distance_km: number;
  duration_seconds: number;
  avg_pace: string | null;
  avg_hr: number | null;
  max_hr: number | null;
  elevation_gain: number | null;
  source: string;
  /** Average run cadence (spm) */
  cadence?: number | null;
  /** Intervals.icu training load */
  load?: number | null;
  /** TRIMP score */
  trimp?: number | null;
  /** Relative intensity % */
  intensity?: number | null;
  /** Calories burned */
  calories?: number | null;
  /** Subjective RPE 1-10 if available */
  perceivedExertion?: number | null;
  laps: LapData[];
  streams?: ActivityStreams;
  latlng: [number, number][];
  userNotes: string | null;
  nomioDrink: boolean;
  lactateLevels: string | null;
  hrZoneTimes: number[] | null;
  /** Pace zone distribution in seconds, if available */
  paceZoneTimes?: number[] | null;
  coachNote: string | null;
}

const ZONE_COLORS: Record<string, string> = {
  z1: "#90CAF9",
  z2: "#2196F3",
  z3: "#4CAF50",
  z4: "#FF9800",
  z5: "#e91e63",
};

function hrToZone(hr: number, maxHr: number): { zone: string; color: string } {
  const pct = hr / maxHr;
  if (pct < 0.6) return { zone: "z1", color: ZONE_COLORS.z1 };
  if (pct < 0.7) return { zone: "z2", color: ZONE_COLORS.z2 };
  if (pct < 0.8) return { zone: "z3", color: ZONE_COLORS.z3 };
  if (pct < 0.9) return { zone: "z4", color: ZONE_COLORS.z4 };
  return { zone: "z5", color: ZONE_COLORS.z5 };
}

function formatDur(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function parseLaps(
  raw: Array<Record<string, unknown>> | null,
  maxHr: number,
): LapData[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw.map((sp) => {
    const hr = sp.hr != null ? Number(sp.hr) : null;
    const { zone, color } = hr != null ? hrToZone(hr, maxHr) : { zone: "z2", color: ZONE_COLORS.z2 };
    return {
      duration: sp.elapsed_sec != null ? formatDur(Number(sp.elapsed_sec)) : (sp.pace as string) ?? "-",
      pace: (sp.pace as string) ?? "-",
      hr,
      zone,
      zoneColor: color,
    };
  });
}

function downsample(arr: number[], target: number): number[] {
  if (arr.length <= target) return arr;
  const step = arr.length / target;
  const out: number[] = [];
  for (let i = 0; i < target; i++) {
    out.push(arr[Math.round(i * step)]);
  }
  return out;
}

const MAX_POINTS = 200;

export function useActivityDetailMobile(
  activityId: string | undefined,
  hints?: { rawId?: string; externalId?: string | null },
) {
  return useQuery({
    queryKey: [
      "activity-detail-mobile",
      activityId,
      hints?.rawId ?? null,
      hints?.externalId ?? null,
    ],
    queryFn: async (): Promise<ActivityDetailData | null> => {
      if (!activityId) return null;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;

      const isIcu = activityId.startsWith("icu_");
      const extId =
        hints?.externalId ??
        (isIcu ? activityId.replace(/^icu_/, "") : activityId);

      // --- ICU branch: use intervals-proxy as primary source ---
      if (isIcu && extId) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) return null;

        const [detailRes, streamsRes, dbRowRes] = await Promise.all([
          supabase.functions.invoke("intervals-proxy", {
            headers: { Authorization: `Bearer ${session.access_token}` },
            body: { action: "activity", activityId: extId },
          }),
          supabase.functions.invoke("intervals-proxy", {
            headers: { Authorization: `Bearer ${session.access_token}` },
            body: { action: "streams", activityId: extId },
          }),
          supabase
            .from("activity")
            .select(
              "id, date, type, name, distance_km, duration_seconds, avg_pace, avg_hr, max_hr, elevation_gain, source, splits, lap_splits, external_id, latlng, user_notes, nomio_drink, lactate_levels, hr_zone_times, pace_zone_times, coach_note, cadence, icu_training_load, trimp, intensity, calories",
            )
            .eq("user_id", user.id)
            .eq("external_id", extId)
            .maybeSingle(),
        ]);

        const a =
          detailRes.data &&
          typeof detailRes.data === "object" &&
          !("error" in (detailRes.data as Record<string, unknown>))
            ? (detailRes.data as Record<string, unknown>)
            : null;
        const dbAct = (dbRowRes.data as Record<string, unknown> | null) ?? null;

        if (!a && !dbAct) return null;

        // Distance & duration
        const distMeters = a?.distance != null ? Number(a.distance) : 0;
        const distKmFromApi =
          distMeters > 0 ? distMeters / 1000 : Number(dbAct?.distance_km ?? 0);
        const durSecFromApi =
          a?.moving_time ??
          a?.movingTime ??
          a?.elapsed_time ??
          a?.elapsedTime ??
          a?.duration ??
          dbAct?.duration_seconds ??
          0;
        const durSec = Number(durSecFromApi ?? 0);

        // Avg pace (string)
        let avgPace: string | null =
          (dbAct?.avg_pace as string | null) ?? null;
        const avgSpeed = a?.average_speed ?? a?.averageSpeed ?? null;
        if (avgSpeed != null && Number(avgSpeed) > 0) {
          const paceSec = 1000 / Number(avgSpeed);
          const m = Math.floor(paceSec / 60);
          const s = Math.round(paceSec % 60);
          avgPace = `${m}:${String(s).padStart(2, "0")}/km`;
        }

        // Streams (from proxy)
        const sProxy = (streamsRes.data as Record<string, unknown> | null) ?? null;
        let streams: ActivityStreams | undefined;
        if (sProxy) {
          const time = downsample(sProxy.time as number[] | undefined ?? [], MAX_POINTS);
          const hr = downsample(sProxy.heartrate as number[] | undefined ?? [], MAX_POINTS);
          const cad = downsample(sProxy.cadence as number[] | undefined ?? [], MAX_POINTS);
          const alt = downsample(sProxy.altitude as number[] | undefined ?? [], MAX_POINTS);
          const pace = downsample(sProxy.pace as number[] | undefined ?? [], MAX_POINTS);
          const hasAny = time.length > 20 && (hr.length || alt.length || pace.length);
          if (hasAny) {
            streams = { time, heartrate: hr, cadence: cad, altitude: alt, pace };
          }
        }

        // latlng – helst från DB
        const rawLatlngDb = (dbAct?.latlng as [number, number][] | null) ?? [];
        const latlng: [number, number][] = Array.isArray(rawLatlngDb)
          ? rawLatlngDb
              .filter(
                (p) =>
                  Array.isArray(p) &&
                  p.length >= 2 &&
                  typeof p[0] === "number" &&
                  typeof p[1] === "number" &&
                  isFinite(p[0]) &&
                  isFinite(p[1]) &&
                  (p[0] !== 0 || p[1] !== 0),
              )
              .map((p) => [p[0], p[1]])
          : [];

        const maxHr = Number(
          dbAct?.max_hr ??
            a?.max_heartrate ??
            a?.maxHeartrate ??
            190,
        );
        const rawSplits =
          (dbAct?.lap_splits as Array<Record<string, unknown>> | null) ??
          (dbAct?.splits as Array<Record<string, unknown>> | null) ??
          null;
        const laps = parseLaps(rawSplits, maxHr);

        return {
          id: activityId,
          date: String(
            dbAct?.date ??
              a?.start_date_local ??
              a?.startDate ??
              "",
          ),
          type: String(dbAct?.type ?? a?.type ?? "Run"),
          name:
            (dbAct?.name as string | null) ??
            (a?.name != null ? String(a.name) : undefined),
          distance_km: Number(
            distKmFromApi > 0 ? distKmFromApi : dbAct?.distance_km ?? 0,
          ),
          duration_seconds: durSec,
          avg_pace: avgPace,
          avg_hr:
            dbAct?.avg_hr != null
              ? Number(dbAct.avg_hr)
              : a?.average_heartrate != null || a?.averageHeartrate != null
              ? Number(a.average_heartrate ?? a.averageHeartrate)
              : null,
          max_hr:
            dbAct?.max_hr != null
              ? Number(dbAct.max_hr)
              : a?.max_heartrate != null || a?.maxHeartrate != null
              ? Number(a.max_heartrate ?? a.maxHeartrate)
              : null,
          elevation_gain:
            dbAct?.elevation_gain != null
              ? Number(dbAct.elevation_gain)
              : a?.total_elevation_gain != null
              ? Number(a.total_elevation_gain)
              : null,
          source: "intervals_icu",
          cadence:
            dbAct?.cadence != null
              ? Number(dbAct.cadence)
              : a?.cadence != null || a?.average_cadence != null
              ? Number(a.cadence ?? a.average_cadence)
              : null,
          load:
            dbAct?.icu_training_load != null
              ? Number(dbAct.icu_training_load)
              : a?.icu_training_load != null || a?.training_load != null
              ? Number(a.icu_training_load ?? a.training_load)
              : null,
          trimp:
            dbAct?.trimp != null
              ? Number(dbAct.trimp)
              : a?.trimp != null
              ? Number(a.trimp)
              : null,
          intensity:
            dbAct?.intensity != null
              ? Number(dbAct.intensity)
              : a?.intensity != null || a?.icu_intensity != null
              ? Number(a.intensity ?? a.icu_intensity)
              : null,
          calories:
            dbAct?.calories != null
              ? Number(dbAct.calories)
              : a?.calories != null
              ? Number(a.calories)
              : null,
          perceivedExertion:
            dbAct?.perceived_exertion != null
              ? Number(dbAct.perceived_exertion)
              : a?.perceived_exertion != null
              ? Number(a.perceived_exertion)
              : null,
          laps,
          streams,
          latlng,
          userNotes: (dbAct?.user_notes as string | null) ?? null,
          nomioDrink: !!(dbAct?.nomio_drink as boolean | null),
          lactateLevels: (dbAct?.lactate_levels as string | null) ?? null,
          hrZoneTimes: Array.isArray(dbAct?.hr_zone_times)
            ? (dbAct?.hr_zone_times as number[]).map(Number)
            : null,
          paceZoneTimes: Array.isArray(dbAct?.pace_zone_times)
            ? (dbAct?.pace_zone_times as number[]).map(Number)
            : null,
          coachNote: (dbAct?.coach_note as string | null) ?? null,
        };
      }

      // --- Non-ICU branch: pure DB lookup (existing logic) ---
      const rawId = hints?.rawId ?? activityId;
      const baseSelect =
        "id, date, type, name, distance_km, duration_seconds, avg_pace, avg_hr, max_hr, elevation_gain, source, splits, lap_splits, external_id, latlng, user_notes, nomio_drink, lactate_levels, hr_zone_times, pace_zone_times, coach_note, cadence, icu_training_load, trimp, intensity, calories";

      let row: Record<string, unknown> | null = null;

      // 1) Try by raw primary id (UUID from activity table) if we have it
      if (rawId) {
        const { data } = await supabase
          .from("activity")
          .select(baseSelect)
          .eq("user_id", user.id)
          .eq("id", rawId)
          .maybeSingle();
        if (data) row = data as Record<string, unknown>;
      }

      // 2) Try by external_id (intervals.icu id) if present
      if (!row && extId) {
        const { data } = await supabase
          .from("activity")
          .select(baseSelect)
          .eq("user_id", user.id)
          .eq("external_id", extId)
          .maybeSingle();
        if (data) row = data as Record<string, unknown>;
      }

      // 3) Fallback: try by activityId itself (covers legacy ids)
      if (!row) {
        const { data } = await supabase
          .from("activity")
          .select(baseSelect)
          .eq("user_id", user.id)
          .eq("id", activityId)
          .maybeSingle();
        if (data) row = data as Record<string, unknown>;
      }

      if (!row) return null;

      const r = row;
      const streamKey = (r.external_id as string) ?? activityId;
      const { data: sRow } = await supabase
        .from("activity_streams")
        .select("time, heartrate, cadence, altitude, pace")
        .eq("user_id", user.id)
        .eq("activity_id", streamKey)
        .maybeSingle();

      const s = sRow as {
        time?: number[];
        heartrate?: number[];
        cadence?: number[];
        altitude?: number[];
        pace?: number[];
      } | null;

      const hasStreams =
        Array.isArray(s?.time) && s!.time!.length > 20;

      const maxHr = Number(r.max_hr ?? 190);
      const rawLaps = (r.lap_splits ?? r.splits) as Array<Record<string, unknown>> | null;
      const rawLatlng = (r.latlng as [number, number][] | null) ?? [];
      const latlng: [number, number][] = Array.isArray(rawLatlng)
        ? rawLatlng
            .filter(
              (p) =>
                Array.isArray(p) &&
                p.length >= 2 &&
                typeof p[0] === "number" &&
                typeof p[1] === "number" &&
                isFinite(p[0]) &&
                isFinite(p[1]) &&
                (p[0] !== 0 || p[1] !== 0),
            )
            .map((p) => [p[0], p[1]])
        : [];

      let streams: ActivityStreams | undefined;
      if (hasStreams) {
        const time = s!.time!;
        const hr = Array.isArray(s!.heartrate) ? s!.heartrate : [];
        const cad = Array.isArray(s!.cadence) ? s!.cadence : [];
        const alt = Array.isArray(s!.altitude) ? s!.altitude : [];
        const pace = Array.isArray(s!.pace) ? s!.pace : [];
        streams = {
          time: downsample(time, MAX_POINTS),
          heartrate: downsample(hr, MAX_POINTS),
          cadence: downsample(cad, MAX_POINTS),
          altitude: downsample(alt, MAX_POINTS),
          pace: downsample(pace, MAX_POINTS),
        };
      }

      return {
        id: activityId,
        date: String(r.date ?? ""),
        type: String(r.type ?? "Run"),
        name: r.name != null ? String(r.name) : undefined,
        distance_km: Number(r.distance_km ?? 0),
        duration_seconds: Number(r.duration_seconds ?? 0),
        avg_pace: (r.avg_pace as string) ?? null,
        avg_hr: r.avg_hr != null ? Number(r.avg_hr) : null,
        max_hr: r.max_hr != null ? Number(r.max_hr) : null,
        elevation_gain: r.elevation_gain != null ? Number(r.elevation_gain) : null,
        source: String(r.source ?? "garmin"),
        cadence: r.cadence != null ? Number(r.cadence) : null,
        load: r.icu_training_load != null ? Number(r.icu_training_load) : null,
        trimp: r.trimp != null ? Number(r.trimp) : null,
        intensity: r.intensity != null ? Number(r.intensity) : null,
        calories: r.calories != null ? Number(r.calories) : null,
        perceivedExertion:
          (r as { perceived_exertion?: number | null }).perceived_exertion != null
            ? Number(
                (r as { perceived_exertion?: number | null }).perceived_exertion,
              )
            : null,
        laps: parseLaps(rawLaps, maxHr),
        streams,
        latlng,
        userNotes: (r.user_notes as string | null) ?? null,
        nomioDrink: !!(r.nomio_drink as boolean | null),
        lactateLevels: (r.lactate_levels as string | null) ?? null,
        hrZoneTimes: (r.hr_zone_times as number[] | null) ?? null,
        paceZoneTimes: (r.pace_zone_times as number[] | null) ?? null,
        coachNote: (r.coach_note as string | null) ?? null,
      };
    },
    enabled: !!activityId,
  });
}
