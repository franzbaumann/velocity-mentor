import { useQuery } from "@tanstack/react-query";
import { supabase, callEdgeFunctionWithRetry } from "../shared/supabase";

export interface ActivityStreams {
  time: number[];
  heartrate: number[];
  cadence: number[];
  altitude: number[];
  pace: number[];
  /** GPS track [lat, lng][] if available */
  latlng?: number[][];
  /** Temperature stream if available */
  temperature?: number[];
  /** Respiration rate stream if available */
  respiration_rate?: number[];
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

/** Safely extract a number[] from proxy data that may be wrapped in { data: [...] } */
function toArray(s: unknown): number[] {
  if (Array.isArray(s)) return s.map((x) => Number(x)).filter((n) => !isNaN(n));
  if (s && typeof s === "object" && "data" in (s as Record<string, unknown>)) {
    const d = (s as { data: unknown }).data;
    if (Array.isArray(d)) return d.map((x) => Number(x)).filter((n) => !isNaN(n));
  }
  return [];
}

const MAX_POINTS = 300;

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

      // --- ICU branch: load from DB first (so we never fail when activity exists), then proxy for streams ---
      if (isIcu && extId) {
        // 1) Always fetch from DB first (activity + streams). Use external_id for activity, activity_id = extId for streams.
        const [dbRowRes, dbStreamsRes] = await Promise.all([
          supabase
            .from("activity")
            .select(
              "id, date, type, distance_km, duration_seconds, avg_pace, avg_hr, max_hr, elevation_gain, source, splits, lap_splits, external_id, hr_zone_times, pace_zone_times, cadence, icu_training_load, trimp, perceived_exertion",
            )
            .eq("user_id", user.id)
            .eq("external_id", extId)
            .maybeSingle(),
          supabase
            .from("activity_streams")
            .select("time, heartrate, cadence, altitude, pace, distance, latlng, temperature, respiration_rate")
            .eq("user_id", user.id)
            .eq("activity_id", extId)
            .maybeSingle(),
        ]);

        const dbAct = (dbRowRes.data as Record<string, unknown> | null) ?? null;

        // 2) Optionally fetch from intervals-proxy (detail + streams). Don't fail the whole query if proxy fails.
        let a: Record<string, unknown> | null = null;
        let streamsRes: { data: unknown } = { data: null };
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.access_token) {
          try {
            const [detailRes, streamsResFetched] = await Promise.all([
              callEdgeFunctionWithRetry({
                functionName: "intervals-proxy",
                headers: { Authorization: `Bearer ${session.access_token}` },
                body: { action: "activity", activityId: extId },
                timeoutMs: 45000,
                maxRetries: 2,
                logContext: "useActivityDetailMobile:activity",
              }),
              callEdgeFunctionWithRetry({
                functionName: "intervals-proxy",
                headers: { Authorization: `Bearer ${session.access_token}` },
                body: {
                  action: "streams",
                  activityId: extId,
                  requestStreams: ["time", "heartrate", "cadence", "altitude", "pace", "distance", "latlng", "temperature", "respiration_rate"],
                },
                timeoutMs: 45000,
                maxRetries: 2,
                logContext: "useActivityDetailMobile:streams",
              }),
            ]);
            if (
              detailRes.data &&
              typeof detailRes.data === "object" &&
              !("error" in (detailRes.data as Record<string, unknown>))
            ) {
              a = detailRes.data as Record<string, unknown>;
            }
            streamsRes = streamsResFetched;
          } catch (e) {
            if (__DEV__) {
              console.log("[useActivityDetailMobile] intervals-proxy failed, using DB only", { extId, err: e instanceof Error ? e.message : String(e) });
            }
          }
        }

        if (!a && !dbAct) {
          if (__DEV__) {
            console.log("[useActivityDetailMobile] No activity found", { extId, hasDbAct: !!dbAct, dbError: dbRowRes.error?.message });
          }
          return null;
        }

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

        // ── Streams: prefer DB (persisted by web), fallback to proxy ──
        const dbS = dbStreamsRes.data as {
          time?: number[]; heartrate?: number[]; cadence?: number[];
          altitude?: number[]; pace?: number[]; distance?: number[];
          latlng?: number[][]; temperature?: number[]; respiration_rate?: number[];
        } | null;
        const dbTime = Array.isArray(dbS?.time) ? dbS.time : [];
        const dbHr = Array.isArray(dbS?.heartrate) ? dbS.heartrate : [];
        const dbAlt = Array.isArray(dbS?.altitude) ? dbS.altitude : [];
        const dbPace = Array.isArray(dbS?.pace) ? dbS.pace : [];
        const dbCad = Array.isArray(dbS?.cadence) ? dbS.cadence : [];
        const hasDbStreams = dbTime.length > 20 && (dbHr.length > 0 || dbAlt.length > 0 || dbPace.length > 0);

        const sProxy = (streamsRes.data as Record<string, unknown> | null) ?? null;
        const proxyTime = sProxy ? toArray(sProxy.time) : [];
        const proxyHr = sProxy ? toArray(sProxy.heartrate) : [];
        const proxyCad = sProxy ? toArray(sProxy.cadence) : [];
        const proxyAlt = sProxy ? toArray(sProxy.altitude) : [];
        const proxyVelocity = sProxy ? toArray(sProxy.velocity_smooth) : [];
        const proxyTemp = sProxy ? toArray(sProxy.temperature) : [];
        const proxyResp = sProxy ? toArray(sProxy.respiration_rate) : [];
        const proxyDist = sProxy ? toArray(sProxy.distance) : [];
        let proxyPace = sProxy ? toArray(sProxy.pace) : [];
        if (proxyPace.length === 0 && proxyVelocity.length > 0) {
          proxyPace = proxyVelocity.map((v) => (v > 0.1 ? 1000 / v / 60 : 0));
        }

        // Parse latlng from proxy or DB (match web)
        const latlngRaw = sProxy?.latlng ?? dbS?.latlng;
        const rawPoints: unknown[] = (() => {
          if (latlngRaw) {
            if (Array.isArray(latlngRaw)) return latlngRaw;
            if (typeof latlngRaw === "object" && "data" in (latlngRaw as Record<string, unknown>)) {
              const d = (latlngRaw as { data: unknown }).data;
              if (Array.isArray(d)) return d;
            }
          }
          return [];
        })();
        const proxyLatlng: [number, number][] = [];
        for (const pt of rawPoints) {
          if (Array.isArray(pt) && pt.length >= 2) {
            const lat = Number(pt[0]);
            const lng = Number(pt[1]);
            if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
              proxyLatlng.push([lat, lng]);
            }
          }
        }

        const timeArr = hasDbStreams ? dbTime : proxyTime;
        const hrArr = hasDbStreams ? dbHr : proxyHr;
        const cadArr = hasDbStreams ? dbCad : proxyCad;
        const altArr = hasDbStreams ? dbAlt : proxyAlt;
        const paceArr = hasDbStreams ? dbPace : proxyPace;
        const tempArr = hasDbStreams ? (Array.isArray(dbS?.temperature) ? dbS.temperature : []) : proxyTemp;
        const respArr = hasDbStreams ? (Array.isArray(dbS?.respiration_rate) ? dbS.respiration_rate : []) : proxyResp;
        const hasAnyStreams = timeArr.length > 20 && (hrArr.length > 0 || altArr.length > 0 || paceArr.length > 0);

        let streams: ActivityStreams | undefined;
        if (hasAnyStreams) {
          streams = {
            time: downsample(timeArr, MAX_POINTS),
            heartrate: downsample(hrArr, MAX_POINTS),
            cadence: downsample(cadArr, MAX_POINTS),
            altitude: downsample(altArr, MAX_POINTS),
            pace: downsample(paceArr, MAX_POINTS),
            ...(proxyLatlng.length >= 2 ? { latlng: proxyLatlng } : {}),
            ...(tempArr.length > 0 ? { temperature: downsample(tempArr, MAX_POINTS) } : {}),
            ...(respArr.length > 0 ? { respiration_rate: downsample(respArr, MAX_POINTS) } : {}),
          };
        }

        // Persist proxy streams to DB so they're available next time (same as web)
        const hasLiveStreams = !hasDbStreams && proxyTime.length > 20 &&
          (proxyHr.length > 0 || proxyPace.length > 0 || proxyAlt.length > 0);
        if (hasLiveStreams) {
          supabase
            .from("activity_streams")
            .upsert(
              {
                user_id: user.id,
                activity_id: extId,
                time: proxyTime.length ? proxyTime.map(Math.round) : null,
                heartrate: proxyHr.length ? proxyHr : null,
                cadence: proxyCad.length ? proxyCad : null,
                altitude: proxyAlt.length ? proxyAlt : null,
                pace: proxyPace.length ? proxyPace : null,
                distance: proxyDist.length ? proxyDist : null,
                latlng: proxyLatlng.length >= 2 ? proxyLatlng : null,
                temperature: proxyTemp.length ? proxyTemp : null,
                respiration_rate: proxyResp.length ? proxyResp : null,
              },
              { onConflict: "user_id,activity_id" },
            )
            .then(() => {})
            .catch(() => {});
        }

        // latlng: prefer proxy/DB streams, then activity row
        const rawLatlngDb = (dbAct?.latlng as [number, number][] | null) ?? [];
        const latlng: [number, number][] =
          proxyLatlng.length >= 2
            ? proxyLatlng
            : Array.isArray(rawLatlngDb)
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
          hrZoneTimes: (() => {
            const raw =
              (a as { icu_hr_zone_times?: unknown })?.icu_hr_zone_times ??
              dbAct?.hr_zone_times;
            if (Array.isArray(raw)) return (raw as unknown[]).map((x) => Number(x));
            return null;
          })(),
          paceZoneTimes: (() => {
            const raw =
              (a as { icu_pace_zone_times?: unknown })?.icu_pace_zone_times ??
              dbAct?.pace_zone_times;
            if (Array.isArray(raw)) return (raw as unknown[]).map((x) => Number(x));
            return null;
          })(),
          coachNote: (dbAct?.coach_note as string | null) ?? null,
        };
      }

      // --- Non-ICU branch: pure DB lookup (existing logic) ---
      const rawId = hints?.rawId ?? activityId;
      const baseSelect =
        "id, date, type, distance_km, duration_seconds, avg_pace, avg_hr, max_hr, elevation_gain, source, splits, lap_splits, external_id, hr_zone_times, pace_zone_times, cadence, icu_training_load, trimp, perceived_exertion";

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
        .select("time, heartrate, cadence, altitude, pace, distance, latlng, temperature, respiration_rate")
        .eq("user_id", user.id)
        .eq("activity_id", streamKey)
        .maybeSingle();

      const s = sRow as {
        time?: number[];
        heartrate?: number[];
        cadence?: number[];
        altitude?: number[];
        pace?: number[];
        distance?: number[];
        latlng?: number[][];
        temperature?: number[];
        respiration_rate?: number[];
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
        const latlngArr = Array.isArray(s!.latlng) ? s!.latlng : [];
        const tempArr = Array.isArray(s!.temperature) ? s!.temperature : [];
        const respArr = Array.isArray(s!.respiration_rate) ? s!.respiration_rate : [];
        streams = {
          time: downsample(time, MAX_POINTS),
          heartrate: downsample(hr, MAX_POINTS),
          cadence: downsample(cad, MAX_POINTS),
          altitude: downsample(alt, MAX_POINTS),
          pace: downsample(pace, MAX_POINTS),
          ...(latlngArr.length >= 2 ? { latlng: latlngArr } : {}),
          ...(tempArr.length > 0 ? { temperature: downsample(tempArr, MAX_POINTS) } : {}),
          ...(respArr.length > 0 ? { respiration_rate: downsample(respArr, MAX_POINTS) } : {}),
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
