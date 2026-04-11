/**
 * vital-backfill — imports full workout history from Vital for a user.
 *
 * Unlike vital-sync (which also handles HRV, sleep, streams, resting HR, VO2max),
 * this function focuses exclusively on fetching ALL workout activities so it can
 * complete without timing out. It is intended to be called once from the Settings
 * page "Import all history" button.
 *
 * POST /vital-backfill
 * Headers: Authorization: Bearer <supabase_access_token>
 * Body (optional): { "start_date": "2022-01-01" }
 *
 * Response: { ok: true, activities_upserted: number, activities_skipped: number,
 *             workouts_received: number, detail?: string }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-request-id",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Vital base URL ────────────────────────────────────────────────────────────

function getVitalBaseUrl(): string {
  const region = Deno.env.get("VITAL_REGION") ?? "us";
  const env = Deno.env.get("VITAL_ENVIRONMENT") ?? "production";
  if (env === "sandbox") {
    console.warn(
      "[vital-backfill] VITAL_ENVIRONMENT=sandbox — activity data is limited to Vital test fixtures. " +
      "Set VITAL_ENVIRONMENT=production in Supabase secrets for real user data.",
    );
  }
  const host =
    env === "sandbox"
      ? `api.sandbox.${region}.junction.com`
      : `api.${region}.junction.com`;
  return `https://${host}`;
}

// ─── Date helpers ──────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function twoYearsAgo(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 2);
  return d.toISOString().split("T")[0];
}

// ─── Type helpers ──────────────────────────────────────────────────────────────

type Dict = Record<string, unknown>;

function asDict(value: unknown): Dict | null {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as Dict)
    : null;
}

function asDictArray(value: unknown): Dict[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item) => item !== null && typeof item === "object",
  ) as Dict[];
}

function toNum(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function firstString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return null;
}

function toDateFromUnknown(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms =
      value > 1_000_000_000_000
        ? value
        : value > 1_000_000_000
        ? value * 1000
        : NaN;
    if (!Number.isFinite(ms)) return null;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) {
      const n = Number(trimmed);
      return toDateFromUnknown(n);
    }
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  return null;
}

// ─── Field extraction (mirrors vital-sync) ────────────────────────────────────

function metricValue(value: unknown): number | null {
  if (value == null) return null;
  const direct = toNum(value);
  if (direct != null) return direct;
  const obj = asDict(value);
  if (!obj) return null;
  return toNum(
    obj.value ?? obj.amount ?? obj.val ?? obj.total ?? obj.avg ??
      obj.average ?? obj.mean ?? obj.seconds ?? obj.duration ??
      obj.distance ?? obj.meters ?? obj.kilometers ?? obj.km ??
      obj.miles ?? obj.bpm ?? obj.max,
  );
}

function metricUnit(value: unknown): string | null {
  const obj = asDict(value);
  if (!obj) return null;
  return (
    firstString(obj.unit, obj.units, obj.uom, obj.measurement_unit)
      ?.toLowerCase() ?? null
  );
}

type DateParseSource = "event" | "fallback";

function extractWorkoutDate(
  workout: Dict,
  data: Dict,
): { date: string | null; source: DateParseSource } {
  const eventCandidates: unknown[] = [
    workout.start_time, workout.start_date, workout.start_date_local,
    workout.calendar_date, workout.local_start_time, workout.timestamp,
    workout.time, workout.datetime, data.start_time, data.start_date,
    data.start_date_local, data.calendar_date, data.local_start_time,
    data.timestamp, data.time, data.datetime,
    asDict(workout.time_start)?.value, asDict(data.time_start)?.value,
    asDict(workout.start)?.time, asDict(data.start)?.time,
  ];
  for (const candidate of eventCandidates) {
    const date = toDateFromUnknown(candidate);
    if (date) return { date, source: "event" };
  }
  const fallbackCandidates: unknown[] = [
    workout.date, data.date, workout.created_at, data.created_at,
    workout.updated_at, data.updated_at,
  ];
  for (const candidate of fallbackCandidates) {
    const date = toDateFromUnknown(candidate);
    if (date) return { date, source: "fallback" };
  }
  return { date: null, source: "fallback" };
}

function extractDistanceKm(workout: Dict, data: Dict): number | null {
  const candidates: unknown[] = [
    data.distance_meters, workout.distance_meters, data.distance,
    workout.distance, data.length, workout.length,
    asDict(data.distance)?.value, asDict(workout.distance)?.value,
    asDict(data.metrics)?.distance, asDict(workout.metrics)?.distance,
  ];
  const units: unknown[] = [
    data.distance_unit, workout.distance_unit,
    metricUnit(data.distance), metricUnit(workout.distance),
    metricUnit(asDict(data.metrics)?.distance),
    metricUnit(asDict(workout.metrics)?.distance),
  ];
  for (const candidate of candidates) {
    const raw = metricValue(candidate);
    if (raw == null || raw <= 0) continue;
    const unit = firstString(...units)?.toLowerCase() ?? "";
    if (unit.includes("mile")) return Math.round(raw * 1.60934 * 100) / 100;
    if (unit.includes("meter") || unit === "m")
      return Math.round((raw / 1000) * 100) / 100;
    if (unit.includes("km")) return Math.round(raw * 100) / 100;
    if (raw > 200) return Math.round((raw / 1000) * 100) / 100;
    return Math.round(raw * 100) / 100;
  }
  return null;
}

function extractDurationSeconds(workout: Dict, data: Dict): number | null {
  const candidates: unknown[] = [
    data.duration_seconds, workout.duration_seconds, data.duration,
    workout.duration, data.moving_time, workout.moving_time, data.elapsed_time,
    workout.elapsed_time, data.active_duration, workout.active_duration,
    asDict(data.duration)?.value, asDict(workout.duration)?.value,
    asDict(data.metrics)?.duration, asDict(workout.metrics)?.duration,
  ];
  const units: unknown[] = [
    metricUnit(data.duration), metricUnit(workout.duration),
    metricUnit(asDict(data.metrics)?.duration),
    metricUnit(asDict(workout.metrics)?.duration),
  ];
  for (const candidate of candidates) {
    const raw = metricValue(candidate);
    if (raw == null || raw <= 0) continue;
    const unit = firstString(...units)?.toLowerCase() ?? "";
    if (unit.includes("hour") || unit === "h") return Math.round(raw * 3600);
    if (unit.includes("min")) return Math.round(raw * 60);
    if (unit.includes("ms")) return Math.round(raw / 1000);
    if (raw > 86_400 * 3) return Math.round(raw / 1000);
    return Math.round(raw);
  }
  return null;
}

function paceFromAvgSpeed(avgSpeed: number | null): string | null {
  if (avgSpeed == null || avgSpeed <= 0) return null;
  const normalizedMps = avgSpeed > 15 ? avgSpeed / 3.6 : avgSpeed;
  if (normalizedMps <= 0) return null;
  const paceMin = 1000 / normalizedMps / 60;
  if (paceMin < 2 || paceMin > 25) return null;
  const minutes = Math.floor(paceMin);
  const seconds = Math.round((paceMin - minutes) * 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}/km`;
}

function extractHeartRate(
  workout: Dict,
  data: Dict,
): { avgHr: number | null; maxHr: number | null } {
  const hrObj =
    asDict(data.heart_rate) ?? asDict(data.heartrate) ?? asDict(data.hr) ??
    asDict(workout.heart_rate) ?? asDict(workout.heartrate) ??
    asDict(workout.hr) ?? null;
  const avgHr = metricValue(
    hrObj?.avg ?? hrObj?.average ?? hrObj?.avg_bpm ?? hrObj?.mean ??
      data.average_heartrate ?? data.avg_hr ??
      workout.average_heartrate ?? workout.avg_hr,
  );
  const maxHr = metricValue(
    hrObj?.max ?? hrObj?.max_bpm ??
      data.max_heartrate ?? data.max_hr ??
      workout.max_heartrate ?? workout.max_hr,
  );
  return {
    avgHr: avgHr != null ? Math.round(avgHr) : null,
    maxHr: maxHr != null ? Math.round(maxHr) : null,
  };
}

function inferActivityType(workout: Dict, data: Dict): string {
  const sportObj =
    asDict(workout.sport) ?? asDict(data.sport) ?? null;
  const sportSlug = String(
    sportObj?.slug ?? sportObj?.name ?? sportObj?.type ??
      data.type ?? data.activity_type ??
      workout.type ?? workout.activity_type ?? "run",
  ).toLowerCase();
  if (sportSlug.includes("run")) return "Run";
  if (sportSlug.includes("ride") || sportSlug.includes("cycl")) return "Ride";
  if (sportSlug.includes("walk") || sportSlug.includes("hike")) return "Walk";
  if (sportSlug.includes("swim")) return "Swim";
  if (sportSlug.includes("strength") || sportSlug.includes("gym"))
    return "Strength";
  return "Run";
}

// ─── Pagination helpers ────────────────────────────────────────────────────────

function extractArrayPayload(payload: unknown): Dict[] {
  if (Array.isArray(payload)) return asDictArray(payload);
  const obj = asDict(payload);
  if (!obj) return [];
  const directKeys = ["workouts", "activities", "data", "results", "items"];
  for (const key of directKeys) {
    const arr = asDictArray(obj[key]);
    if (arr.length > 0) return arr;
  }
  const nestedData = asDict(obj.data);
  if (nestedData) {
    for (const key of directKeys) {
      const arr = asDictArray(nestedData[key]);
      if (arr.length > 0) return arr;
    }
  }
  return [];
}

function extractNextCursor(payload: unknown): string | null {
  const obj = asDict(payload);
  if (!obj) return null;
  const direct = firstString(
    obj.next_cursor,
    obj.nextCursor,
    obj.cursor,
    obj.next,
  );
  if (direct) return direct;
  const pagination = asDict(obj.pagination);
  return firstString(
    pagination?.next_cursor,
    pagination?.nextCursor,
    pagination?.cursor,
    pagination?.next,
  );
}

// ─── Fetch helpers ─────────────────────────────────────────────────────────────

interface DateWindow {
  start: string;
  end: string;
}

async function fetchPagedWorkouts(
  endpoint: string,
  headers: Record<string, string>,
  maxPages = 50,
): Promise<{ workouts: Dict[]; pages: number; ok: boolean; status: number; detail?: string }> {
  const workouts: Dict[] = [];
  let pages = 0;
  let cursor: string | null = null;

  while (pages < maxPages) {
    pages += 1;
    const url = new URL(endpoint);
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url.toString(), { headers });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { workouts, pages, ok: false, status: res.status, detail: detail.slice(0, 400) };
    }

    const payload = (await res.json().catch(() => ({}))) as unknown;
    workouts.push(...extractArrayPayload(payload));

    const next = extractNextCursor(payload);
    if (!next || next === cursor) {
      return { workouts, pages, ok: true, status: res.status };
    }
    cursor = next;
  }

  return {
    workouts,
    pages,
    ok: true,
    status: 200,
    detail: `Stopped at ${maxPages} pages`,
  };
}

function buildDateWindows(
  startIso: string,
  endIso: string,
  chunkDays: number,
): DateWindow[] {
  const windows: DateWindow[] = [];
  const start = new Date(`${startIso}T00:00:00.000Z`);
  const end = new Date(`${endIso}T00:00:00.000Z`);
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    start > end
  ) {
    return windows;
  }
  let cursor = new Date(start);
  while (cursor <= end) {
    const next = new Date(cursor);
    next.setUTCDate(next.getUTCDate() + chunkDays - 1);
    const windowEnd = next < end ? next : end;
    windows.push({
      start: cursor.toISOString().slice(0, 10),
      end: windowEnd.toISOString().slice(0, 10),
    });
    cursor = new Date(windowEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return windows;
}

// ─── Stable key / dedup helpers ───────────────────────────────────────────────

function stableWorkoutKey(workout: Dict): string | null {
  const payload = asDict(workout.data) ?? workout;
  return firstString(
    workout.id, workout.workout_id, workout.activity_id, workout.source_id,
    payload.id, payload.workout_id, payload.activity_id, payload.source_id,
    firstString(
      workout.start_time, workout.timestamp,
      payload.start_time, payload.timestamp,
    ),
  );
}

function workoutScore(workout: Dict): number {
  const payload = asDict(workout.data) ?? workout;
  const parsedDate = extractWorkoutDate(workout, payload);
  const distanceKm = extractDistanceKm(workout, payload);
  const durationSecs = extractDurationSeconds(workout, payload);
  const { avgHr, maxHr } = extractHeartRate(workout, payload);
  let score = 0;
  if (parsedDate.date) score += parsedDate.source === "event" ? 5 : 2;
  if (distanceKm != null) score += 2;
  if (durationSecs != null) score += 2;
  if (avgHr != null || maxHr != null) score += 1;
  return score;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId =
    req.headers.get("x-request-id") ?? crypto.randomUUID();

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header", request_id: requestId }, 401);
    }

    const apiKey = Deno.env.get("VITAL_API_KEY");
    if (!apiKey) {
      return json({ error: "Vital API key not configured", request_id: requestId }, 500);
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser(
      authHeader.replace("Bearer ", "").trim(),
    );
    if (userError || !user) {
      return json({ error: "Unauthorized", request_id: requestId }, 401);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Resolve Vital user ID
    const { data: integration } = await supabaseAdmin
      .from("integrations")
      .select("athlete_id")
      .eq("user_id", user.id)
      .eq("provider", "vital")
      .maybeSingle();

    if (!integration?.athlete_id) {
      return json({ error: "Vital not connected", request_id: requestId }, 404);
    }

    const vitalUserId = String(integration.athlete_id);
    const baseUrl = getVitalBaseUrl();
    const headers = { "x-vital-api-key": apiKey, Accept: "application/json" };

    // Parse optional start_date from body.
    // start_date = beginning of the date range to process this call.
    // Callers should pass next_start_date from a previous response to continue chunked imports.
    let startDate = twoYearsAgo();
    try {
      const body = (await req.json()) as { start_date?: string };
      if (body?.start_date && /^\d{4}-\d{2}-\d{2}$/.test(body.start_date)) {
        startDate = body.start_date;
      }
    } catch {
      // No body or invalid JSON — use default
    }
    const endDate = todayStr();

    console.log("[vital-backfill] starting backfill", {
      user_id: user.id,
      vital_user_id: vitalUserId,
      start_date: startDate,
      end_date: endDate,
      request_id: requestId,
    });

    // ── Step 1: Probe to find a working endpoint ──────────────────────────────
    // Use a short 90-day probe window to quickly identify which endpoint responds
    const probeStart = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 90);
      return d.toISOString().split("T")[0];
    })();

    const endpointBases = [
      `${baseUrl}/v2/summary/workouts/${vitalUserId}/raw`,
      `${baseUrl}/v2/summary/workouts/${vitalUserId}`,
      `${baseUrl}/v2/activity/user_id/${vitalUserId}`,
      `${baseUrl}/v2/activity/${vitalUserId}`,
      `${baseUrl}/v2/activity/${vitalUserId}/raw`,
    ];

    const successfulBases: { base: string; count: number }[] = [];

    for (const base of endpointBases) {
      const probeEndpoint = `${base}?start_date=${probeStart}&end_date=${endDate}`;
      const result = await fetchPagedWorkouts(probeEndpoint, headers, 3);
      if (result.ok) {
        successfulBases.push({ base, count: result.workouts.length });
        console.log("[vital-backfill] probe ok", { base, count: result.workouts.length });
      } else {
        const unsupported = [400, 404, 405, 410, 422].includes(result.status);
        console.log("[vital-backfill] probe failed", { base, status: result.status, unsupported });
      }
    }

    if (successfulBases.length === 0) {
      return json({
        ok: false,
        error: "No Vital workout endpoint responded successfully",
        detail: "Make sure your device is synced in Vital and try again.",
        request_id: requestId,
        activities_upserted: 0,
        activities_skipped: 0,
        workouts_received: 0,
      }, 502);
    }

    // Use the top 2 bases by probe count to cover different data shapes
    const topBases = successfulBases
      .sort((a, b) => b.count - a.count)
      .slice(0, 2)
      .map((x) => x.base);

    // ── Step 2: Chunked fetch — process MAX_WINDOWS_PER_CALL windows this call ─
    // Large histories are split across multiple calls via next_start_date chaining.
    const MAX_WINDOWS_PER_CALL = 5; // 5 × 120 days = 600 days per call
    const allWindows = buildDateWindows(startDate, endDate, 120);
    const windows = allWindows.slice(0, MAX_WINDOWS_PER_CALL);
    const nextWindow = allWindows[MAX_WINDOWS_PER_CALL];
    const next_start_date: string | null = nextWindow?.start ?? null;
    const workoutsByKey = new Map<string, Dict>();

    for (const base of topBases) {
      for (const window of windows) {
        const endpoint = `${base}?start_date=${window.start}&end_date=${window.end}`;
        const result = await fetchPagedWorkouts(endpoint, headers, 50);

        if (!result.ok) {
          console.warn("[vital-backfill] window fetch failed", {
            base,
            window,
            status: result.status,
          });
          continue;
        }

        for (const workout of result.workouts) {
          const key = stableWorkoutKey(workout);
          if (!key) continue;
          const existing = workoutsByKey.get(key);
          if (!existing || workoutScore(workout) > workoutScore(existing)) {
            workoutsByKey.set(key, workout);
          }
        }
      }
    }

    const allWorkouts = [...workoutsByKey.values()];
    console.log("[vital-backfill] fetched deduped workouts", {
      total: allWorkouts.length,
      bases: topBases,
    });

    // ── Step 3: Upsert into activity table ────────────────────────────────────
    let activitiesUpserted = 0;
    let activitiesSkipped = 0;

    for (const w of allWorkouts) {
      const data = asDict(w.data) ?? w;

      const id = firstString(
        w.id, w.workout_id, w.activity_id, w.source_id,
        data.id, data.workout_id, data.activity_id, data.source_id,
      );
      if (!id) {
        activitiesSkipped += 1;
        continue;
      }

      const parsedDate = extractWorkoutDate(w, data);
      if (!parsedDate.date) {
        activitiesSkipped += 1;
        continue;
      }

      const distanceKm = extractDistanceKm(w, data);
      const durationSeconds = extractDurationSeconds(w, data);
      const avgSpeed = metricValue(
        data.average_speed ?? data.speed ??
          w.average_speed ?? w.speed ??
          asDict(data.pace)?.speed,
      );
      const avgPace =
        firstString(data.avg_pace, data.pace, w.avg_pace, w.pace) ??
        paceFromAvgSpeed(avgSpeed);
      const { avgHr, maxHr } = extractHeartRate(w, data);
      const cadence = metricValue(
        data.cadence ?? data.average_cadence ?? w.cadence ?? w.average_cadence,
      );
      const elevationGain = metricValue(
        data.elevation_gain ?? data.total_elevation_gain ??
          w.elevation_gain ?? w.total_elevation_gain,
      );
      const activityType = inferActivityType(w, data);

      const { error } = await supabaseAdmin.from("activity").upsert(
        {
          user_id: user.id,
          date: parsedDate.date,
          type: activityType,
          name: firstString(data.name, data.title, w.name, w.title),
          distance_km: distanceKm,
          duration_seconds:
            durationSeconds != null && durationSeconds > 0
              ? Math.round(durationSeconds)
              : null,
          avg_pace: avgPace,
          avg_hr: avgHr,
          max_hr: maxHr,
          cadence: cadence != null ? Math.round(cadence) : null,
          elevation_gain: elevationGain,
          source: "vital",
          vital_id: id,
          external_id: id,
        },
        { onConflict: "user_id,vital_id" },
      );

      if (error) {
        console.warn("[vital-backfill] upsert failed", {
          id,
          date: parsedDate.date,
          error: error.message,
        });
        activitiesSkipped += 1;
      } else {
        activitiesUpserted += 1;
      }
    }

    console.log("[vital-backfill] done", {
      activities_upserted: activitiesUpserted,
      activities_skipped: activitiesSkipped,
      workouts_received: allWorkouts.length,
    });

    return json({
      ok: true,
      activities_upserted: activitiesUpserted,
      activities_skipped: activitiesSkipped,
      workouts_received: allWorkouts.length,
      start_date: startDate,
      end_date: windows.at(-1)?.end ?? endDate,
      // next_start_date is set when there are more windows to process.
      // Callers should make another request with { start_date: next_start_date } until this is null.
      next_start_date,
      request_id: requestId,
    });
  } catch (err) {
    console.error("[vital-backfill] unexpected error", err);
    return json(
      {
        error: "Unexpected error during backfill",
        detail: err instanceof Error ? err.message : String(err),
        request_id: requestId,
      },
      500,
    );
  }
});
