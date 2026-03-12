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
  source: string;
  latlng: [number, number][];
  splits: Array<{ km?: number; pace?: string; elapsed_sec?: number; hr?: number; elevation?: number }>;
  intervals?: Array<{ distance?: number; moving_time?: number; average_heartrate?: number; zone?: number; type?: string }>;
  streams?: ActivityStreams;
}

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
      const min = Math.floor(paceSecPerKm / 60);
      const sec = Math.round(paceSecPerKm % 60);
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

      // Supabase activity
      const { data: { session: sess3 } } = await supabase.auth.getSession();
      const user = sess3?.user ?? null;
      if (!user) return null;
      const { data: row, error } = await supabase
        .from("activity")
        .select("id, date, type, distance_km, duration_seconds, avg_pace, avg_hr, max_hr, cadence, source, splits, polyline, elevation_gain, external_id, coach_note, user_notes, nomio_drink, lactate_levels, icu_training_load, trimp, hr_zone_times, pace_zone_times, perceived_exertion")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();

      if (error || !row) return null;

      // Load streams from DB if available
      const extId = (row as Record<string, unknown>).external_id as string | null;
      const streamQuery = extId
        ? supabase.from("activity_streams").select("time, heartrate, cadence, altitude, pace, distance, latlng, temperature, respiration_rate").eq("user_id", user.id).eq("activity_id", extId).maybeSingle()
        : supabase.from("activity_streams").select("time, heartrate, cadence, altitude, pace, distance, latlng, temperature, respiration_rate").eq("user_id", user.id).eq("activity_id", id).maybeSingle();
      const { data: dbStreams } = await streamQuery;
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
      const hasStreams = dbTime.length > 20 && (dbHr.length > 0 || dbAlt.length > 0 || dbPace.length > 0);

      const r = row as Record<string, unknown>;
      return {
        id: row.id,
        date: row.date ?? "",
        type: row.type ?? "Run",
        distance_km: Number(row.distance_km ?? 0),
        duration_seconds: durSec,
        elevation_gain: row.elevation_gain != null ? Number(row.elevation_gain) : null,
        avg_pace: row.avg_pace,
        avg_hr: row.avg_hr != null ? Number(row.avg_hr) : null,
        max_hr: row.max_hr != null ? Number(row.max_hr) : null,
        cadence: r.cadence != null ? Number(r.cadence) : null,
        load: r.icu_training_load != null ? Number(r.icu_training_load) : null,
        trimp: r.trimp != null ? Number(r.trimp) : null,
        hr_zone_times: Array.isArray(r.hr_zone_times) ? (r.hr_zone_times as number[]).map(Number) : null,
        pace_zone_times: Array.isArray(r.pace_zone_times) ? (r.pace_zone_times as number[]).map(Number) : null,
        perceived_exertion: r.perceived_exertion != null ? Number(r.perceived_exertion) : null,
        source: row.source ?? "garmin",
        coach_note: r.coach_note as string | null ?? null,
        user_notes: r.user_notes as string | null ?? null,
        nomio_drink: r.nomio_drink as boolean | null ?? null,
        lactate_levels: r.lactate_levels as string | null ?? null,
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
      };
    },
    enabled: !!activityId,
  });
}
