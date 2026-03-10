import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function formatPace(distanceKm: number, durationSec: number): string {
  if (!distanceKm || distanceKm < 0.001) return "";
  const paceSecPerKm = durationSec / distanceKm;
  const min = Math.floor(paceSecPerKm / 60);
  const sec = Math.round(paceSecPerKm % 60);
  return `${min}:${String(sec).padStart(2, "0")} /km`;
}

/** Parse NDJSON (one JSON object per line) - common in Garmin exports */
function parseNdjsonActivities(text: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s === "{" || s === "}") continue;
    try {
      const p = JSON.parse(s) as unknown;
      if (p && typeof p === "object" && !Array.isArray(p)) {
        const o = p as Record<string, unknown>;
        if (o.ActivityType ?? o.activityType ?? o.SummaryId ?? o.summaryId ?? o.ActivityId ?? o.activityId) out.push(o);
      }
    } catch {
      /* skip */
    }
  }
  return out;
}

function parseSummarizedActivitiesExport(text: string): Array<{
  date: string;
  type: string;
  distance_km: number | null;
  duration_seconds: number | null;
  avg_pace: string | null;
  avg_hr: number | null;
  max_hr: number | null;
  cadence: number | null;
  elevation_gain: number | null;
  garmin_id: string;
}> {
  const results: Array<ReturnType<typeof parseSummarizedActivitiesExport>[number]> = [];
  try {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length < 100) return results;
    // Try NDJSON first (one activity per line)
    const ndjsonObjs = parseNdjsonActivities(trimmed);
    if (ndjsonObjs.length > 0) {
      for (let i = 0; i < ndjsonObjs.length; i++) {
        const obj = ndjsonObjs[i] as Record<string, unknown>;
        const actType = String(obj.activityType ?? obj.ActivityType ?? obj.sportType ?? obj.type ?? "").toLowerCase();
        const durRaw = Number(obj.DurationInSeconds ?? obj.durationInSeconds ?? obj.duration ?? 0);
        const durSec = durRaw > 100000 ? durRaw / 1000 : durRaw;
        const distM = Number(obj.DistanceInMeters ?? obj.distanceInMeters ?? obj.distance ?? 0);
        if (durSec < 15 && distM < 10) continue;
        const ts = Number(obj.StartTimeInSeconds ?? obj.startTimeInSeconds ?? obj.startTimeGmt ?? obj.beginTimestamp ?? obj.startTime ?? 0);
        const insertedStr = obj.InsertedDate ?? obj.insertedDate;
        const date =
          ts > 0
            ? new Date(ts > 1e10 ? ts : ts * 1000).toISOString().slice(0, 10)
            : typeof insertedStr === "string" && /^\d{4}-\d{2}-\d{2}/.test(insertedStr)
              ? (insertedStr as string).slice(0, 10)
              : new Date().toISOString().slice(0, 10);
        const garminId = String(obj.ActivityId ?? obj.activityId ?? obj.SummaryId ?? obj.summaryId ?? obj.id ?? `sum_${Date.now()}_${i}`);
        const distanceKm = distM > 0 ? Math.round((distM / 1000) * 100) / 100 : (durSec ? 0.01 : null);
        const typeStr = /run|walk|cycle|swim|hike|yoga|indoor/i.test(actType) ? actType.replace(/_/g, " ") : actType || "run";
        results.push({
          date,
          type: typeStr,
          distance_km: distanceKm,
          duration_seconds: durSec || null,
          avg_pace: distanceKm && durSec ? formatPace(distanceKm, durSec) : null,
          avg_hr: Number(obj.AverageHeartRateInBeatsPerMinute ?? obj.averageHeartRate ?? obj.avgHeartRate) || null,
          max_hr: Number(obj.MaxHeartRateInBeatsPerMinute ?? obj.maxHeartRate ?? obj.maxHr) || null,
          cadence: Number(obj.AverageRunCadenceInStepsPerMinute ?? obj.averageRunCadence ?? obj.avgCadence) || null,
          elevation_gain: Number(obj.TotalElevationGainInMeters ?? obj.totalElevationGain ?? obj.elevationGain) || null,
          garmin_id: garminId,
        });
      }
      return results;
    }
    const parsed = JSON.parse(trimmed) as unknown;
    let arr: unknown[] = [];
    if (Array.isArray(parsed) && parsed.length > 0) {
      const first = parsed[0] as Record<string, unknown>;
      arr = (Array.isArray(first?.summarizedActivitiesExport)
        ? first.summarizedActivitiesExport
        : Array.isArray(first?.summarizedActivities)
        ? first.summarizedActivities
        : parsed) as unknown[];
    } else if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const r = parsed as Record<string, unknown>;
      arr = (Array.isArray(r.summarizedActivitiesExport)
        ? r.summarizedActivitiesExport
        : Array.isArray(r.summarizedActivities)
        ? r.summarizedActivities
        : []) as unknown[];
    }
    const list = Array.isArray(arr) ? arr : [];
    for (const o of list) {
      if (!o || typeof o !== "object") continue;
      const obj = o as Record<string, unknown>;
      const actType = String(obj.activityType ?? obj.ActivityType ?? obj.sportType ?? obj.type ?? "").toLowerCase();
      const durRaw = Number(obj.duration ?? obj.durationInSeconds ?? obj.DurationInSeconds ?? 0);
      const durSec = durRaw > 100000 ? durRaw / 1000 : durRaw;
      const distM = Number(obj.distance ?? obj.distanceInMeters ?? obj.DistanceInMeters ?? 0);
      if (durSec < 15 && distM < 10) continue;
      const ts = Number(obj.startTimeGmt ?? obj.StartTimeGmt ?? obj.startTimeGMT ?? obj.StartTimeInSeconds ?? obj.beginTimestamp ?? obj.startTime ?? 0);
      const date = ts > 0 ? new Date(ts > 1e10 ? ts : ts * 1000).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
      const garminId = String(obj.activityId ?? obj.ActivityId ?? obj.summaryId ?? obj.SummaryId ?? obj.id ?? `sum_${Date.now()}_${results.length}`);
      const distanceKm = distM > 0 ? Math.round((distM / 1000) * 100) / 100 : (durSec ? 0.01 : null);
      const typeStr = /run|walk|cycle|swim|hike/i.test(actType) ? actType.replace(/_/g, " ") : actType || "run";
      results.push({
        date,
        type: typeStr,
        distance_km: distanceKm,
        duration_seconds: durSec || null,
        avg_pace: distanceKm && durSec ? formatPace(distanceKm, durSec) : null,
        avg_hr: Number(obj.averageHeartRate ?? obj.avgHeartRate ?? obj.avgHr ?? obj.AverageHeartRateInBeatsPerMinute) || null,
        max_hr: Number(obj.maxHeartRate ?? obj.maxHr ?? obj.MaxHeartRateInBeatsPerMinute) || null,
        cadence: Number(obj.averageRunCadence ?? obj.avgCadence ?? obj.avgRunCadence ?? obj.AverageRunCadenceInStepsPerMinute) || null,
        elevation_gain: Number(obj.totalElevationGain ?? obj.TotalElevationGainInMeters ?? obj.elevationGain) || null,
        garmin_id: garminId,
      });
    }
  } catch (err) {
    console.error("garmin-parse-activities error:", err);
  }
  return results;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Authorization required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const jsonText = typeof body?.json === "string" ? body.json : "";
    if (!jsonText || jsonText.length < 100) {
      return new Response(JSON.stringify({ error: "JSON text required (min 100 chars)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const activities = parseSummarizedActivitiesExport(jsonText);
    return new Response(
      JSON.stringify({ activities, count: activities.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Parse failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
