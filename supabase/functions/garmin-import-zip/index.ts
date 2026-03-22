import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { unzipSync, strFromU8 } from "https://esm.sh/fflate@0.8.2";

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
        const hasActivity = o.ActivityType ?? o.activityType ?? o.SummaryId ?? o.summaryId ?? o.ActivityId ?? o.activityId;
        if (hasActivity) out.push(o);
      }
    } catch {
      /* skip malformed line */
    }
  }
  return out;
}

function parseSummarizedActivitiesExport(
  text: string,
  userId: string
): Array<{
  user_id: string;
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
  source: string;
}> {
  const results: Array<{
    user_id: string;
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
    source: string;
  }> = [];
  try {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length < 100) return results;
    if (!/^\s*(?:\[|{)/.test(trimmed)) return results; // Skip binary / non-JSON files
    // Try NDJSON first (one activity object per line - common in Garmin exports)
    const ndjsonObjs = parseNdjsonActivities(trimmed);
    if (ndjsonObjs.length > 0) {
      const list = ndjsonObjs;
      for (let i = 0; i < list.length; i++) {
        const obj = list[i] as Record<string, unknown>;
        const actType = String(obj.activityType ?? obj.ActivityType ?? obj.sportType ?? obj.type ?? "").toLowerCase();
        const durRaw = Number(obj.duration ?? obj.DurationInSeconds ?? obj.durationInSeconds ?? 0);
        const durSec = durRaw > 100000 ? durRaw / 1000 : durRaw;
        const distM = Number(obj.distance ?? obj.DistanceInMeters ?? obj.distanceInMeters ?? 0);
        if (durSec < 15 && distM < 10) continue;
        const ts = Number(obj.StartTimeInSeconds ?? obj.startTimeInSeconds ?? obj.startTimeGmt ?? obj.StartTimeGmt ?? obj.beginTimestamp ?? obj.startTime ?? 0);
        const insertedStr = obj.InsertedDate ?? obj.insertedDate;
        let date = "";
        if (ts > 0) date = new Date(ts > 1e10 ? ts : ts * 1000).toISOString().slice(0, 10);
        else if (typeof insertedStr === "string" && /^\d{4}-\d{2}-\d{2}/.test(insertedStr)) date = insertedStr.slice(0, 10);
        else date = new Date().toISOString().slice(0, 10);
        const garminId = String(obj.ActivityId ?? obj.activityId ?? obj.SummaryId ?? obj.summaryId ?? obj.id ?? `sum_${Date.now()}_${i}`);
        const distanceKm = distM > 0 ? Math.round((distM / 1000) * 100) / 100 : (durSec ? 0.01 : null);
        const typeStr = /run|walk|cycle|swim|hike|yoga|indoor/i.test(actType) ? actType.replace(/_/g, " ") : actType || "run";
        results.push({
          user_id: userId,
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
          source: "garmin",
        });
      }
      return results;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      return results;
    }
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
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (!o || typeof o !== "object") continue;
      const obj = o as Record<string, unknown>;
      const actType = String(obj.activityType ?? obj.ActivityType ?? obj.sportType ?? obj.type ?? "").toLowerCase();
      const durRaw = Number(obj.duration ?? obj.durationInSeconds ?? obj.DurationInSeconds ?? 0);
      const durSec = durRaw > 100000 ? durRaw / 1000 : durRaw;
      const distM = Number(obj.distance ?? obj.distanceInMeters ?? obj.DistanceInMeters ?? 0);
      if (durSec < 15 && distM < 10) continue;
      const ts = Number(obj.startTimeGmt ?? obj.StartTimeGmt ?? obj.startTimeGMT ?? obj.StartTimeInSeconds ?? obj.beginTimestamp ?? obj.startTime ?? 0);
      const insertedStr = obj.InsertedDate ?? obj.insertedDate;
      const date =
        ts > 0
          ? new Date(ts > 1e10 ? ts : ts * 1000).toISOString().slice(0, 10)
          : typeof insertedStr === "string" && /^\d{4}-\d{2}-\d{2}/.test(insertedStr)
            ? (insertedStr as string).slice(0, 10)
            : new Date().toISOString().slice(0, 10);
      const garminId = String(obj.activityId ?? obj.ActivityId ?? obj.summaryId ?? obj.SummaryId ?? obj.id ?? `sum_${Date.now()}_${i}`);
      const distanceKm = distM > 0 ? Math.round((distM / 1000) * 100) / 100 : (durSec ? 0.01 : null);
      const typeStr = /run|walk|cycle|swim|hike/i.test(actType) ? actType.replace(/_/g, " ") : actType || "run";
      results.push({
        user_id: userId,
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
        source: "garmin",
      });
    }
  } catch {
    /* skip invalid files */
  }
  return results;
}

function parseCsvToRows(csvText: string): Record<string, string>[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      row[h] = vals[j] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

function parseWellnessRow(
  row: Record<string, string>,
  userId: string
): { user_id: string; date: string; sleep_hours: number | null; sleep_quality: number | null; hrv: number | null; resting_hr: number | null } | null {
  const dateRaw = row["Date"] ?? row["date"] ?? row["calendarDate"] ?? row["CalendarDate"] ?? row["Sleep Date"] ?? row["sleepDate"] ?? "";
  const dateMatch = dateRaw.match(/(\d{4})-(\d{2})-(\d{2})/) ?? dateRaw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  const date = dateMatch
    ? (dateMatch[1] as string).length === 4
      ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
      : `${dateMatch[3]}-${dateMatch[1]}-${dateMatch[2]}`
    : null;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const y = parseInt(date.slice(0, 4), 10);
  if (y < 2010 || y > new Date().getFullYear() + 1) return null;

  const sleepSec = parseFloat(row["sleepSeconds"] ?? row["Sleep Seconds"] ?? row["DurationInSeconds"] ?? row["totalSleepTime"] ?? row["Total Sleep"] ?? row["sleep_hours"] ?? "") || null;
  const sleepHoursFromSec = sleepSec && sleepSec > 24 ? sleepSec / 3600 : sleepSec;
  const sleep = (sleepHoursFromSec ?? parseFloat(row["sleepHours"] ?? row["Sleep Hours"] ?? row["sleep_hours"] ?? "")) || null;
  const sleepQuality = parseInt(row["sleepScore"] ?? row["Sleep Quality"] ?? row["sleep_quality"] ?? row["overallSleepScore"] ?? "", 10) || null;
  const hrv = parseFloat(row["hrvSDNN"] ?? row["HRV"] ?? row["hrv"] ?? row["restingHeartRateVariability"] ?? row["hrvSdnn"] ?? "") || null;
  const restingHr = parseInt(row["restingHeartRate"] ?? row["Resting HR"] ?? row["resting_hr"] ?? row["Resting Heart Rate"] ?? row["restingHeartRate"] ?? "", 10) || null;

  if (!sleep && !hrv && !restingHr && !sleepQuality) return null;

  return { user_id: userId, date, sleep_hours: sleep, sleep_quality: sleepQuality, hrv, resting_hr: restingHr };
}

function isActivityJsonPath(path: string): boolean {
  const n = path.replace(/\\/g, "/").toLowerCase();
  return (
    n.includes("garminactivitysummary") ||
    n.includes("activitysummary") ||
    n.includes("summarizedfitness") ||
    n.includes("summarized_fitness") ||
    n.includes("summarizedactivities") ||
    n.includes("di-connect-metrics") ||
    n.includes("di_connect_metrics") ||
    /activities\.json$/i.test(path) ||
    /summarized.*\.json$/i.test(path) ||
    /di-connect-fitness.*\.json$/i.test(path)
  );
}

function isWellnessCsvPath(path: string): boolean {
  const n = path.replace(/\\/g, "/").toLowerCase();
  return (
    (n.includes("di-connect-wellness") || n.includes("wellness") || n.includes("dailysummary")) &&
    /\.csv$/i.test(path)
  );
}

function isActivityCsvPath(path: string): boolean {
  const n = path.replace(/\\/g, "/").toLowerCase();
  return (
    (n.includes("garminactivitysummary") || n.includes("activitysummary") || n.includes("di-connect-fitness")) &&
    /\.csv$/i.test(path)
  );
}

function isActivityCsv(rows: Record<string, string>[]): boolean {
  if (!rows[0]) return false;
  const keys = Object.keys(rows[0]).map((k) => k.toLowerCase());
  return (
    keys.some((k) => k.includes("activitytype") || k === "type") &&
    keys.some((k) => k.includes("duration") || k.includes("distance") || k.includes("starttime"))
  );
}

function parseActivityCsv(
  rows: Record<string, string>[],
  userId: string
): Array<{ user_id: string; date: string; type: string; distance_km: number | null; duration_seconds: number | null; avg_pace: string | null; avg_hr: number | null; max_hr: number | null; cadence: number | null; elevation_gain: number | null; garmin_id: string; source: string }> {
  const results: Array<ReturnType<typeof parseActivityCsv>[number]> = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const activityType = (r["ActivityType"] ?? r["activityType"] ?? r["type"] ?? "").toUpperCase();
    const distM = parseFloat(r["DistanceInMeters"] ?? r["distanceInMeters"] ?? r["distance"] ?? "0") || 0;
    const durSec = parseFloat(r["DurationInSeconds"] ?? r["durationInSeconds"] ?? r["duration"] ?? "0") || 0;
    if (distM < 5 && durSec < 20) continue;
    const distanceKm = distM > 0 ? Math.round((distM / 1000) * 100) / 100 : null;
    const durationSec = durSec || null;
    if (!distanceKm && !durationSec) continue;
    const startSec = parseFloat(r["StartTimeInSeconds"] ?? r["startTimeInSeconds"] ?? r["startTime"] ?? "0");
    const date = startSec
      ? new Date(startSec * 1000).toISOString().slice(0, 10)
      : (r["InsertedDate"] ?? r["insertedDate"] ?? "").slice(0, 10) || new Date().toISOString().slice(0, 10);
    const garminId = r["SummaryId"] ?? r["ActivityId"] ?? r["summaryId"] ?? r["activityId"] ?? `csv_${Date.now()}_${i}`;
    results.push({
      user_id: userId,
      date,
      type: /running|run/i.test(activityType) ? "run" : activityType.toLowerCase().replace(/_/g, " "),
      distance_km: distanceKm ?? (durationSec ? 0.01 : null),
      duration_seconds: durationSec,
      avg_pace: distanceKm && durationSec ? formatPace(distanceKm, durationSec) : null,
      avg_hr: parseInt(r["AverageHeartRateInBeatsPerMinute"] ?? r["averageHeartRate"] ?? "", 10) || null,
      max_hr: parseInt(r["MaxHeartRateInBeatsPerMinute"] ?? r["maxHeartRate"] ?? "", 10) || null,
      cadence: parseInt(r["AverageRunCadenceInStepsPerMinute"] ?? r["averageRunCadence"] ?? "", 10) || null,
      elevation_gain: parseFloat(r["TotalElevationGainInMeters"] ?? r["elevationGain"] ?? "") || null,
      garmin_id: String(garminId),
      source: "garmin",
    });
  }
  return results;
}

function isWellnessCsv(rows: Record<string, string>[]): boolean {
  if (!rows[0]) return false;
  if (isActivityCsv(rows)) return false;
  const keys = Object.keys(rows[0]).map((k) => k.toLowerCase());
  return keys.some(
    (k) =>
      k.includes("sleep") ||
      k.includes("hrv") ||
      k.includes("resting") ||
      k.includes("calendar") ||
      k.includes("date")
  );
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
    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Authorization required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const storagePath = typeof body?.storagePath === "string" ? body.storagePath.trim() : "";
    if (!storagePath) {
      return new Response(JSON.stringify({ error: "Missing storagePath" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prevent path traversal: must start with user_id/ and contain no ..
    const prefix = `${user.id}/`;
    if (!storagePath.startsWith(prefix) || storagePath.includes("..")) {
      return new Response(JSON.stringify({ error: "Invalid storage path" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: zipData, error: downloadErr } = await supabase.storage
      .from("garmin-imports")
      .download(storagePath);

    if (downloadErr || !zipData) {
      console.error("Download error:", downloadErr);
      return new Response(
        JSON.stringify({ error: "Failed to download ZIP from storage. Is the bucket 'garmin-imports' created?" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const zipBytes = new Uint8Array(await zipData.arrayBuffer());

    function collectAllFiles(
      zip: Record<string, Uint8Array>,
      prefix = ""
    ): Array<{ path: string; data: Uint8Array }> {
      const out: Array<{ path: string; data: Uint8Array }> = [];
      for (const [p, data] of Object.entries(zip)) {
        const fullPath = prefix ? `${prefix}/${p}` : p;
        if (/\.zip$/i.test(p)) {
          try {
            const nested = unzipSync(data, { filter: () => true });
            out.push(...collectAllFiles(nested, fullPath.replace(/\.zip$/i, "")));
          } catch {
            /* skip broken nested zip */
          }
        } else if (!p.endsWith("/")) {
          out.push({ path: fullPath.replace(/\\/g, "/"), data });
        }
      }
      return out;
    }

    let extracted: Record<string, Uint8Array>;
    try {
      extracted = unzipSync(zipBytes, { filter: () => true });
    } catch (zipErr) {
      console.error("Unzip error:", zipErr);
      return new Response(
        JSON.stringify({
          error:
            "ZIP extraction failed. Try re-compressing with 7-Zip or The Unarchiver instead of macOS Compress.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const allFiles = collectAllFiles(extracted);
    const readinessDates = new Set<string>();
    let activitiesCount = 0;

    const sortPriority = (p: string) =>
      /summarizedactivities/i.test(p) ? 0 : /activity|fitness/i.test(p) ? 1 : 2;
    allFiles.sort((a, b) => sortPriority(a.path) - sortPriority(b.path));

    for (const { path: normalizedPath, data } of allFiles) {
      const text = strFromU8(data);
      const looksLikeJson = (s: string) => {
        const t = s.trim();
        return t.length >= 10 && (t.charAt(0) === "{" || t.charAt(0) === "[");
      };

      if (/\.json$/i.test(normalizedPath) && isActivityJsonPath(normalizedPath) && looksLikeJson(text)) {
        const activities = parseSummarizedActivitiesExport(text, user.id);
        for (const a of activities) {
          const row = {
            user_id: a.user_id,
            date: a.date,
            type: a.type || "run",
            distance_km: a.distance_km,
            duration_seconds: a.duration_seconds != null ? Math.round(a.duration_seconds) : null,
            avg_pace: a.avg_pace,
            avg_hr: a.avg_hr != null ? Math.round(a.avg_hr) : null,
            max_hr: a.max_hr != null ? Math.round(a.max_hr) : null,
            cadence: a.cadence != null ? Math.round(a.cadence) : null,
            elevation_gain: a.elevation_gain,
            polyline: null,
            hr_zones: {},
            garmin_id: (a.garmin_id || "").trim(),
            source: "garmin",
          };
          if (!row.garmin_id) continue;
          const { error } = await supabase.from("activity").upsert(row, { onConflict: "user_id,garmin_id" });
          if (!error) activitiesCount++;
        }
      }

      if (/\.csv$/i.test(normalizedPath) && isActivityCsvPath(normalizedPath)) {
        const rows = parseCsvToRows(text);
        if (rows.length && isActivityCsv(rows)) {
          for (const a of parseActivityCsv(rows, user.id)) {
            if (!a.garmin_id?.trim()) continue;
            const row = {
              user_id: a.user_id,
              date: a.date,
              type: a.type || "run",
              distance_km: a.distance_km,
              duration_seconds: a.duration_seconds != null ? Math.round(a.duration_seconds) : null,
              avg_pace: a.avg_pace,
              avg_hr: a.avg_hr != null ? Math.round(a.avg_hr) : null,
              max_hr: a.max_hr != null ? Math.round(a.max_hr) : null,
              cadence: a.cadence != null ? Math.round(a.cadence) : null,
              elevation_gain: a.elevation_gain,
              polyline: null,
              hr_zones: {},
              garmin_id: a.garmin_id.trim(),
              source: "garmin",
            };
            const { error } = await supabase.from("activity").upsert(row, { onConflict: "user_id,garmin_id" });
            if (!error) activitiesCount++;
          }
        }
      }

      if (/\.csv$/i.test(normalizedPath) && isWellnessCsvPath(normalizedPath)) {
        const rows = parseCsvToRows(text);
        if (rows.length && isActivityCsv(rows)) {
          for (const a of parseActivityCsv(rows, user.id)) {
            if (!a.garmin_id?.trim()) continue;
            const row = {
              user_id: a.user_id,
              date: a.date,
              type: a.type || "run",
              distance_km: a.distance_km,
              duration_seconds: a.duration_seconds != null ? Math.round(a.duration_seconds) : null,
              avg_pace: a.avg_pace,
              avg_hr: a.avg_hr != null ? Math.round(a.avg_hr) : null,
              max_hr: a.max_hr != null ? Math.round(a.max_hr) : null,
              cadence: a.cadence != null ? Math.round(a.cadence) : null,
              elevation_gain: a.elevation_gain,
              polyline: null,
              hr_zones: {},
              garmin_id: a.garmin_id.trim(),
              source: "garmin",
            };
            const { error } = await supabase.from("activity").upsert(row, { onConflict: "user_id,garmin_id" });
            if (!error) activitiesCount++;
          }
        } else if (rows.length && isWellnessCsv(rows)) {
          for (const row of rows) {
            const parsed = parseWellnessRow(row, user.id);
            if (!parsed) continue;
            const { error } = await supabase.from("daily_readiness").upsert(
              {
                user_id: parsed.user_id,
                date: parsed.date,
                sleep_hours: parsed.sleep_hours,
                sleep_quality: parsed.sleep_quality,
                hrv: parsed.hrv,
                resting_hr: parsed.resting_hr,
              },
              { onConflict: "user_id,date" }
            );
            if (!error) readinessDates.add(parsed.date);
          }
        }
      }
    }

    await supabase.storage.from("garmin-imports").remove([storagePath]);

    return new Response(
      JSON.stringify({
        activitiesCount,
        readinessDaysCount: readinessDates.size,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("garmin-import-zip error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Import failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
