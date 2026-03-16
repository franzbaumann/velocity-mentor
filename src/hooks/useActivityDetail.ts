import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Stream arrays aligned by index (time) for charts */
export interface ActivityStreams {
  time: number[];
  heartrate: number[];
  cadence: number[];
  altitude: number[];
  velocity_smooth: number[];
  pace?: number[];
  watts: number[];
  distance?: number[];
  distance_km?: number;
  temperature?: number[];
  respiration_rate?: number[];
}

export interface ActivityDetail {
  id: string;
  user_id?: string;
  date: string;
  type: string;
  name?: string;
  distance_km: number;
  duration_seconds: number;
  moving_time?: number;
  elevation_gain?: number | null;
  avg_pace: string | null;
  avg_hr: number | null;
  max_hr: number | null;
  avg_speed?: number;
  cadence?: number | null;
  load?: number | null;
  intensity?: number | null;
  trimp?: number | null;
  calories?: number | null;
  hr_zone_times?: number[] | null;
  pace_zone_times?: number[] | null;
  perceived_exertion?: number | null;
  coach_note?: string | null;
  user_notes?: string | null;
  nomio_drink?: boolean | null;
  lactate_levels?: string | null;
  enhancing_supplements?: EnhancingSupplements | null;
  source: string;
  latlng: [number, number][];
  splits: Array<{ km?: number; pace?: string; elapsed_sec?: number; hr?: number; elevation?: number }>;
  /** Set only in DEV when the activity-stream edge call failed (for UI hint). */
  streamFetchError?: string;
  intervals?: Array<{ distance?: number; moving_time?: number; average_heartrate?: number; zone?: number; type?: string }>;
  streams?: ActivityStreams;
  /** Pre-loaded social data from edge fallback (when direct Supabase queries may be blocked by RLS) */
  edgeLikes?: { id: string; user_id: string }[];
  edgeComments?: { id: string; user_id: string; content: string; created_at: string }[];
  /** User-uploaded photos (url + path for deletion) */
  photos?: { url: string; path?: string }[];
  /** Actual DB row id (for intervals activities, id is icu_xxx but dbId is the UUID) */
  dbId?: string;
}

function parsePhotos(raw: unknown): { url: string; path?: string }[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw
    .filter((p): p is Record<string, unknown> => p != null && typeof p === "object")
    .map((p) => ({ url: String(p.url ?? ""), path: p.path != null ? String(p.path) : undefined }))
    .filter((p) => p.url.length > 0);
}

export type EnhancingSupplements = {
  beetroot?: { value: number; unit: "ml" | "mg" };
  bicarb?: { value: number; unit: "g" };
  caffeine?: { value: number; unit: "mg" };
  carbs?: { value: number; unit: "g" };
};

/** Decode Google polyline to [lat,lng][] */
function decodePolyline(str: string): [number, number][] {
  const points: [number, number][] = [];
  let idx = 0;
  let lat = 0;
  let lng = 0;
  while (idx < str.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = str.charCodeAt(idx++) - 63;
      result |= (byte & 31) << shift;
      shift += 5;
    } while (byte >= 32);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;
    shift = 0;
    result = 0;
    do {
      byte = str.charCodeAt(idx++) - 63;
      result |= (byte & 31) << shift;
      shift += 5;
    } while (byte >= 32);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

/** Build km splits from latlng and elapsed time (evenly distributed) */
function buildSplitsFromStreams(
  latlng: [number, number][],
  durationSec: number
): Array<{ km: number; pace: string; elapsed_sec: number }> {
  if (latlng.length < 2 || durationSec <= 0) return [];
  const R = 6371; // km
  const dists: number[] = [0];
  for (let i = 1; i < latlng.length; i++) {
    const [lat1, lng1] = latlng[i - 1];
    const [lat2, lng2] = latlng[i];
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    dists.push(dists[dists.length - 1] + R * c);
  }
  const totalKm = dists[dists.length - 1];
  if (totalKm < 0.01) return [];
  const splits: Array<{ km: number; pace: string; elapsed_sec: number }> = [];
  let nextKm = 1;
  let prevElapsed = 0;
  for (let i = 1; i < dists.length && nextKm <= Math.floor(totalKm); i++) {
    if (dists[i] >= nextKm) {
      const frac = (nextKm - dists[i - 1]) / (dists[i] - dists[i - 1] || 1);
      const elapsed = (i - 1 + frac) * (durationSec / (dists.length - 1));
      const splitDurSec = elapsed - prevElapsed;
      prevElapsed = elapsed;
      const paceSecPerKm = splitDurSec / 1;
      let min = Math.floor(paceSecPerKm / 60);
      let sec = Math.round(paceSecPerKm % 60);
      if (sec >= 60) {
        min += 1;
        sec = 0;
      }
      splits.push({
        km: nextKm,
        pace: `${min}:${String(sec).padStart(2, "0")}/km`,
        elapsed_sec: Math.round(splitDurSec),
      });
      nextKm++;
    }
  }
  return splits;
}

export function useActivityDetail(activityId: string | undefined) {
  return useQuery({
    queryKey: ["activity-detail", activityId],
    queryFn: async ({ queryKey }): Promise<ActivityDetail | null> => {
      const id = queryKey[1] as string | undefined;
      if (!id) return null;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return null;

      const isIntervals = id.startsWith("icu_");
      const intervalsId = isIntervals ? id.replace(/^icu_/, "") : null;

      if (isIntervals && intervalsId) {
        const { data: { session: sess2 } } = await supabase.auth.getSession();
        const user = sess2?.user ?? null;
        if (!user) return null;

        // Fetch DB activity + streams first (always available), then try live API for extra data
        const [dbActivityRes, dbStreamsRes] = await Promise.all([
          supabase
            .from("activity")
            .select("*")
            .eq("user_id", user.id)
            .eq("external_id", intervalsId)
            .maybeSingle(),
          supabase
            .from("activity_streams")
            .select("time, heartrate, cadence, altitude, pace, distance, latlng")
            .eq("user_id", user.id)
            .eq("activity_id", intervalsId)
            .maybeSingle(),
        ]);

        // Try live API calls (non-blocking — if they fail, we use DB data)
        let detailRes: { data: unknown; error: unknown } = { data: null, error: null };
        let streamsRes: { data: unknown; error: unknown } = { data: null, error: null };
        try {
          [detailRes, streamsRes] = await Promise.all([
            supabase.functions.invoke("intervals-proxy", {
              headers: { Authorization: `Bearer ${session.access_token}` },
              body: { action: "activity", activityId: intervalsId },
            }),
            supabase.functions.invoke("intervals-proxy", {
              headers: { Authorization: `Bearer ${session.access_token}` },
              body: { action: "streams", activityId: intervalsId },
            }),
          ]);
        } catch {
          // Live API failed — use DB data only
        }

        const a = (detailRes.data && typeof detailRes.data === "object" && !("error" in (detailRes.data as Record<string, unknown>)))
          ? detailRes.data as Record<string, unknown>
          : null;

        // If live API failed, build from DB activity row
        const dbAct = dbActivityRes.data as Record<string, unknown> | null;
        if (!a && !dbAct) return null;

        // Merge live API data with DB data (live API takes precedence where available)
        const src = a ?? dbAct!;
        const dist = Number(a?.distance ?? 0);
        const distKm = a ? (dist > 100 ? dist / 1000 : dist) : Number(dbAct?.distance_km ?? 0);
        const durSec = Number(a?.moving_time ?? a?.movingTime ?? a?.elapsed_time ?? a?.elapsedTime ?? a?.duration ?? dbAct?.duration_seconds ?? 0);
        const avgSpeed = a?.average_speed ?? a?.averageSpeed;
        let avgPace: string | null = dbAct?.avg_pace as string | null ?? null;
        if (avgSpeed != null && Number(avgSpeed) > 0) {
          const paceSec = 1000 / Number(avgSpeed);
          avgPace = `${Math.floor(paceSec / 60)}:${String(Math.round(paceSec % 60)).padStart(2, "0")}/km`;
        }
        const startDate = a?.start_date_local ?? a?.startDate ?? a?.date ?? dbAct?.date ?? "";
        const dateStr = startDate ? new Date(String(startDate)).toISOString().slice(0, 10) : "";

        let latlng: [number, number][] = [];
        const streams = streamsRes.data as Record<string, unknown> | null;
        const latlngRaw = streams?.latlng;

        // Also try DB latlng
        const dbLatlng = dbStreamsRes.data as { latlng?: unknown } | null;
        const rawPoints: unknown[] = (() => {
          // Try live proxy response first
          if (latlngRaw) {
            if (Array.isArray(latlngRaw)) return latlngRaw;
            if (typeof latlngRaw === "object" && "data" in (latlngRaw as Record<string, unknown>)) {
              const d = (latlngRaw as { data: unknown }).data;
              if (Array.isArray(d)) return d;
            }
          }
          // Fallback to DB
          if (dbLatlng?.latlng && Array.isArray(dbLatlng.latlng)) return dbLatlng.latlng as unknown[];
          return [];
        })();

        for (const pt of rawPoints) {
          if (Array.isArray(pt) && pt.length >= 2) {
            const lat = Number(pt[0]);
            const lng = Number(pt[1]);
            if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
              latlng.push([lat, lng]);
            }
          }
        }

        const toArray = (s: unknown): number[] => {
          if (Array.isArray(s)) return s.map((x) => Number(x)).filter((n) => !isNaN(n));
          if (s && typeof s === "object" && "data" in (s as object)) {
            const d = (s as { data: unknown[] }).data;
            return Array.isArray(d) ? d.map((x) => Number(x)).filter((n) => !isNaN(n)) : [];
          }
          return [];
        };

        const dbRow = dbStreamsRes.data as { time?: number[]; heartrate?: number[]; cadence?: number[]; altitude?: number[]; pace?: number[]; distance?: number[]; latlng?: number[][]; temperature?: number[]; respiration_rate?: number[] } | null;
        const dbTime = Array.isArray(dbRow?.time) ? dbRow.time : [];
        const dbHr = Array.isArray(dbRow?.heartrate) ? dbRow.heartrate : [];
        const dbAlt = Array.isArray(dbRow?.altitude) ? dbRow.altitude : [];
        const dbPace = Array.isArray(dbRow?.pace) ? dbRow.pace : [];
        const hasDbStreams =
          dbTime.length > 20 && (dbHr.length > 0 || dbAlt.length > 0 || dbPace.length > 0);

        const streamsRaw = streamsRes.data as Record<string, unknown> | null;
        const getStream = (k: string) => toArray(streamsRaw?.[k] ?? streamsRaw?.[k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())]);
        const timeArr = hasDbStreams ? dbTime : getStream("time");
        const hrArr = hasDbStreams ? dbHr : getStream("heartrate");
        const cadenceArr = hasDbStreams ? (Array.isArray(dbRow?.cadence) ? dbRow.cadence : []) : getStream("cadence");
        const altitudeArr = hasDbStreams ? dbAlt : getStream("altitude");
        const velocityArr = hasDbStreams ? [] : getStream("velocity_smooth");
        let paceArr = hasDbStreams ? dbPace : [];
        if (paceArr.length === 0 && velocityArr.length > 0) {
          paceArr = velocityArr.map((v: number) => (v > 0.1 ? 1000 / v / 60 : 0));
        } else if (paceArr.length === 0) {
          paceArr = toArray(streamsRaw?.pace);
        }
        const wattsArr = getStream("watts");
        const tempArr = hasDbStreams ? (Array.isArray(dbRow?.temperature) ? dbRow.temperature : []) : getStream("temperature");
        const respArr = hasDbStreams ? (Array.isArray(dbRow?.respiration_rate) ? dbRow.respiration_rate : []) : getStream("respiration_rate");
        const len = Math.max(timeArr.length, hrArr.length, latlng.length, 1);
        const dbDist = Array.isArray(dbRow?.distance) ? dbRow.distance : [];
        const distArr = hasDbStreams ? dbDist : getStream("distance");

        // Persist streams to DB when fetched from live API (so chart data is available for all activities on next view)
        const hasLiveStreams = !hasDbStreams && timeArr.length > 20 && (hrArr.length > 0 || paceArr.length > 0 || altitudeArr.length > 0);
        if (hasLiveStreams && user?.id) {
          supabase
            .from("activity_streams")
            .upsert(
              {
                user_id: user.id,
                activity_id: intervalsId,
                heartrate: hrArr.length ? hrArr : null,
                cadence: cadenceArr.length ? cadenceArr : null,
                altitude: altitudeArr.length ? altitudeArr : null,
                pace: paceArr.length ? paceArr : null,
                distance: distArr.length ? distArr : null,
                time: timeArr.length ? timeArr.map(Math.round) : null,
                latlng: latlng.length >= 2 ? latlng : null,
                temperature: tempArr.length ? tempArr : null,
                respiration_rate: respArr.length ? respArr : null,
              },
              { onConflict: "user_id,activity_id" }
            )
            .then(() => {})
            .catch(() => {});
        }

        const streamsData: ActivityStreams = {
          time: timeArr.length ? timeArr : Array.from({ length: len }, (_, i) => (i / (len - 1 || 1)) * durSec),
          heartrate: hrArr,
          cadence: cadenceArr,
          altitude: altitudeArr,
          velocity_smooth: velocityArr,
          pace: paceArr.length ? paceArr : undefined,
          watts: wattsArr,
          distance: distArr.length ? distArr : undefined,
          distance_km: distKm,
          temperature: tempArr.length ? tempArr : undefined,
          respiration_rate: respArr.length ? respArr : undefined,
        };

        const icuIntervals = (a?.icu_intervals ?? a?.intervals ?? []) as Array<Record<string, unknown>>;
        const splits = icuIntervals.length
          ? icuIntervals.map((iv) => {
              const distM = Number(iv.distance ?? 0);
              const movTime = Number(iv.moving_time ?? iv.movingTime ?? 0);
              const hr = (iv.average_heartrate ?? iv.averageHeartrate) != null ? Number(iv.average_heartrate ?? iv.averageHeartrate) : undefined;
              let pace = "";
              if (distM > 0 && movTime > 0) {
                const paceSec = movTime / (distM / 1000);
                pace = `${Math.floor(paceSec / 60)}:${String(Math.round(paceSec % 60)).padStart(2, "0")}/km`;
              }
              return {
                km: Math.round((distM / 1000) * 100) / 100,
                pace: pace || "-",
                elapsed_sec: movTime,
                hr,
              };
            })
          : buildSplitsFromStreams(latlng, durSec);

        const avgCadence = a?.cadence ?? a?.average_cadence ?? a?.averageCadence ?? dbAct?.cadence;

        return {
          id,
          dbId: (dbAct?.id as string) ?? undefined,
          user_id: user.id,
          date: dateStr,
          type: String(a?.type ?? dbAct?.type ?? "Run"),
          name: (a?.name ?? dbAct?.type) != null ? String(a?.name ?? dbAct?.type) : undefined,
          distance_km: distKm,
          duration_seconds: durSec,
          moving_time: durSec,
          elevation_gain: (a?.total_elevation_gain ?? dbAct?.elevation_gain) != null ? Number(a?.total_elevation_gain ?? dbAct?.elevation_gain) : null,
          avg_pace: avgPace,
          avg_hr: (a?.average_heartrate ?? a?.averageHeartrate ?? dbAct?.avg_hr) != null ? Number(a?.average_heartrate ?? a?.averageHeartrate ?? dbAct?.avg_hr) : null,
          max_hr: (a?.max_heartrate ?? a?.maxHeartrate ?? dbAct?.max_hr) != null ? Number(a?.max_heartrate ?? a?.maxHeartrate ?? dbAct?.max_hr) : null,
          avg_speed: a?.average_speed != null ? Number(a.average_speed) : undefined,
          cadence: avgCadence != null ? Number(avgCadence) : null,
          load: (a?.icu_training_load ?? a?.training_load ?? dbAct?.icu_training_load) != null ? Number(a?.icu_training_load ?? a?.training_load ?? dbAct?.icu_training_load) : null,
          intensity: (a?.intensity ?? a?.icu_intensity) != null ? Number(a?.intensity ?? a?.icu_intensity) : null,
          trimp: (a?.trimp ?? dbAct?.trimp) != null ? Number(a?.trimp ?? dbAct?.trimp) : null,
          calories: a?.calories != null ? Number(a.calories) : null,
          hr_zone_times: (() => {
            const raw = a?.icu_hr_zone_times ?? dbAct?.hr_zone_times;
            if (Array.isArray(raw)) return raw.map(Number);
            return null;
          })(),
          pace_zone_times: (() => {
            const raw = a?.icu_pace_zone_times ?? dbAct?.pace_zone_times;
            if (Array.isArray(raw)) return raw.map(Number);
            return null;
          })(),
          perceived_exertion: (a?.perceived_exertion ?? dbAct?.perceived_exertion) != null ? Number(a?.perceived_exertion ?? dbAct?.perceived_exertion) : null,
          coach_note: dbAct?.coach_note as string | null ?? null,
          user_notes: dbAct?.user_notes as string | null ?? null,
          nomio_drink: dbAct?.nomio_drink as boolean | null ?? null,
          lactate_levels: dbAct?.lactate_levels as string | null ?? null,
          enhancing_supplements: (dbAct?.enhancing_supplements as EnhancingSupplements | null) ?? null,
          photos: parsePhotos(dbAct?.photos),
          source: "intervals_icu",
          latlng,
          splits,
          streams: streamsData,
          intervals: icuIntervals.map((iv) => ({
            distance: Number(iv.distance ?? 0),
            moving_time: Number(iv.moving_time ?? iv.movingTime ?? 0),
            average_heartrate: (iv.average_heartrate ?? iv.averageHeartrate) != null ? Number(iv.average_heartrate ?? iv.averageHeartrate) : undefined,
            zone: iv.zone != null ? Number(iv.zone) : undefined,
            type: iv.type != null ? String(iv.type) : undefined,
          })),
        };
      }

      // Supabase activity (fetch by id only so friends can view; RLS allows read when activity owner is a friend)
      const { data: { session: sess3 } } = await supabase.auth.getSession();
      const user = sess3?.user ?? null;
      if (!user) return null;
      let row: Record<string, unknown> | null = null;
      let edgeFallbackStream: unknown = null;
      let edgeLikes: { id: string; user_id: string }[] | undefined;
      let edgeComments: { id: string; user_id: string; content: string; created_at: string }[] | undefined;

      const { data: directRow, error } = await supabase
        .from("activity")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (directRow) {
        row = directRow as Record<string, unknown>;
      } else {
        if (import.meta.env.DEV && error) {
          console.warn("[useActivityDetail] Direct query failed, trying edge fallback", error.message);
        }
        const baseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
        if (baseUrl && session.access_token) {
          try {
            const res = await fetch(`${baseUrl}/functions/v1/community-proxy`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.access_token}`,
                apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
              },
              body: JSON.stringify({ __path: "friend-activity-detail", activity_id: id }),
            });
            if (res.ok) {
              const json = await res.json() as {
                activity?: Record<string, unknown>;
                stream?: unknown;
                likes?: { id: string; user_id: string }[];
                comments?: { id: string; user_id: string; content: string; created_at: string }[];
              };
              if (json.activity) {
                row = json.activity;
                edgeFallbackStream = json.stream ?? null;
                edgeLikes = json.likes;
                edgeComments = json.comments;
              }
            } else if (import.meta.env.DEV) {
              console.warn("[useActivityDetail] friend-activity-detail failed", res.status, await res.text());
            }
          } catch (e) {
            if (import.meta.env.DEV) console.warn("[useActivityDetail] friend-activity-detail request error", e);
          }
        }
      }

      if (!row) return null;

      const rowUserId = row.user_id as string | undefined;
      const isOwner = rowUserId === user.id;

      // Load streams: if the edge fallback already returned streams, use those; otherwise query directly.
      let dbStreams: unknown = edgeFallbackStream ?? null;
      let edgeStreamError: string | null = null;
      if (!dbStreams && rowUserId) {
        const extId = row.external_id as string | null;
        const garminId = row.garmin_id as string | null;
        const extIdNumeric = extId != null && extId.startsWith("i") && extId.length > 1 ? extId.slice(1) : null;
        const candidateKeys: string[] = [extId, extIdNumeric, id, garminId != null ? `garmin_${garminId}` : null].filter(
          (k): k is string => k != null && k !== ""
        );
        const seen = new Set<string>();
        const keysToTry = candidateKeys.filter((k) => {
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        const cols = "time, heartrate, cadence, altitude, pace, distance, latlng, temperature, respiration_rate";
        const base = () => supabase.from("activity_streams").select(cols).eq("user_id", rowUserId);
        for (const key of keysToTry) {
          const res = await base().eq("activity_id", key).maybeSingle();
          if (res.data) {
            dbStreams = res.data;
            break;
          }
        }
        if (!dbStreams && !isOwner) {
          const baseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
          const { data: { session: streamSession } } = await supabase.auth.getSession();
          if (streamSession?.access_token && baseUrl) {
            try {
              const streamRes = await fetch(`${baseUrl}/functions/v1/community-proxy`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${streamSession.access_token}`,
                  apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
                },
                body: JSON.stringify({ __path: "activity-stream", activity_id: id }),
              });
              if (streamRes.ok) {
                const json = await streamRes.json() as { stream?: unknown };
                if (json.stream) dbStreams = json.stream;
              } else if (import.meta.env.DEV) {
                const bodyText = await streamRes.text();
                console.warn("[useActivityDetail] activity-stream failed", streamRes.status, bodyText);
                edgeStreamError = `${streamRes.status}: ${bodyText}`;
              }
            } catch (e) {
              if (import.meta.env.DEV) {
                const msg = e instanceof Error ? e.message : String(e);
                console.warn("[useActivityDetail] activity-stream request failed", msg);
                edgeStreamError = msg;
              }
            }
          }
        }
      }
      const sRow = dbStreams as { time?: number[]; heartrate?: number[]; cadence?: number[]; altitude?: number[]; pace?: number[]; distance?: number[]; latlng?: number[][]; temperature?: number[]; respiration_rate?: number[] } | null;

      let latlng: [number, number][] = [];
      const poly = row.polyline as string | null;
      if (poly && typeof poly === "string") latlng = decodePolyline(poly);
      // Try DB latlng if polyline is empty
      if (latlng.length === 0 && Array.isArray(sRow?.latlng)) {
        latlng = sRow.latlng
          .filter((p): p is number[] => Array.isArray(p) && p.length >= 2)
          .map((p) => [Number(p[0]), Number(p[1])] as [number, number])
          .filter(([lat, lng]) => isFinite(lat) && isFinite(lng) && lat !== 0 && lng !== 0);
      }

      const rawSplits = row.splits as Array<Record<string, unknown>> | null;
      const splits = Array.isArray(rawSplits)
        ? rawSplits.map((s) => ({
            km: s.km != null ? Number(s.km) : undefined,
            pace: s.pace != null ? String(s.pace) : undefined,
            elapsed_sec: s.elapsed_sec ?? s.elapsedSec != null ? Number(s.elapsed_sec ?? s.elapsedSec) : undefined,
            hr: s.hr != null ? Number(s.hr) : undefined,
            elevation: s.elevation != null ? Number(s.elevation) : undefined,
          }))
        : buildSplitsFromStreams(latlng, Number(row.duration_seconds ?? 0));

      const durSec = Number(row.duration_seconds ?? 0);
      const dbTime = Array.isArray(sRow?.time) ? sRow.time : [];
      const dbHr = Array.isArray(sRow?.heartrate) ? sRow.heartrate : [];
      const dbAlt = Array.isArray(sRow?.altitude) ? sRow.altitude : [];
      const dbPace = Array.isArray(sRow?.pace) ? sRow.pace : [];
      const dbCad = Array.isArray(sRow?.cadence) ? sRow.cadence : [];
      const dbDist = Array.isArray(sRow?.distance) ? sRow.distance : [];
      const hasStreams = dbTime.length > 20 && (dbHr.length > 0 || dbAlt.length > 0 || dbPace.length > 0 || dbCad.length > 0);

      return {
        id: row.id as string,
        dbId: row.id as string,
        user_id: rowUserId,
        date: (row.date as string) ?? "",
        type: (row.type as string) ?? "Run",
        name: row.name != null ? String(row.name) : undefined,
        distance_km: Number(row.distance_km ?? 0),
        duration_seconds: durSec,
        elevation_gain: row.elevation_gain != null ? Number(row.elevation_gain) : null,
        avg_pace: (row.avg_pace as string | null) ?? null,
        avg_hr: row.avg_hr != null ? Number(row.avg_hr) : null,
        max_hr: row.max_hr != null ? Number(row.max_hr) : null,
        cadence: row.cadence != null ? Number(row.cadence) : null,
        load: row.icu_training_load != null ? Number(row.icu_training_load) : null,
        trimp: row.trimp != null ? Number(row.trimp) : null,
        hr_zone_times: Array.isArray(row.hr_zone_times) ? (row.hr_zone_times as number[]).map(Number) : null,
        pace_zone_times: Array.isArray(row.pace_zone_times) ? (row.pace_zone_times as number[]).map(Number) : null,
        perceived_exertion: row.perceived_exertion != null ? Number(row.perceived_exertion) : null,
        source: (row.source as string) ?? "garmin",
        coach_note: isOwner ? (row.coach_note as string | null ?? null) : null,
        user_notes: isOwner ? (row.user_notes as string | null ?? null) : null,
        nomio_drink: row.nomio_drink as boolean | null ?? null,
        lactate_levels: row.lactate_levels as string | null ?? null,
        enhancing_supplements: isOwner ? ((row.enhancing_supplements as EnhancingSupplements | null) ?? null) : null,
        photos: parsePhotos(row.photos),
        latlng,
        splits,
        streams: hasStreams ? {
          time: dbTime,
          heartrate: dbHr,
          cadence: dbCad,
          altitude: dbAlt,
          velocity_smooth: [],
          pace: dbPace.length ? dbPace : undefined,
          watts: [],
          distance: dbDist.length ? dbDist : undefined,
          distance_km: Number(row.distance_km ?? 0),
          temperature: Array.isArray(sRow?.temperature) && sRow.temperature.length ? sRow.temperature : undefined,
          respiration_rate: Array.isArray(sRow?.respiration_rate) && sRow.respiration_rate.length ? sRow.respiration_rate : undefined,
        } : undefined,
        ...(edgeStreamError ? { streamFetchError: edgeStreamError } : {}),
        ...(edgeLikes ? { edgeLikes } : {}),
        ...(edgeComments ? { edgeComments } : {}),
      };
    },
    enabled: !!activityId,
  });
}
