import Papa from "papaparse";
import JSZip from "jszip";
import { unzipSync } from "fflate";
import { Decoder, Stream } from "@garmin/fitsdk";
import { supabase } from "@/integrations/supabase/client";

export interface ImportResult {
  activitiesCount: number;
  readinessDaysCount: number;
  /** Total files processed (for error messages) */
  filesProcessed?: number;
  /** JSON files processed (for error messages) */
  jsonProcessed?: number;
  /** When 0 imported: sample paths found in ZIP (for diagnosis) */
  samplePaths?: string[];
}

const FITNESS_PATH = "DI_CONNECT/DI-Connect-Fitness/";
const WELLNESS_PATH = "DI_CONNECT/DI-Connect-Wellness/";

function isFitnessPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  const isFitnessDir =
    normalized.includes("di-connect-fitness") ||
    normalized.includes("di-connect-uploaded-files") ||
    normalized.includes("di_connect_fitness") ||
    /di-?connect.*fitness|uploaded.*files/.test(normalized);
  return isFitnessDir && /\.fit$/i.test(path);
}

/** Full Garmin export puts activities in nested ZIPs (Fitness, Uploaded-Files, etc.) */
function isFitnessZipPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  const isFitnessDir =
    normalized.includes("di-connect-fitness") ||
    normalized.includes("di-connect-uploaded-files") ||
    normalized.includes("di_connect_fitness") ||
    (normalized.includes("fitness") && !normalized.includes("wellness")) ||
    /di-?connect.*fitness|uploaded.*files/.test(normalized);
  return isFitnessDir && /\.zip$/i.test(path);
}

/** DI-Connect-Metrics also has Part1.zip with JSON */
function isMetricsZipPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  return normalized.includes("di-connect-metrics") && /\.zip$/i.test(path);
}

/** Any DI-Connect ZIP (Fitness, Metrics, Wellness, etc.) */
function isGarminZipPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  return (normalized.includes("di-connect") || normalized.includes("di_connect")) && /\.zip$/i.test(path);
}

function isWellnessPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  return (
    (normalized.includes("di-connect-wellness") ||
      normalized.includes("di_connect_wellness") ||
      normalized.includes("wellness") ||
      normalized.includes("dailysummary") ||
      normalized.includes("daily_summary")) &&
    /\.csv$/i.test(path)
  );
}

function isFitnessCsvPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  return (normalized.includes("di-connect-fitness") || (normalized.includes("fitness") && normalized.includes("activity") && !normalized.includes("wellness"))) && /\.csv$/i.test(path);
}

function isGarminJsonPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  const isGarmin =
    normalized.includes("di-connect") ||
    normalized.includes("di_connect") ||
    normalized.includes("garmin") ||
    normalized.includes("summarizedactivities") ||
    /activity|summary|fitness|metric|training|exercise|workout/.test(normalized);
  return isGarmin && /\.json$/i.test(path);
}

/** Only parse as activity from JSON paths we KNOW contain activity lists (avoids 400 from wellness/hydration/etc) */
function isActivityJsonPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  return (
    normalized.includes("garminactivitysummary") ||
    normalized.includes("activitysummary") ||
    normalized.includes("summarizedfitness") ||
    normalized.includes("summarized_fitness") ||
    normalized.includes("summarizedactivities") ||
    normalized.includes("summarizedactivitiesexport") ||
    normalized.includes("di-connect-metrics") ||
    normalized.includes("di_connect_metrics") ||
    (normalized.includes("fitness") && /\.json$/i.test(normalized)) ||
    /activities\.json$/i.test(normalized) ||
    /summarized.*\.json$/i.test(normalized) ||
    /di-connect-fitness.*\.json$/i.test(normalized)
  );
}

/** Validate date is within reasonable range (2010–today) to avoid bogus wellness counts */
function isValidWellnessDate(dateStr: string): boolean {
  const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const y = parseInt(m[1]!, 10);
  const now = new Date();
  return y >= 2010 && y <= now.getFullYear() + 1;
}

/** Normalize date to YYYY-MM-DD */
function normalizeDate(dateStr: string): string | null {
  if (!dateStr) return null;
  const m = String(dateStr).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const ts = Number(dateStr);
  if (!isNaN(ts)) return new Date(ts > 1e10 ? ts : ts * 1000).toISOString().slice(0, 10);
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Sanitize activity row for DB upsert - coerce types, ensure valid garmin_id (avoids 400) */
function sanitizeActivityForDb(
  a: { user_id: string; date: string; type: string; distance_km: number | null; duration_seconds: number | null; avg_pace: string | null; avg_hr: number | null; max_hr: number | null; cadence: number | null; elevation_gain: number | null; polyline: string | null; hr_zones: Record<string, number> | null; garmin_id: string; source: string }
): Record<string, unknown> | null {
  const garminId = (a.garmin_id || "").trim();
  if (!garminId) return null;
  const date = normalizeDate(a.date);
  if (!date) return null;
  return {
    user_id: a.user_id,
    date,
    type: a.type || "run",
    distance_km: a.distance_km,
    duration_seconds: a.duration_seconds != null ? Math.round(a.duration_seconds) : null,
    avg_pace: a.avg_pace,
    avg_hr: a.avg_hr != null ? Math.round(a.avg_hr) : null,
    max_hr: a.max_hr != null ? Math.round(a.max_hr) : null,
    cadence: a.cadence != null ? Math.round(a.cadence) : null,
    elevation_gain: a.elevation_gain,
    polyline: a.polyline,
    hr_zones: a.hr_zones ?? {},
    garmin_id: garminId,
    source: a.source,
  };
}

async function saveFitExtras(
  activity: FitActivity & { _streams?: FitStreams; _laps?: FitLap[] },
  userId: string,
): Promise<void> {
  const garminId = activity.garmin_id;
  if (activity._laps?.length) {
    await supabase.from("activity").update({ lap_splits: activity._laps }).eq("user_id", userId).eq("garmin_id", garminId);
  }
  if (activity._streams && activity._streams.time.length > 0) {
    const s = activity._streams;
    await supabase.from("activity_streams").upsert(
      {
        user_id: userId,
        activity_id: `garmin_${garminId}`,
        heartrate: s.heartrate.some((v) => v > 0) ? s.heartrate : null,
        cadence: s.cadence.some((v) => v > 0) ? s.cadence : null,
        altitude: s.altitude.some((v) => v > 0) ? s.altitude : null,
        distance: s.distance.some((v) => v > 0) ? s.distance : null,
        pace: s.pace.some((v) => v > 0) ? s.pace : null,
        time: s.time,
      },
      { onConflict: "user_id,activity_id" },
    );
  }
}

/** Time-of-day label from timestamp (Morning, Afternoon, Evening, Night) */
function timeOfDayLabel(ts: unknown): string {
  if (ts == null) return "Run";
  const ms = typeof ts === "number" ? (ts > 1e12 ? ts : ts * 1000) : new Date(String(ts)).getTime();
  if (isNaN(ms)) return "Run";
  const h = new Date(ms).getHours();
  if (h >= 5 && h < 12) return "Morning";
  if (h >= 12 && h < 17) return "Afternoon";
  if (h >= 17 && h < 21) return "Evening";
  return "Night";
}

/** Run type from HR, pace, distance, interval detection */
function runTypeLabel(
  avgHr: number | null,
  maxHr: number | null,
  paceMinPerKm: number | null,
  distanceKm: number | null,
  hrZones: Record<string, number> | null
): string {
  const dist = distanceKm ?? 0;
  const pace = paceMinPerKm ?? 6;
  if (dist > 18) return "Long Run";
  if (dist < 5 && dist > 0) return "Recovery Run";
  const mhr = maxHr ?? 0;
  if (mhr > 0 && avgHr != null && avgHr > 0) {
    const pct = (avgHr / mhr) * 100;
    if (pct >= 75 && pct <= 85) return "Tempo Run";
    if (pct < 75 && pace > 5.5) return "Easy Run";
  }
  if (pace > 5.5) return "Easy Run";
  const z5 = hrZones?.z5 ?? 0;
  if (z5 > 15) return "Interval Session";
  return "Run";
}

/** Strava-style smart activity name: "Morning Easy Run", "Evening Tempo Run" */
function generateSmartActivityName(opts: {
  startTime: unknown;
  avgHr: number | null;
  maxHr: number | null;
  paceMinPerKm: number | null;
  distanceKm: number | null;
  hrZones: Record<string, number> | null;
  userMaxHr: number | null;
}): string {
  const timeLabel = timeOfDayLabel(opts.startTime);
  const maxHr = opts.maxHr ?? opts.userMaxHr;
  const typeLabel = runTypeLabel(
    opts.avgHr,
    maxHr,
    opts.paceMinPerKm,
    opts.distanceKm,
    opts.hrZones
  );
  return `${timeLabel} ${typeLabel}`;
}

/** Format pace from distance (km) and duration (seconds). Returns "" if implausible. */
function formatPace(distanceKm: number, durationSec: number): string {
  if (!distanceKm || distanceKm < 0.001 || !durationSec) return "";
  const paceMinPerKm = (durationSec / 60) / distanceKm;
  if (paceMinPerKm < 2 || paceMinPerKm > 25) return "";
  let min = Math.floor(paceMinPerKm);
  let sec = Math.round((paceMinPerKm - min) * 60);
  if (sec >= 60) {
    min += 1;
    sec = 0;
  }
  return `${min}:${String(sec).padStart(2, "0")} /km`;
}

/** Build polyline from FIT records (lat/long) - simplified */
function recordsToPolyline(records: Array<{ position_lat?: number; position_long?: number }>): string | null {
  const points = records
    .filter((r) => r.position_lat != null && r.position_long != null)
    .map((r) => `${(r.position_lat! / 11930465).toFixed(5)},${(r.position_long! / 11930465).toFixed(5)}`);
  return points.length > 1 ? points.join("|") : null;
}

/** Convert time_in_hr_zone to percentage object */
function hrZonesFromTimeInZone(times: number[] | undefined): Record<string, number> | null {
  if (!times || times.length === 0) return null;
  const total = times.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const pct = times.map((t) => Math.round((t / total) * 100));
  return { z1: pct[0] ?? 0, z2: pct[1] ?? 0, z3: pct[2] ?? 0, z4: pct[3] ?? 0, z5: pct[4] ?? 0 };
}

type FitActivity = {
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
  polyline: string | null;
  hr_zones: Record<string, number> | null;
  garmin_id: string;
  source: "garmin";
};

/** Extract sessions from parsed FIT data (list or cascade mode) */
function extractFitSessions(raw: Record<string, unknown>): Record<string, unknown>[] {
  const activity = raw.activity as { sessions?: unknown[] } | undefined;
  let sessions = (raw.sessions ?? raw.Session ?? activity?.sessions ?? []) as unknown[];
  if (!Array.isArray(sessions) || sessions.length === 0) {
    const session = raw.session ?? raw.Session;
    if (session && typeof session === "object" && !Array.isArray(session)) sessions = [session];
  }
  if (!Array.isArray(sessions) || sessions.length === 0) {
    const laps = (raw.laps ?? raw.Lap ?? raw.lap ?? []) as unknown[];
    if (Array.isArray(laps)) {
      const withDist = laps.filter(
        (l: unknown) =>
          l &&
          typeof l === "object" &&
          ((l as Record<string, unknown>).total_distance ?? (l as Record<string, unknown>).totalDistance ?? (l as Record<string, unknown>).total_timer_time ?? (l as Record<string, unknown>).total_timer_time) != null
      );
      if (withDist.length > 0) sessions = withDist;
    }
  }
  if (!Array.isArray(sessions) || sessions.length === 0) {
    for (const [k, v] of Object.entries(raw)) {
      if (Array.isArray(v) && v.length > 0 && /session|lap/i.test(k)) {
        const first = v[0];
        if (first && typeof first === "object" && ((first as Record<string, unknown>).total_distance ?? (first as Record<string, unknown>).total_timer_time ?? (first as Record<string, unknown>).sport) != null) {
          return v as Record<string, unknown>[];
        }
      }
    }
    for (const v of Object.values(raw)) {
      if (Array.isArray(v) && v.length > 0) {
        const first = v[0];
        if (first && typeof first === "object" && ((first as Record<string, unknown>).total_distance ?? (first as Record<string, unknown>).total_timer_time ?? (first as Record<string, unknown>).sport ?? (first as Record<string, unknown>).start_time) != null) {
          return v as Record<string, unknown>[];
        }
      }
    }
  }
  return Array.isArray(sessions) ? sessions.filter((s): s is Record<string, unknown> => s != null && typeof s === "object") : [];
}

/** Garmin FIT epoch: seconds between 1970-01-01 UTC and 1989-01-01 UTC */
const GARMIN_EPOCH = 631065600;

/** Extract YYYY-MM-DD from FIT timestamp. FIT stores seconds since Jan 1, 1989 (Garmin epoch). */
function extractDateFromFitTimestamp(val: unknown): string | null {
  if (val == null) return null;
  if (typeof val === "string") {
    const m = val.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  if (typeof val === "number" && val > 0) {
    const unixMs = (val + GARMIN_EPOCH) * 1000;
    const d = new Date(unixMs);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  return null;
}

/** Extract YYYY-MM-DD from session/record timestamp - handles ISO string, Unix epoch seconds/ms. For FIT use extractDateFromFitTimestamp. */
function extractDateFromTimestamp(val: unknown): string | null {
  if (val == null) return null;
  if (typeof val === "string") {
    const m = val.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  if (typeof val === "number" && val > 0) {
    const ms = val > 1e12 ? val : val * 1000;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  return null;
}

/** Build synthetic session from FIT records when no session/lap data exists */
function sessionFromRecords(records: Array<Record<string, unknown>>, _raw: Record<string, unknown>): Record<string, unknown> | null {
  if (!records.length) return null;
  const first = records[0];
  const last = records[records.length - 1];
  const lastDist = Number(last.distance ?? last.total_distance ?? 0);
  const totalDistM = lastDist > 100 ? lastDist : 0;
  const ts1 = first.timestamp ?? first.start_time;
  const ts2 = last.timestamp ?? last.elapsed_time;
  let totalTime = 0;
  if (typeof ts1 === "string" && typeof ts2 === "string") {
    totalTime = (new Date(ts2).getTime() - new Date(ts1).getTime()) / 1000;
  } else if (typeof ts1 === "number" || typeof ts2 === "number") {
    const t1 = Number(ts1);
    const t2 = Number(ts2);
    totalTime = t2 > t1 ? (t2 - t1) : (t2 > 1e10 ? t2 / 1000 : t2);
  }
  if (totalDistM < 10 && totalTime < 30) return null;
  const startTime = ts1 ?? new Date().toISOString();
  const distKm = totalDistM >= 100 ? totalDistM / 1000 : totalDistM;
  return {
    total_distance: distKm,
    total_timer_time: totalTime,
    total_elapsed_time: totalTime,
    start_time: startTime,
    sport: "generic",
    timestamp: startTime,
  };
}

/** Streams data extracted from FIT recordMesgs for saving to activity_streams */
export interface FitStreams {
  heartrate: number[];
  cadence: number[];
  altitude: number[];
  distance: number[];
  time: number[];
  pace: number[];
}

/** Lap data extracted from FIT lapMesgs */
export interface FitLap {
  km?: number;
  pace?: string;
  elapsed_sec?: number;
  hr?: number;
  elevation?: number;
}

function extractStreamsFromRecords(records: Array<Record<string, unknown>>, startTime?: Date): FitStreams {
  const hr: number[] = [];
  const cad: number[] = [];
  const alt: number[] = [];
  const dist: number[] = [];
  const time: number[] = [];
  const pace: number[] = [];
  const t0 = startTime?.getTime() ?? 0;

  for (const r of records) {
    const ts = r.timestamp instanceof Date ? r.timestamp : null;
    const elapsed = ts && t0 ? Math.round((ts.getTime() - t0) / 1000) : time.length;
    time.push(elapsed);
    hr.push(Number(r.heartRate ?? r.heart_rate ?? 0) || 0);
    cad.push(Number(r.cadence ?? 0) || 0);
    alt.push(Number(r.altitude ?? r.enhancedAltitude ?? 0) || 0);
    const d = Number(r.distance ?? 0) || 0;
    dist.push(d);
    const spd = Number(r.enhancedSpeed ?? r.speed ?? 0);
    pace.push(spd > 0.05 ? 1000 / (spd * 60) : 0);
  }
  return { heartrate: hr, cadence: cad, altitude: alt, distance: dist, time, pace };
}

function extractLapsFromMessages(laps: Array<Record<string, unknown>>): FitLap[] {
  return laps.map((l) => {
    const distM = Number(l.totalDistance ?? l.total_distance ?? 0);
    const elapsed = Number(l.totalElapsedTime ?? l.totalTimerTime ?? l.total_elapsed_time ?? 0);
    const avgHr = Number(l.avgHeartRate ?? l.avg_heart_rate ?? 0) || undefined;
    const ascent = Number(l.totalAscent ?? l.total_ascent ?? 0) || undefined;
    const km = distM > 0 ? Math.round((distM / 1000) * 100) / 100 : undefined;
    let paceStr: string | undefined;
    if (distM > 0 && elapsed > 0) {
      const paceSecPerKm = elapsed / (distM / 1000);
      const m = Math.floor(paceSecPerKm / 60);
      const s = Math.round(paceSecPerKm % 60);
      paceStr = `${m}:${String(s).padStart(2, "0")}/km`;
    }
    return { km, pace: paceStr, elapsed_sec: elapsed > 0 ? Math.round(elapsed) : undefined, hr: avgHr, elevation: ascent };
  });
}

/** Parse a single FIT file using official @garmin/fitsdk */
async function parseFitActivities(
  buffer: ArrayBuffer,
  userId: string,
  baseGarminId: string,
  userMaxHr: number | null = null
): Promise<FitActivity[]> {
  const results: FitActivity[] = [];
  try {
    const uint8 = new Uint8Array(buffer);
    const stream = Stream.fromByteArray(Array.from(uint8));
    const decoder = new Decoder(stream);

    if (!decoder.isFIT()) {
      if (DEBUG) console.log("[Garmin Import] Not a valid FIT file:", baseGarminId);
      return [];
    }

    const { messages, errors } = decoder.read({
      convertDateTimesToDates: true,
      mergeHeartRates: true,
    });

    if (errors.length > 0 && DEBUG) {
      console.warn("[Garmin Import] FIT decode errors:", errors);
    }

    const sessions = (messages as Record<string, unknown[]>).sessionMesgs as Array<Record<string, unknown>> | undefined;
    const records = (messages as Record<string, unknown[]>).recordMesgs as Array<Record<string, unknown>> | undefined;
    const laps = (messages as Record<string, unknown[]>).lapMesgs as Array<Record<string, unknown>> | undefined;

    if (!sessions || sessions.length === 0) {
      if (DEBUG) console.log("[Garmin Import] FIT no sessions:", baseGarminId, Object.keys(messages));
      return [];
    }

    for (let i = 0; i < sessions.length; i++) {
      const s = sessions[i];
      const sport = String(s.sport ?? "").toLowerCase();
      const subSport = String(s.subSport ?? s.sub_sport ?? "").toLowerCase();

      const startTime = s.startTime instanceof Date ? s.startTime : null;
      const date = startTime ? startTime.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);

      const totalDistM = Number(s.totalDistance ?? s.total_distance ?? 0);
      const distKm = totalDistM > 0 ? Math.round((totalDistM / 1000) * 100) / 100 : null;
      const durationSec = Number(s.totalElapsedTime ?? s.totalTimerTime ?? s.total_elapsed_time ?? 0);
      if (durationSec < 30 && (distKm ?? 0) < 0.01) continue;

      const avgHr = Number(s.avgHeartRate ?? s.avg_heart_rate ?? 0) || null;
      const maxHrVal = Number(s.maxHeartRate ?? s.max_heart_rate ?? 0) || null;
      const avgCadence = Number(s.avgCadence ?? s.avg_cadence ?? 0) || null;
      const elevGain = Number(s.totalAscent ?? s.total_ascent ?? 0) || null;

      const hrZones = hrZonesFromTimeInZone(s.timeInHrZone as number[] | undefined);

      let polyline: string | null = null;
      if (records?.length) {
        const points = records
          .filter((r) => r.positionLat != null && r.positionLong != null)
          .map((r) => {
            const lat = Number(r.positionLat) * (180 / 2147483648);
            const lng = Number(r.positionLong) * (180 / 2147483648);
            return `${lat.toFixed(5)},${lng.toFixed(5)}`;
          });
        polyline = points.length > 1 ? points.join("|") : null;
      }

      const isRunSport = /run|walk|treadmill|trail|track|indoor_running/i.test(sport + subSport);
      const isCycling = /cycling|bike|biking/i.test(sport + subSport);
      const isSwim = /swim|pool|open_water/i.test(sport + subSport);

      let typeLabel: string;
      if (isRunSport) {
        const paceMinPerKm = distKm != null && durationSec > 0 && distKm > 0 ? (durationSec / 60) / distKm : null;
        typeLabel = generateSmartActivityName({
          startTime: startTime ?? undefined,
          avgHr,
          maxHr: maxHrVal,
          paceMinPerKm: paceMinPerKm != null && paceMinPerKm >= 2 && paceMinPerKm <= 25 ? paceMinPerKm : null,
          distanceKm: distKm,
          hrZones,
          userMaxHr,
        });
      } else if (isCycling) typeLabel = "cycling";
      else if (isSwim) typeLabel = "swim";
      else if (sport || subSport) typeLabel = (sport || subSport).replace(/_/g, " ");
      else typeLabel = "activity";

      const garminId = sessions.length > 1 ? `${baseGarminId}_s${i}` : baseGarminId;
      const dKm = distKm ?? 0.01;

      const activity: FitActivity = {
        user_id: userId,
        date,
        type: typeLabel,
        distance_km: distKm,
        duration_seconds: durationSec > 0 ? durationSec : null,
        avg_pace: dKm > 0 && durationSec ? formatPace(dKm, durationSec) : null,
        avg_hr: avgHr,
        max_hr: maxHrVal,
        cadence: avgCadence,
        elevation_gain: elevGain,
        polyline,
        hr_zones: hrZones,
        garmin_id: garminId,
        source: "garmin",
      };

      (activity as FitActivity & { _streams?: FitStreams; _laps?: FitLap[] })._streams =
        records?.length ? extractStreamsFromRecords(records, startTime ?? undefined) : undefined;
      (activity as FitActivity & { _laps?: FitLap[] })._laps =
        laps?.length ? extractLapsFromMessages(laps) : undefined;

      results.push(activity);
    }
  } catch (e) {
    if (DEBUG) console.warn("[Garmin Import] FIT parse error:", baseGarminId, e);
  }
  return results;
}

/** Flatten nested arrays/objects into array of activity-like objects */
function extractActivityObjects(data: unknown): Record<string, unknown>[] {
  if (!data || typeof data !== "object") return [];
  if (Array.isArray(data)) {
    const arr = data.filter((x): x is Record<string, unknown> => x != null && typeof x === "object");
    if (arr.length === 1 && Array.isArray(arr[0]?.summarizedActivitiesExport)) return arr[0].summarizedActivitiesExport as Record<string, unknown>[];
    return arr;
  }
  const obj = data as Record<string, unknown>;
  for (const key of [
    "activities",
    "fitnessActivities",
    "exerciseList",
    "activityList",
    "summarizedActivities",
    "summarizedActivitiesExport",
    "summarizedFitness",
    "exercises",
    "workouts",
    "trainingSessions",
    "activitySummaryList",
    "workoutList",
    "data",
  ]) {
    const val = obj[key];
    if (Array.isArray(val) && val.length > 0) return val.filter((x): x is Record<string, unknown> => x != null && typeof x === "object");
  }
  return [obj];
}

/** Parse NDJSON (newline-delimited JSON) - Garmin exports often use this */
function parseNdjson(text: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const line of text.split("\n")) {
    const s = line.trim();
    if (!s || s === "{" || s === "}" || s === "[") continue;
    try {
      const p = JSON.parse(s) as unknown;
      if (p && typeof p === "object" && !Array.isArray(p)) out.push(p as Record<string, unknown>);
    } catch {
      /* skip malformed line */
    }
  }
  return out;
}

/** Recursively find objects that look like activities (have activityType + duration/distance) */
function deepExtractActivities(node: unknown, seen = new WeakSet()): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const item of node) {
      out.push(...deepExtractActivities(item, seen));
    }
    return out;
  }
  const obj = node as Record<string, unknown>;
  if (seen.has(obj)) return out;
  const keys = Object.keys(obj).map((k) => k.toLowerCase());
  const hasType = keys.some((k) => k.includes("activitytype") || k === "type" || k.includes("sport"));
  const hasDuration = keys.some((k) => k.includes("duration") || k.includes("timer") || k.includes("elapsed"));
  const hasDistance = keys.some((k) => k.includes("distance") || k.includes("meters"));
  const hasStartTime = keys.some((k) => k.includes("starttime") || k.includes("inserteddate") || k.includes("date"));
  if ((hasType || hasStartTime) && (hasDuration || hasDistance)) {
    const dur = obj.DurationInSeconds ?? obj.durationInSeconds ?? obj.duration ?? obj.elapsedDuration ?? obj.movingDuration;
    const dist = obj.DistanceInMeters ?? obj.distanceInMeters ?? obj.distance ?? obj.metersDistance;
    if ((dur != null && Number(dur) > 0) || (dist != null && Number(dist) > 0)) {
      seen.add(obj);
      out.push(obj);
    }
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") out.push(...deepExtractActivities(v, seen));
  }
  return out;
}

/** Parse NDJSON (one JSON object per line) - common in Garmin exports */
function parseNdjsonToActivities(text: string, userId: string): Array<ReturnType<typeof parseSummarizedActivitiesExport>[number]> {
  const results: Array<ReturnType<typeof parseSummarizedActivitiesExport>[number]> = [];
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s === "{" || s === "}") continue;
    try {
      const o = JSON.parse(s) as Record<string, unknown>;
      if (!o || typeof o !== "object" || Array.isArray(o)) continue;
      const hasActivity = o.ActivityType ?? o.activityType ?? o.SummaryId ?? o.summaryId ?? o.ActivityId ?? o.activityId;
      if (!hasActivity) continue;
      const actType = String(o.activityType ?? o.ActivityType ?? o.sportType ?? o.type ?? "").toLowerCase();
      const durRaw = Number(o.DurationInSeconds ?? o.durationInSeconds ?? o.duration ?? 0);
      const durSec = durRaw > 100000 ? durRaw / 1000 : durRaw;
      const distM = Number(o.DistanceInMeters ?? o.distanceInMeters ?? o.distance ?? 0);
      if (durSec < 15 && distM < 10) continue;
      const ts = Number(o.StartTimeInSeconds ?? o.startTimeInSeconds ?? o.startTimeGmt ?? o.beginTimestamp ?? o.startTime ?? 0);
      const insertedStr = o.InsertedDate ?? o.insertedDate;
      const date =
        ts > 0
          ? new Date(ts > 1e10 ? ts : ts * 1000).toISOString().slice(0, 10)
          : typeof insertedStr === "string" && /^\d{4}-\d{2}-\d{2}/.test(insertedStr)
            ? insertedStr.slice(0, 10)
            : new Date().toISOString().slice(0, 10);
      const garminId = String(o.ActivityId ?? o.activityId ?? o.SummaryId ?? o.summaryId ?? o.id ?? `sum_${Date.now()}_${results.length}`);
      const distanceKm = distM > 0 ? Math.round((distM / 1000) * 100) / 100 : (durSec ? 0.01 : null);
      const typeStr = /run|walk|cycle|swim|hike|yoga|indoor/i.test(actType) ? actType.replace(/_/g, " ") : actType || "run";
      results.push({
        user_id: userId,
        date,
        type: typeStr,
        distance_km: distanceKm,
        duration_seconds: durSec || null,
        avg_pace: distanceKm && durSec ? formatPace(distanceKm, durSec) : null,
        avg_hr: Number(o.AverageHeartRateInBeatsPerMinute ?? o.averageHeartRate ?? o.avgHeartRate) || null,
        max_hr: Number(o.MaxHeartRateInBeatsPerMinute ?? o.maxHeartRate ?? o.maxHr) || null,
        cadence: Number(o.AverageRunCadenceInStepsPerMinute ?? o.averageRunCadence ?? o.avgCadence) || null,
        elevation_gain: Number(o.TotalElevationGainInMeters ?? o.totalElevationGain ?? o.elevationGain) || null,
        polyline: null,
        hr_zones: null,
        garmin_id: garminId,
        source: "garmin",
      });
    } catch {
      /* skip malformed line */
    }
  }
  return results;
}

/** Parse Garmin summarizedActivitiesExport format specifically (handles nested structure + NDJSON) */
function parseSummarizedActivitiesExport(
  text: string,
  userId: string
): Array<{ user_id: string; date: string; type: string; distance_km: number | null; duration_seconds: number | null; avg_pace: string | null; avg_hr: number | null; max_hr: number | null; cadence: number | null; elevation_gain: number | null; polyline: null; hr_zones: null; garmin_id: string; source: "garmin" }> {
  const results: Array<ReturnType<typeof parseSummarizedActivitiesExport>[number]> = [];
  try {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length < 100) {
      if (typeof window !== "undefined") console.warn("[Garmin Import] summarizedActivities: empty or tiny file");
      return results;
    }
    // Try NDJSON first (one activity per line - common in Garmin Connect exports)
    const ndjsonResults = parseNdjsonToActivities(trimmed, userId);
    if (ndjsonResults.length > 0) return ndjsonResults;
    const parsed = JSON.parse(trimmed) as unknown;
    let arr: unknown[] = [];
    if (Array.isArray(parsed) && parsed.length > 0) {
      const first = parsed[0];
      if (first && typeof first === "object") {
        const r = first as Record<string, unknown>;
        arr = (Array.isArray(r.summarizedActivitiesExport) ? r.summarizedActivitiesExport : Array.isArray(r.summarizedActivities) ? r.summarizedActivities : parsed) as unknown[];
      } else {
        arr = parsed as unknown[];
      }
    } else if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const r = parsed as Record<string, unknown>;
      arr = (Array.isArray(r.summarizedActivitiesExport) ? r.summarizedActivitiesExport : Array.isArray(r.summarizedActivities) ? r.summarizedActivities : []) as unknown[];
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
      const insertedStr = obj.InsertedDate ?? obj.insertedDate;
      const date =
        ts > 0
          ? new Date(ts > 1e10 ? ts : ts * 1000).toISOString().slice(0, 10)
          : typeof insertedStr === "string" && /^\d{4}-\d{2}-\d{2}/.test(insertedStr)
            ? insertedStr.slice(0, 10)
            : new Date().toISOString().slice(0, 10);
      const garminId = String(obj.activityId ?? obj.ActivityId ?? obj.summaryId ?? obj.SummaryId ?? obj.id ?? `sum_${Date.now()}_${results.length}`);
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
        polyline: null,
        hr_zones: null,
        garmin_id: garminId,
        source: "garmin",
      });
    }
  } catch (err) {
    if (typeof window !== "undefined") {
      console.warn("[Garmin Import] parseSummarizedActivitiesExport failed:", err instanceof Error ? err.message : String(err));
    }
  }
  return results;
}

/** Parse Garmin Activity Summary JSON (activities.json, summarizedFitness, TrainingHistory, NDJSON) → activity rows (all activity types) */
function parseActivityJson(
  text: string,
  userId: string
): Array<{ user_id: string; date: string; type: string; distance_km: number | null; duration_seconds: number | null; avg_pace: string | null; avg_hr: number | null; max_hr: number | null; cadence: number | null; elevation_gain: number | null; polyline: null; hr_zones: null; garmin_id: string; source: "garmin" }> {
  const results: Array<ReturnType<typeof parseActivityJson>[number]> = [];
  let objs: Record<string, unknown>[] = [];
  try {
    const trimmed = text.trim();
    const ndjsonObjs = parseNdjson(trimmed);
    if (ndjsonObjs.length > 0) objs = ndjsonObjs;
    if (objs.length === 0) {
      let parsed: unknown;
      if (trimmed.startsWith("[")) parsed = JSON.parse(trimmed);
      else if (trimmed.startsWith("{")) parsed = JSON.parse(trimmed);
      else return results;
      objs = extractActivityObjects(parsed);
      if (objs.length === 0) objs = deepExtractActivities(parsed);
    }
  } catch {
    return results;
  }
  for (const o of objs) {
    const at = o.activityType ?? o.activityTypeDTO ?? o.ActivityType ?? o.type ?? o.sportType ?? o.sport;
    const activityType =
      typeof at === "object" && at
        ? String((at as Record<string, unknown>).typeKey ?? (at as Record<string, unknown>).sportTypeKey ?? (at as Record<string, unknown>).type ?? at)
        : String(at ?? "").toUpperCase();
    const distRaw = o.DistanceInMeters ?? o.distanceInMeters ?? o.distance ?? o.metersDistance ?? o.totalDistance;
    let distM = typeof distRaw === "number" ? distRaw : Number(distRaw ?? 0) || 0;
    const steps = Number(o.Steps ?? o.steps ?? 0) || 0;
    if (distM < 10 && steps > 0) distM = steps * 0.75;
    const durRaw = o.DurationInSeconds ?? o.durationInSeconds ?? o.duration ?? o.elapsedDuration ?? o.movingDuration ?? o.totalDuration;
    let durSec = typeof durRaw === "number" ? durRaw : Number(durRaw ?? 0) || 0;
    if (durSec > 0 && durSec < 100) durSec *= 60;
    if (durSec > 100000) durSec = durSec / 1000;
    const hasActivityData = (distM > 0 || durSec > 0) && (distM >= 5 || durSec >= 20);
    if (!hasActivityData) continue;
    const distanceKm = distM > 0 ? Math.round((distM / 1000) * 100) / 100 : null;
    const durationSec = durSec || null;
    if (!distanceKm && !durationSec) continue;
    let date = "";
    const insertedDate = o.InsertedDate ?? o.insertedDate ?? o.createdDate;
    const startGMT = o.startTimeGMT ?? o.startTimeGmt ?? o.StartTimeGMT ?? o.startTimeLocal ?? o.beginTimestamp ?? o.startTime ?? o.Epoch ?? o.epoch;
    const startSec = Number(o.StartTimeInSeconds ?? o.startTimeInSeconds ?? o.startTime ?? o.epoch ?? 0);
    if (typeof insertedDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(insertedDate)) date = insertedDate.slice(0, 10);
    else if (typeof startGMT === "string" && /^\d{4}-\d{2}-\d{2}/.test(startGMT)) date = startGMT.slice(0, 10);
    else if (typeof startGMT === "number" && startGMT > 0) date = new Date(startGMT > 1e10 ? startGMT : startGMT * 1000).toISOString().slice(0, 10);
    else if (startSec) date = new Date(startSec > 1e10 ? startSec : startSec * 1000).toISOString().slice(0, 10);
    else if (typeof startGMT === "string") date = new Date(startGMT).toISOString().slice(0, 10);
    else if (typeof insertedDate === "string") date = new Date(insertedDate).toISOString().slice(0, 10);
    else date = new Date().toISOString().slice(0, 10);
    const garminId = String(o.SummaryId ?? o.summaryId ?? o.ActivityId ?? o.activityId ?? o.id ?? o.activityIdDTO ?? `json_${Date.now()}_${results.length}`);
    const avgPaceMinPerKm = Number(o.AveragePaceInMinutesPerKilometer ?? o.averagePace ?? o.avgPace ?? 0) || null;
    let avgPaceStr: string | null = null;
    if (avgPaceMinPerKm && avgPaceMinPerKm > 0) {
      let min = Math.floor(avgPaceMinPerKm);
      let sec = Math.round((avgPaceMinPerKm % 1) * 60);
      if (sec >= 60) {
        min += 1;
        sec = 0;
      }
      avgPaceStr = `${min}:${String(sec).padStart(2, "0")} /km`;
    } else if (distanceKm && durationSec) avgPaceStr = formatPace(distanceKm, durationSec);
    const typeStr = activityType === "RUNNING" || /running|run/i.test(activityType) ? "run" : (activityType || "run").toLowerCase().replace(/_/g, " ");
    results.push({
      user_id: userId,
      date,
      type: typeStr,
      distance_km: distanceKm ?? (durationSec ? 0.01 : null),
      duration_seconds: durationSec,
      avg_pace: avgPaceStr,
      avg_hr: Number(o.AverageHeartRateInBeatsPerMinute ?? o.averageHeartRate ?? o.avgHeartRate ?? o.avg_hr) || null,
      max_hr: Number(o.MaxHeartRateInBeatsPerMinute ?? o.maxHeartRate ?? o.max_hr) || null,
      cadence: Number(o.AverageRunCadenceInStepsPerMinute ?? o.averageRunCadence ?? o.cadence ?? o.avgCadence) || null,
      elevation_gain: Number(o.TotalElevationGainInMeters ?? o.elevationGain ?? o.elevation ?? o.ascent ?? o.elevationGainInMeters) || null,
      polyline: null,
      hr_zones: null,
      garmin_id: garminId,
      source: "garmin",
    });
  }
  return results;
}

/** Parse Garmin Metrics JSON (ActivityVo2Max, MetricsAcuteTrainingLoad, TrainingReadiness, etc.) → daily_readiness */
function parseMetricsJson(
  text: string,
  userId: string
): Array<{ user_id: string; date: string; score?: number | null; atl?: number | null; ctl?: number | null; tsb?: number | null }> {
  const results: Array<{ user_id: string; date: string; score?: number | null; atl?: number | null; ctl?: number | null; tsb?: number | null }> = [];
  let objs: Record<string, unknown>[] = [];
  try {
    const trimmed = text.trim();
    objs = parseNdjson(trimmed);
    if (objs.length === 0) {
      let parsed: unknown;
      if (trimmed.startsWith("[")) {
        parsed = JSON.parse(trimmed) as unknown[];
        if (Array.isArray(parsed)) objs = parsed.filter((x): x is Record<string, unknown> => x != null && typeof x === "object");
      } else if (trimmed.startsWith("{")) {
        parsed = JSON.parse(trimmed) as Record<string, unknown>;
        const inner = (parsed as Record<string, unknown>).data ?? (parsed as Record<string, unknown>).metrics ?? (parsed as Record<string, unknown>).items;
        if (Array.isArray(inner)) objs = inner.filter((x): x is Record<string, unknown> => x != null && typeof x === "object");
        else objs = [parsed as Record<string, unknown>];
      }
    }
  } catch {
    return results;
  }
  for (const o of objs) {
    const dateRaw = o.CalendarDate ?? o.calendarDate ?? o.Date ?? o.date ?? o.summaryDate ?? o.ReportDate ?? o.uploadDate ?? o.timestamp;
    let date = "";
    if (typeof dateRaw === "number") date = new Date(dateRaw > 1e10 ? dateRaw : dateRaw * 1000).toISOString().slice(0, 10);
    else {
      const s = String(dateRaw ?? "").slice(0, 10);
      const match = s.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (match) date = `${match[1]}-${match[2]}-${match[3]}`;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isValidWellnessDate(date)) continue;
    const vo2 = Number(o.Vo2Max ?? o.vo2Max ?? o.Vo2max ?? o.vo2max ?? o.aerobicValue) || null;
    const fitnessAge = Number(o.FitnessAge ?? o.fitnessAge ?? o.fitness_age) || null;
    const atlVal = Number(o.AcuteTrainingLoad ?? o.acuteTrainingLoad ?? o.atl ?? o.ATL ?? o.load ?? o.totalLoad ?? o.value) || null;
    const ctlVal = Number(o.ChronicTrainingLoad ?? o.chronicTrainingLoad ?? o.ctl ?? o.CTL ?? o.fitnessLoad ?? o.fitness) || null;
    const tsbRaw = o.TrainingStressBalance ?? o.trainingStressBalance ?? o.tsb ?? o.TSB ?? o.balance;
    const tsb = tsbRaw != null ? Number(tsbRaw) : (ctlVal != null && atlVal != null ? ctlVal - atlVal : null);
    const overall = Number(o.OverallScore ?? o.overallScore ?? o.trainingReadiness ?? o.score) || null;
    const score = overall ?? (vo2 != null ? Math.min(100, Math.round(vo2)) : null) ?? (fitnessAge != null ? Math.max(0, Math.min(100, 100 - fitnessAge)) : null);
    if (score == null && atlVal == null && ctlVal == null && tsb == null) continue;
    results.push({
      user_id: userId,
      date,
      score: score ?? null,
      atl: atlVal ?? null,
      ctl: ctlVal ?? null,
      tsb: tsb ?? null,
    });
  }
  return results;
}

/** Detect if JSON looks like Garmin Activity Summary (has ActivityType, DurationInSeconds, etc.) */
function isActivityJson(obj: Record<string, unknown>): boolean {
  const keys = Object.keys(obj).map((k) => k.toLowerCase());
  return (
    keys.some((k) => k.includes("activitytype")) &&
    (keys.some((k) => k.includes("duration") || k.includes("distance")) || keys.some((k) => k.includes("starttime")))
  );
}

/** Parse wellness CSV row */
function parseWellnessRow(row: Record<string, string>, userId: string): {
  user_id: string;
  date: string;
  sleep_hours: number | null;
  sleep_quality: number | null;
  hrv: number | null;
  resting_hr: number | null;
  score?: number | null;
} | null {
  const dateRaw =
    row["Date"] ??
    row["date"] ??
    row["calendarDate"] ??
    row["CalendarDate"] ??
    row["Sleep Date"] ??
    row["sleepDate"] ??
    "";
  const dateMatch = dateRaw.match(/(\d{4})-(\d{2})-(\d{2})/) ?? dateRaw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  const date = dateMatch
    ? dateMatch[1]!.length === 4
      ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
      : `${dateMatch[3]}-${dateMatch[1]}-${dateMatch[2]}`
    : null;
  if (!date || !isValidWellnessDate(date)) return null;

  const sleepSec =
    parseFloat(row["sleepSeconds"] ?? row["Sleep Seconds"] ?? row["DurationInSeconds"] ?? row["totalSleepTime"] ?? row["Total Sleep"] ?? row["sleep_hours"] ?? "") || null;
  const sleepHoursFromSec = sleepSec && sleepSec > 24 ? sleepSec / 3600 : sleepSec;
  const sleep =
    (sleepHoursFromSec ?? parseFloat(row["sleepHours"] ?? row["Sleep Hours"] ?? row["sleep_hours"] ?? "")) || null;

  const sleepQuality =
    parseInt(row["sleepScore"] ?? row["Sleep Quality"] ?? row["sleep_quality"] ?? row["overallSleepScore"] ?? "", 10) || null;
  const hrv =
    parseFloat(row["hrvSDNN"] ?? row["HRV"] ?? row["hrv"] ?? row["restingHeartRateVariability"] ?? row["hrvSdnn"] ?? "") || null;
  const restingHr =
    parseInt(row["restingHeartRate"] ?? row["Resting HR"] ?? row["resting_hr"] ?? row["Resting Heart Rate"] ?? row["restingHeartRate"] ?? "", 10) || null;
  const stress = parseInt(row["stress"] ?? row["stressScore"] ?? row["averageStressLevel"] ?? row["stress"] ?? "", 10) || null;

  if (!sleep && !hrv && !restingHr && !sleepQuality && !stress) return null;

  const score = stress != null ? Math.max(0, Math.min(100, 100 - stress)) : null;
  return {
    user_id: userId,
    date,
    sleep_hours: sleep,
    sleep_quality: sleepQuality,
    hrv,
    resting_hr: restingHr,
    score,
  };
}

function isWellnessCsv(rows: Record<string, string>[]): boolean {
  if (!rows[0]) return false;
  if (isActivityCsv(rows)) return false; // Don't treat activity CSV as wellness (would inflate counts)
  const keys = Object.keys(rows[0]).map((k) => k.toLowerCase());
  return keys.some(
    (k) =>
      k.includes("sleep") ||
      k.includes("hrv") ||
      k.includes("resting") ||
      k.includes("calendar") ||
      k.includes("stress") ||
      k.includes("duration") ||
      k.includes("heart") ||
      k.includes("date")
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

/** Parse Garmin Activity CSV (GarminActivitySummary) → activity rows */
function parseActivityCsv(rows: Record<string, string>[], userId: string) {
  const runTypes = /running|walking|run|treadmill|street|trail|track|indoor_run|hiking|jogging|cycling|swim|generic|training/i;
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
    polyline: null;
    hr_zones: null;
    garmin_id: string;
    source: "garmin";
  }> = [];
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
      polyline: null,
      hr_zones: null,
      garmin_id: String(garminId),
      source: "garmin",
    });
  }
  return results;
}

/** Load all FIT file paths and buffers from a ZIP (handles nested zips) */
async function collectFitFromZip(
  zip: JSZip,
  basePath: string,
  onProgress?: (msg: string) => void
): Promise<Array<{ path: string; buf: ArrayBuffer }>> {
  const results: Array<{ path: string; buf: ArrayBuffer }> = [];
  const entries = Object.entries(zip.files).filter(([, f]) => !f.dir);

  const fitEntries = entries.filter(([p]) => /\.fit$/i.test(p));
  const nestedZips = entries.filter(([p]) => /\.zip$/i.test(p));

  for (const [path, entry] of fitEntries) {
    onProgress?.(`Reading ${path.split("/").pop() ?? path}...`);
    const buf = await entry.async("arraybuffer");
    results.push({ path: basePath ? `${basePath}/${path}` : path, buf });
  }

  for (const [path, entry] of nestedZips) {
    onProgress?.(`Extracting nested ${path.split("/").pop() ?? path}...`);
    const nestedBuf = await entry.async("arraybuffer");
    const nestedZip = await JSZip.loadAsync(nestedBuf);
    const nested = await collectFitFromZip(nestedZip, path.replace(/\.zip$/i, ""), onProgress);
    results.push(...nested);
  }

  return results;
}

const DEBUG =
  typeof window !== "undefined" &&
  (localStorage.getItem("garmin_import_debug") === "1" || (window as Window & { __GARMIN_DEBUG__?: boolean }).__GARMIN_DEBUG__);

function logImport(step: string, data?: unknown) {
  console.log(`[Garmin Import] ${step}`, data ?? "");
}

/** Server-side fallback when client parser returns 0 for summarizedActivities */
async function parseActivitiesViaEdgeFunction(
  text: string,
  userId: string
): Promise<Array<{ user_id: string; date: string; type: string; distance_km: number | null; duration_seconds: number | null; avg_pace: string | null; avg_hr: number | null; max_hr: number | null; cadence: number | null; elevation_gain: number | null; polyline: string | null; hr_zones: Record<string, number> | null; garmin_id: string; source: string }>> {
  try {
    const { data } = await supabase.functions.invoke("garmin-parse-activities", {
      body: { json: text.length > 5_000_000 ? text.slice(0, 5_000_000) : text },
    });
    const arr = (data as { activities?: Array<Record<string, unknown>> })?.activities ?? [];
    return arr
      .map((a) => ({
        user_id: userId,
        date: String(a.date ?? ""),
        type: String(a.type ?? "run"),
        distance_km: typeof a.distance_km === "number" ? a.distance_km : null,
        duration_seconds: typeof a.duration_seconds === "number" ? a.duration_seconds : null,
        avg_pace: typeof a.avg_pace === "string" ? a.avg_pace : null,
        avg_hr: typeof a.avg_hr === "number" ? a.avg_hr : null,
        max_hr: typeof a.max_hr === "number" ? a.max_hr : null,
        cadence: typeof a.cadence === "number" ? a.cadence : null,
        elevation_gain: typeof a.elevation_gain === "number" ? a.elevation_gain : null,
        polyline: null as string | null,
        hr_zones: null as Record<string, number> | null,
        garmin_id: String(a.garmin_id ?? ""),
        source: "garmin",
      }))
      .filter((a) => a.garmin_id);
  } catch {
    return [];
  }
}

/** Enable in browser console: localStorage.setItem('garmin_import_debug','1') for extra logging */

/** Server-side ZIP import: upload to Storage, Edge Function extracts and processes. Handles macOS Compress ZIPs that fail in browser. */
export async function importGarminZipServer(
  zipFile: File,
  userId: string,
  onProgress?: (msg: string, pct?: number) => void
): Promise<ImportResult> {
  const { error: sessionErr } = await supabase.auth.refreshSession();
  if (sessionErr) throw new Error("Session expired. Please sign out and sign back in.");

  onProgress?.("Uploading ZIP...", 10);
  const storagePath = `${userId}/${Date.now()}_${zipFile.name}`;
  const { error: uploadErr } = await supabase.storage
    .from("garmin-imports")
    .upload(storagePath, zipFile, { contentType: "application/zip", upsert: true });

  if (uploadErr) {
    if (uploadErr.message?.includes("Bucket not found") || uploadErr.message?.includes("not found")) {
      throw new Error("Import bucket not set up. Run migration to create garmin-imports bucket.");
    }
    throw new Error(uploadErr.message ?? "Upload failed");
  }

  onProgress?.("Processing on server...", 50);

  const { data, error } = await supabase.functions.invoke("garmin-import-zip", {
    body: { storagePath },
  });

  if (error) throw new Error(error.message ?? "Import failed");
  const result = data as { activitiesCount?: number; readinessDaysCount?: number; error?: string } | null;
  if (result?.error) throw new Error(result.error);

  onProgress?.("Done", 100);

  return {
    activitiesCount: result?.activitiesCount ?? 0,
    readinessDaysCount: result?.readinessDaysCount ?? 0,
  };
}

/** Fetch user's max HR from athlete_profile for smart activity naming */
async function fetchUserMaxHr(userId: string): Promise<number | null> {
  const { data } = await supabase.from("athlete_profile").select("max_hr").eq("user_id", userId).maybeSingle();
  const hr = data?.max_hr;
  return typeof hr === "number" && hr > 100 && hr < 250 ? hr : null;
}

export async function importGarminZip(
  zipFile: File,
  userId: string,
  onProgress?: (msg: string, pct?: number) => void
): Promise<ImportResult> {
  let activitiesCount = 0;
  const readinessDatesSeen = new Set<string>();
  let firstError: { msg: string; context: string } | null = null;

  const captureError = (err: { message?: string; details?: string } | null, ctx: string) => {
    if (err && !firstError) firstError = { msg: err.message ?? String(err), context: ctx };
  };

  const { error: sessionErr } = await supabase.auth.refreshSession();
  if (sessionErr) throw new Error("Session expired. Please sign out and sign back in.");

  const userMaxHr = await fetchUserMaxHr(userId);

  onProgress?.("Extracting archive...", 0);
  const zipArrayBuf = await zipFile.arrayBuffer();
  const zipU8 = new Uint8Array(zipArrayBuf);
  let entries: Array<[string, { async: (t: "arraybuffer" | "string") => Promise<ArrayBuffer | string> }]> = [];

  try {
    const unzipped = unzipSync(zipU8, { filter: () => true });
    entries = Object.entries(unzipped).map(([path, data]) => [
      path.replace(/\\/g, "/"),
      {
        async: (t: "arraybuffer" | "string") =>
          Promise.resolve(
            t === "string"
              ? new TextDecoder("utf-8", { fatal: false }).decode(data)
              : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
          ),
      },
    ]);
  } catch (fflateErr) {
    try {
      const zip = await JSZip.loadAsync(zipArrayBuf);
      entries = Object.entries(zip.files)
        .filter(([, f]) => !f.dir)
        .map(([p, f]) => [p, { async: (t: "arraybuffer" | "string") => f.async(t) }]);
    } catch (jszipErr) {
      throw new Error(
        "ZIP can't be read. Try: 1) Unzip the file, then use 'select folder'. 2) Re-download from Garmin Connect. 3) Re-compress with 7-Zip or The Unarchiver instead of macOS Compress."
      );
    }
  }
  const allPaths = entries.map(([p]) => p);

  const fitnessCsvEntries = entries.filter(([path]) => isFitnessCsvPath(path));
  const fitnessFitEntries = entries.filter(([path]) => isFitnessPath(path));
  const fitnessZipEntries = entries.filter(([path]) => isFitnessZipPath(path));
  const metricsZipEntries = entries.filter(([path]) => isMetricsZipPath(path));
  const otherGarminZipEntries = entries.filter(([path]) => isGarminZipPath(path) && !isFitnessZipPath(path) && !isMetricsZipPath(path));
  const wellnessEntries = entries.filter(([path]) => {
    const n = path.replace(/\\/g, "/").toLowerCase();
    return (n.includes("di-connect-wellness") || n.includes("di_connect_wellness")) && /\.csv$/i.test(path);
  });
  const jsonEntries = entries.filter(([path]) => {
    const n = path.replace(/\\/g, "/").toLowerCase();
    return (n.includes("di-connect") || n.includes("di_connect") || n.includes("garmin") || n.includes("summarizedactivities")) && /\.json$/i.test(path);
  });

  let fitEntries = fitnessFitEntries;
  let zipEntries = [...fitnessZipEntries, ...metricsZipEntries, ...otherGarminZipEntries];
  let wellEntries = wellnessEntries;
  let fitnessCsv = fitnessCsvEntries;
  let jsonFiles = jsonEntries;
  if (fitEntries.length + zipEntries.length + wellEntries.length + fitnessCsv.length + jsonFiles.length === 0) {
    fitEntries = entries.filter(([p]) => /\.fit$/i.test(p));
    zipEntries = entries.filter(([p]) => /\.zip$/i.test(p));
    wellEntries = entries.filter(([p]) => /\.csv$/i.test(p));
    fitnessCsv = [];
    jsonFiles = entries.filter(([p]) => /\.json$/i.test(p));
  }
  if (jsonFiles.length === 0 && entries.some(([p]) => /summarizedactivities.*\.json$/i.test(p))) {
    jsonFiles = entries.filter(([p]) => /summarizedactivities.*\.json$/i.test(p));
    logImport("Found summarizedActivities by name fallback", jsonFiles.length);
  }

  logImport("ZIP paths (first 40)", allPaths.slice(0, 40));
  logImport("fitness FIT", fitEntries.length);
  logImport("fitness ZIP", zipEntries.length);
  logImport("wellness CSV", wellEntries.length);
  logImport("fitness CSV", fitnessCsv.length);
  logImport("JSON", jsonFiles.length);

  const fitFromZips: Array<{ path: string; buf: ArrayBuffer }> = [];
  const jsonFromZips: Array<{ path: string; text: string }> = [];
  for (const [path, entry] of zipEntries) {
    onProgress?.(`Extracting ${path.split("/").pop()}...`, undefined);
    const buf = await entry.async("arraybuffer");
    const nestedZip = await JSZip.loadAsync(buf);
    const nested = await collectFitFromZip(nestedZip, path, (msg) => onProgress?.(msg, undefined));
    fitFromZips.push(...nested);
    const nEntries = Object.entries(nestedZip.files).filter(([, f]) => !f.dir);
    for (const [p, e] of nEntries) {
      if (/\.json$/i.test(p)) {
        const text = await e.async("string");
        jsonFromZips.push({ path: `${path}/${p}`, text });
      }
    }
  }

  const total = fitEntries.length + fitFromZips.length + wellEntries.length + fitnessCsv.length + jsonFiles.length + jsonFromZips.length;
  let done = 0;

  for (const [path, entry] of fitEntries) {
    onProgress?.(`Parsing ${path.split("/").pop()}...`, total ? (done / total) * 100 : undefined);
    const buf = await entry.async("arraybuffer");
    const garminId = path.replace(/[/\\]/g, "_").replace(/\.fit$/i, "") || `fit_${Date.now()}_${done}`;
    try {
      const activities = await parseFitActivities(buf, userId, garminId, userMaxHr);
      for (const activity of activities) {
        const row = sanitizeActivityForDb(activity);
        if (!row) continue;
        const { error } = await supabase.from("activity").upsert(row, { onConflict: "user_id,garmin_id" });
        if (!error) {
          activitiesCount++;
          await saveFitExtras(activity as FitActivity & { _streams?: FitStreams; _laps?: FitLap[] }, userId);
        } else captureError(error, "activity upsert");
      }
    } catch (e) {
      captureError(e instanceof Error ? e : { message: String(e) }, "FIT parse");
    }
    done++;
  }

  for (const { path, buf } of fitFromZips) {
    onProgress?.(`Parsing ${path.split("/").pop() ?? path}...`, total ? (done / total) * 100 : undefined);
    const garminId = path.replace(/[/\\]/g, "_").replace(/\.fit$/i, "") || `fit_${Date.now()}_${done}`;
    try {
      const activities = await parseFitActivities(buf, userId, garminId, userMaxHr);
      for (const activity of activities) {
        const row = sanitizeActivityForDb(activity);
        if (!row) continue;
        const { error } = await supabase.from("activity").upsert(row, { onConflict: "user_id,garmin_id" });
        if (!error) {
          activitiesCount++;
          await saveFitExtras(activity as FitActivity & { _streams?: FitStreams; _laps?: FitLap[] }, userId);
        } else captureError(error, "activity upsert (nested)");
      }
    } catch (e) {
      captureError(e instanceof Error ? e : { message: String(e) }, "FIT parse (nested)");
    }
    done++;
  }

  for (const [path, entry] of wellEntries) {
    onProgress?.(`Parsing ${path.split("/").pop()}...`, total ? (done / total) * 100 : undefined);
    const text = await entry.async("string");
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
    const rows = parsed.data ?? [];
    if (isActivityCsv(rows)) {
      const activities = parseActivityCsv(rows, userId);
      for (const a of activities) {
        const row = sanitizeActivityForDb(a);
        if (!row) continue;
        const { error } = await supabase.from("activity").upsert(row, { onConflict: "user_id,garmin_id" });
        if (!error) activitiesCount++;
        else captureError(error, "activity CSV (wellness path)");
      }
    } else if (isWellnessCsv(rows)) {
      const toInsert = rows.map((r) => parseWellnessRow(r, userId)).filter(Boolean);
      if (DEBUG) console.log("[Garmin Import] wellness toInsert:", toInsert.length, toInsert[0]);
      for (const row of toInsert) {
        const { error } = await supabase.from("daily_readiness").upsert(
          {
            user_id: userId,
            date: row!.date,
            sleep_hours: row!.sleep_hours,
            sleep_quality: row!.sleep_quality,
            hrv: row!.hrv,
            hrv_baseline: row!.hrv ?? undefined,
            resting_hr: row!.resting_hr,
            score: row!.score,
          },
          { onConflict: "user_id,date" }
        );
        if (!error && row!.date) readinessDatesSeen.add(row!.date);
        else if (DEBUG) console.warn("[Garmin Import] readiness upsert error:", error);
      }
    }
    done++;
  }

  for (const [path, entry] of fitnessCsv) {
    onProgress?.(`Parsing ${path.split("/").pop() ?? path}...`, total ? (done / total) * 100 : undefined);
    const text = await entry.async("string");
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
    const rows = parsed.data ?? [];
    if (isActivityCsv(rows)) {
      const activities = parseActivityCsv(rows, userId);
      for (const a of activities) {
        const row = sanitizeActivityForDb(a);
        if (!row) continue;
        const { error } = await supabase.from("activity").upsert(row, { onConflict: "user_id,garmin_id" });
        if (!error) activitiesCount++;
        else captureError(error, "activity CSV upsert");
      }
    }
    done++;
  }

  const processJson = async (path: string, text: string) => {
    onProgress?.(`Parsing ${path.split("/").pop() ?? path}...`, total ? (done / total) * 100 : undefined);
    let activities: Array<{ user_id: string; date: string; type: string; distance_km: number | null; duration_seconds: number | null; avg_pace: string | null; avg_hr: number | null; max_hr: number | null; cadence: number | null; elevation_gain: number | null; polyline: string | null; hr_zones: Record<string, number> | null; garmin_id: string; source: string }> = [];
    if (isActivityJsonPath(path)) {
      const pathLow = path.toLowerCase();
      if (pathLow.includes("summarizedactivities")) {
        activities = parseSummarizedActivitiesExport(text, userId);
      }
      if (activities.length === 0) activities = parseActivityJson(text, userId);
      if (activities.length === 0 && pathLow.includes("summarizedactivities") && text.length > 500) {
        activities = await parseActivitiesViaEdgeFunction(text, userId);
      }
    }
    if (DEBUG && activities.length === 0 && isActivityJsonPath(path)) {
      const preview = text.slice(0, 500);
      console.log("[Garmin Import] No activities from", path, "| preview:", preview);
    }
    if (activities.length > 0) {
      for (const a of activities) {
        const row = sanitizeActivityForDb(a);
        if (!row) continue;
        const { error } = await supabase.from("activity").upsert(row, { onConflict: "user_id,garmin_id" });
        if (!error) activitiesCount++;
        else captureError(error, "activity JSON upsert");
      }
    } else {
      const metrics = parseMetricsJson(text, userId);
      for (const m of metrics) {
        const { error } = await supabase.from("daily_readiness").upsert(
          { user_id: m.user_id, date: m.date, score: m.score, atl: m.atl, ctl: m.ctl, tsb: m.tsb },
          { onConflict: "user_id,date" }
        );
        if (!error && m.date) readinessDatesSeen.add(m.date);
        else captureError(error, "metrics JSON upsert");
      }
    }
    done++;
  };

  for (const [path, entry] of jsonFiles) {
    const text = await entry.async("string");
    await processJson(path, text);
  }
  for (const { path, text } of jsonFromZips) {
    await processJson(path, text);
  }

  const totalProcessed = fitEntries.length + fitFromZips.length + wellEntries.length + fitnessCsv.length + jsonFiles.length + jsonFromZips.length;
  const jsonProcessed = jsonFiles.length + jsonFromZips.length;
  const readinessDaysCount = readinessDatesSeen.size;
  const result: ImportResult = {
    activitiesCount,
    readinessDaysCount,
    filesProcessed: totalProcessed,
    jsonProcessed: jsonProcessed > 0 ? jsonProcessed : undefined,
    ...(totalProcessed > 0 && activitiesCount === 0 && readinessDaysCount === 0 && { samplePaths: allPaths.filter((p) => /\.json$/i.test(p)).slice(0, 15) }),
  };
  if (totalProcessed > 0 && activitiesCount === 0 && readinessDaysCount === 0 && firstError) {
    throw new Error(`Import failed: ${firstError.msg} (${firstError.context}). Check browser console for details.`);
  }
  if (DEBUG || (activitiesCount === 0 && readinessDaysCount === 0)) {
    console.log(
      "[Garmin Import] done:",
      result,
      "| FIT:",
      fitEntries.length,
      "+ nested:",
      fitFromZips.length,
      "| CSV:",
      wellEntries.length,
      "| JSON:",
      jsonFiles.length + jsonFromZips.length,
      firstError ? "| Error: " + firstError.msg : ""
    );
    if (activitiesCount === 0 && jsonFiles.length + jsonFromZips.length > 0) {
      console.log("[Garmin Import] JSON paths in ZIP:", allPaths.filter((p) => /\.json$/i.test(p)).slice(0, 20));
    }
  }
  onProgress?.("Done.", 100);
  return result;
}

/** Import from a folder of files (from drag-drop or webkitdirectory) */
export async function importGarminFolder(
  files: Array<File | { file: File; path: string }>,
  userId: string,
  onProgress?: (msg: string, pct?: number) => void
): Promise<ImportResult> {
  let activitiesCount = 0;
  const readinessDatesSeen = new Set<string>();
  let firstError: { msg: string; context: string } | null = null;
  const captureError = (err: { message?: string } | null, ctx: string) => {
    if (err && !firstError) firstError = { msg: err.message ?? String(err), context: ctx };
  };

  const { error: sessionErr } = await supabase.auth.refreshSession();
  if (sessionErr) throw new Error("Session expired. Please sign out and sign back in.");

  const userMaxHr = await fetchUserMaxHr(userId);

  const withPath = files.map((f): { file: File; path: string } => {
    if (f instanceof File) {
      const path = (f as File & { webkitRelativePath?: string }).webkitRelativePath ?? f.name;
      return { file: f, path };
    }
    return f;
  });

  let fitnessFiles = withPath.filter(({ path }) => isFitnessPath(path));
  let fitnessZipFiles = withPath.filter(({ path }) => isFitnessZipPath(path));
  let fitnessCsvFiles = withPath.filter(({ path }) => isFitnessCsvPath(path));
  const metricsZipFiles = withPath.filter(({ path }) => isMetricsZipPath(path));
  const otherGarminZipFiles = withPath.filter(({ path }) => isGarminZipPath(path) && !isFitnessZipPath(path) && !isMetricsZipPath(path));
  let wellnessFiles = withPath.filter(({ path }) => isWellnessPath(path));
  let jsonFiles = withPath.filter(({ path }) => isGarminJsonPath(path));

  const allZipFiles = [...fitnessZipFiles, ...metricsZipFiles, ...otherGarminZipFiles];

  if (fitnessFiles.length + allZipFiles.length + fitnessCsvFiles.length + wellnessFiles.length + jsonFiles.length === 0) {
    fitnessFiles = withPath.filter(({ path }) => /\.fit$/i.test(path));
    fitnessZipFiles = withPath.filter(({ path }) => /\.zip$/i.test(path));
    fitnessCsvFiles = withPath.filter(({ path }) => /\.csv$/i.test(path));
    wellnessFiles = withPath.filter(({ path }) => /\.csv$/i.test(path));
    jsonFiles = withPath.filter(({ path }) => /\.json$/i.test(path));
  }

  const total = fitnessFiles.length + (allZipFiles.length || fitnessZipFiles.length) + fitnessCsvFiles.length + wellnessFiles.length + jsonFiles.length;
  logImport("Folder paths (first 50)", withPath.slice(0, 50).map(({ path }) => path));
  logImport("Folder counts", { fitnessFiles: fitnessFiles.length, zipFiles: allZipFiles.length || fitnessZipFiles.length, wellnessFiles: wellnessFiles.length, jsonFiles: jsonFiles.length, fitnessCsv: fitnessCsvFiles.length });
  if (total === 0) {
    throw new Error("No FIT, CSV, or JSON files found. Drop the full Garmin export (ZIP or unzipped folder). Paths received: " + withPath.slice(0, 10).map((p) => p.path).join(", "));
  }

  let done = 0;

  const jsonToProcess: Array<{ path: string; text: string }> = [];
  const zipsToProcess = allZipFiles.length > 0 ? allZipFiles : fitnessZipFiles;
  for (const { file, path } of zipsToProcess) {
    onProgress?.(`Extracting ${path.split("/").pop() ?? path}...`, total ? (done / total) * 100 : undefined);
    const zipBuf = await file.arrayBuffer();
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(zipBuf);
    } catch {
      logImport("Invalid ZIP, skipping", path);
      done++;
      continue;
    }
    const fitItems = await collectFitFromZip(zip, path.replace(/\.zip$/i, ""), (msg) => onProgress?.(msg, undefined));
    for (const { path: fitPath, buf } of fitItems) {
      onProgress?.(`Parsing ${fitPath.split("/").pop() ?? fitPath}...`, total ? (done / total) * 100 : undefined);
      const garminId = fitPath.replace(/[/\\]/g, "_").replace(/\.fit$/i, "") || `fit_${Date.now()}_${done}`;
      try {
        const activities = await parseFitActivities(buf, userId, garminId, userMaxHr);
        for (const activity of activities) {
          const row = sanitizeActivityForDb(activity);
          if (!row) continue;
        const { error } = await supabase.from("activity").upsert(row, { onConflict: "user_id,garmin_id" });
        if (!error) {
          activitiesCount++;
          await saveFitExtras(activity as FitActivity & { _streams?: FitStreams; _laps?: FitLap[] }, userId);
        } else captureError(error, "activity upsert (zip)");
        }
      } catch (e) {
        captureError(e instanceof Error ? e : { message: String(e) }, "FIT parse (zip)");
      }
      done++;
    }
    for (const [p, e] of Object.entries(zip.files).filter(([, f]) => !f.dir)) {
      if (/\.json$/i.test(p)) {
        const text = await e.async("string");
        jsonToProcess.push({ path: `${path}/${p}`, text });
      }
    }
    if (fitItems.length === 0) done++;
  }

  for (const { file, path } of fitnessFiles) {
    onProgress?.(`Parsing ${path.split("/").pop() ?? path}...`, total ? (done / total) * 100 : undefined);
    const garminId = path.replace(/[/\\]/g, "_").replace(/\.fit$/i, "") || `fit_${Date.now()}_${done}`;
    try {
      const buf = await file.arrayBuffer();
      const activities = await parseFitActivities(buf, userId, garminId, userMaxHr);
      logImport(`FIT parsed (folder) ${path}`, { activities: activities.length });
      for (const activity of activities) {
        const row = sanitizeActivityForDb(activity);
        if (!row) {
          logImport("FIT row rejected (folder)", { garminId, date: activity.date });
          continue;
        }
        const { error } = await supabase.from("activity").upsert(row, { onConflict: "user_id,garmin_id" });
        if (!error) {
          activitiesCount++;
          await saveFitExtras(activity as FitActivity & { _streams?: FitStreams; _laps?: FitLap[] }, userId);
        } else {
          captureError(error, "activity upsert");
          const errDetail = typeof error === "object" && error
            ? { message: (error as { message?: string }).message, details: (error as { details?: string }).details, hint: (error as { hint?: string }).hint, code: (error as { code?: string }).code }
            : error;
          logImport("activity upsert error (folder)", errDetail);
        }
      }
    } catch (e) {
      captureError(e instanceof Error ? e : { message: String(e) }, "FIT parse");
      logImport("FIT parse error (folder)", { path, err: e instanceof Error ? e.message : String(e) });
    }
    done++;
  }

  for (const { file, path } of fitnessCsvFiles) {
    onProgress?.(`Parsing ${path.split("/").pop() ?? path}...`, total ? (done / total) * 100 : undefined);
    const text = await file.text();
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
    const rows = parsed.data ?? [];
    if (isActivityCsv(rows)) {
      const activities = parseActivityCsv(rows, userId);
      for (const a of activities) {
        const row = sanitizeActivityForDb(a);
        if (!row) continue;
        const { error } = await supabase.from("activity").upsert(row, { onConflict: "user_id,garmin_id" });
        if (!error) activitiesCount++;
      }
    }
    done++;
  }

  for (const { file, path } of wellnessFiles) {
    onProgress?.(`Parsing ${path.split("/").pop() ?? path}...`, total ? (done / total) * 100 : undefined);
    const text = await file.text();
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
    const rows = parsed.data ?? [];
    if (isWellnessCsv(rows)) {
      const toInsert = rows.map((r) => parseWellnessRow(r, userId)).filter(Boolean);
      for (const row of toInsert) {
        const { error } = await supabase.from("daily_readiness").upsert(
          {
            user_id: userId,
            date: row!.date,
            sleep_hours: row!.sleep_hours,
            sleep_quality: row!.sleep_quality,
            hrv: row!.hrv,
            hrv_baseline: row!.hrv ?? undefined,
            resting_hr: row!.resting_hr,
            score: row!.score,
          },
          { onConflict: "user_id,date" }
        );
        if (!error && row!.date) readinessDatesSeen.add(row!.date);
        else captureError(error, "readiness upsert");
      }
    }
    done++;
  }

  const processJsonFile = async (path: string, text: string) => {
    onProgress?.(`Parsing ${path.split("/").pop() ?? path}...`, total ? (done / total) * 100 : undefined);
    const trimmed = text.trim();
    if (trimmed.length < 20 || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
      done++;
      return;
    }
    let activities: Array<{ user_id: string; date: string; type: string; distance_km: number | null; duration_seconds: number | null; avg_pace: string | null; avg_hr: number | null; max_hr: number | null; cadence: number | null; elevation_gain: number | null; polyline: string | null; hr_zones: Record<string, number> | null; garmin_id: string; source: string }> = [];
    if (isActivityJsonPath(path)) {
      const pathLow = path.toLowerCase();
      if (pathLow.includes("summarizedactivities")) {
        activities = parseSummarizedActivitiesExport(text, userId);
      }
      if (activities.length === 0) activities = parseActivityJson(text, userId);
      if (activities.length === 0 && pathLow.includes("summarizedactivities") && text.length > 500) {
        activities = await parseActivitiesViaEdgeFunction(text, userId);
      }
    }
    if (activities.length === 0 && isActivityJsonPath(path) && path.toLowerCase().includes("summarizedactivities")) {
      console.warn("[Garmin Import] No activities from summarizedActivities file:", path, "| size:", text.length, "bytes");
    }
    if (activities.length > 0) {
      for (const a of activities) {
        const row = sanitizeActivityForDb(a);
        if (!row) continue;
        const { error } = await supabase.from("activity").upsert(row, { onConflict: "user_id,garmin_id" });
        if (!error) activitiesCount++;
        else captureError(error, "activity JSON upsert");
      }
    } else {
      const metrics = parseMetricsJson(text, userId);
      for (const m of metrics) {
        const { error } = await supabase.from("daily_readiness").upsert(
          { user_id: m.user_id, date: m.date, score: m.score, atl: m.atl, ctl: m.ctl, tsb: m.tsb },
          { onConflict: "user_id,date" }
        );
        if (!error && m.date) readinessDatesSeen.add(m.date);
      }
    }
    done++;
  };

  const sortedJsonFiles = [...jsonFiles].sort((a, b) => {
    const aHas = a.path.toLowerCase().includes("summarizedactivities") ? 0 : 1;
    const bHas = b.path.toLowerCase().includes("summarizedactivities") ? 0 : 1;
    return aHas - bHas;
  });
  for (const { file, path } of sortedJsonFiles) {
    const text = await file.text();
    await processJsonFile(path, text);
  }
  for (const { path, text } of jsonToProcess) {
    await processJsonFile(path, text);
  }

  const jsonCount = jsonFiles.length + jsonToProcess.length;
  const totalProcessed = fitnessFiles.length + zipsToProcess.length + fitnessCsvFiles.length + wellnessFiles.length + jsonCount;
  const readinessDaysCount = readinessDatesSeen.size;
  onProgress?.("Done.", 100);
  return {
    activitiesCount,
    readinessDaysCount,
    filesProcessed: totalProcessed,
    jsonProcessed: jsonCount > 0 ? jsonCount : undefined,
    ...(totalProcessed > 0 && activitiesCount === 0 && readinessDaysCount === 0 && {
      samplePaths: withPath.filter(({ path }) => /\.json$/i.test(path)).map((p) => p.path).slice(0, 15),
    }),
  };
}
