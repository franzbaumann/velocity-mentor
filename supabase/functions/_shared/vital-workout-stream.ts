/**
 * Fetch and normalize Junction/Vital per-workout stream for activity_streams upsert.
 * @see docs/vital-junction-workout-streams.md
 */

export type NormalizedWorkoutStream = {
  time: number[];
  heartrate: number[];
  cadence: number[];
  altitude: number[];
  distance: number[];
  pace: number[];
  latlng: number[][];
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function toNumArray(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => Number(x)).filter((n) => Number.isFinite(n));
}

/** Flatten [{timestamp, value}] or [{start, value}] style samples to parallel arrays. */
function seriesFromSamples(samples: unknown): { t: number[]; values: number[] } {
  if (!Array.isArray(samples)) return { t: [], values: [] };
  const t: number[] = [];
  const values: number[] = [];
  for (const row of samples) {
    const o = asRecord(row);
    if (!o) continue;
    const ts = Number(o.timestamp ?? o.time ?? o.start ?? o.offset ?? o.seconds);
    const val = Number(o.value ?? o.val ?? o.bpm ?? o.cadence ?? o.level ?? o.altitude ?? o.elevation);
    if (!Number.isFinite(val)) continue;
    if (Number.isFinite(ts)) t.push(ts);
    else t.push(t.length ? t[t.length - 1] + 1 : 0);
    values.push(val);
  }
  return { t, values };
}

function pickSeries(body: Record<string, unknown>, keys: string[]): number[] {
  for (const k of keys) {
    const v = body[k];
    if (v == null) continue;
    if (Array.isArray(v) && v.length && typeof v[0] === "object") {
      const { values } = seriesFromSamples(v);
      if (values.length) return values;
    }
    const arr = toNumArray(v);
    if (arr.length) return arr;
  }
  return [];
}

function pickLatLng(body: Record<string, unknown>): number[][] {
  const keys = ["lat_lng_degrees", "latlng", "positions", "coordinates", "gps"];
  for (const k of keys) {
    const v = body[k];
    if (!Array.isArray(v) || v.length === 0) continue;
    const first = v[0];
    if (Array.isArray(first) && first.length >= 2) {
      return (v as unknown[][]).map((p) => [Number(p[0]), Number(p[1])]).filter((p) =>
        Number.isFinite(p[0]) && Number.isFinite(p[1])
      );
    }
    if (asRecord(first)) {
      const out: number[][] = [];
      for (const row of v) {
        const o = asRecord(row);
        if (!o) continue;
        const lat = Number(o.lat ?? o.latitude ?? o.lat_degrees);
        const lng = Number(o.lng ?? o.lon ?? o.longitude ?? o.lng_degrees);
        if (Number.isFinite(lat) && Number.isFinite(lng)) out.push([lat, lng]);
      }
      if (out.length) return out;
    }
  }
  const latArr = toNumArray(body.latitude ?? body.latitudes);
  const lngArr = toNumArray(body.longitude ?? body.longitudes ?? body.lng);
  if (latArr.length > 1 && latArr.length === lngArr.length) {
    return latArr.map((lat, i) => [lat, lngArr[i]]);
  }
  return [];
}

/** Convert time column to elapsed seconds from workout start. */
export function toElapsedSeconds(time: number[]): number[] {
  if (time.length === 0) return [];
  const t0 = time[0];
  const last = time[time.length - 1];
  const looksMs = Math.abs(t0) > 10_000_000_000_000 || Math.abs(last) > 10_000_000_000_000;
  const secs = time.map((x) => (looksMs ? x / 1000 : x));
  const s0 = secs[0];
  const sLast = secs[secs.length - 1];
  const looksUnix = Math.abs(s0) > 1_000_000_000 && Math.abs(sLast) < 10_000_000_000;
  if (looksUnix || looksMs) {
    return secs.map((s) => Math.max(0, s - s0));
  }
  return secs.map((s) => Math.max(0, s - s0));
}

/** Distance samples -> relative meters from first point (handles km vs m heuristically). */
export function toRelativeDistanceMeters(dist: number[]): number[] {
  if (dist.length === 0) return [];
  const d0 = dist[0];
  const rel = dist.map((d) => Math.max(0, d - d0));
  const max = rel[rel.length - 1];
  if (max > 0 && max < 150) {
    return rel.map((r) => r * 1000);
  }
  return rel;
}

function derivePaceMinPerKm(timeSec: number[], distMeters: number[]): number[] {
  const n = Math.min(timeSec.length, distMeters.length);
  if (n < 2) return [];
  const pace: number[] = [0];
  for (let i = 1; i < n; i++) {
    const dd = (distMeters[i] - distMeters[i - 1]) / 1000;
    const dt = timeSec[i] - timeSec[i - 1];
    if (dd > 0.0005 && dt > 0 && dt < 600) {
      pace.push((dt / 60) / dd);
    } else {
      pace.push(pace[i - 1] ?? 0);
    }
  }
  return pace;
}

/** Parse Vital/Junction stream JSON (root object or { stream, data, samples }). */
export function normalizeVitalStreamPayload(raw: unknown): NormalizedWorkoutStream {
  let root = asRecord(raw);
  if (!root) {
    return { time: [], heartrate: [], cadence: [], altitude: [], distance: [], pace: [], latlng: [] };
  }
  const nested = asRecord(root.stream) ?? asRecord(root.data) ?? asRecord(root.result);
  if (nested && Object.keys(nested).length > 0) {
    root = { ...root, ...nested };
  }

  let time = pickSeries(root, ["time", "timestamp", "timestamps", "timer_duration_seconds", "clock_duration_seconds"]);
  const heartrate = pickSeries(root, ["heart_rate", "heartrate", "hr", "bpm"]);
  const cadence = pickSeries(root, ["cadence", "run_cadence", "rpm"]);
  const altitude = pickSeries(root, ["altitude", "elevation", "enhanced_altitude", "alt"]);
  let distance = pickSeries(root, ["distance", "total_distance", "cumulative_distance"]);
  const speed = pickSeries(root, ["speed", "velocity", "enhanced_speed"]);

  if (time.length === 0 && heartrate.length > 0) {
    time = heartrate.map((_, i) => i);
  }

  const elapsed = toElapsedSeconds(time);
  const distM = distance.length ? toRelativeDistanceMeters(distance) : [];

  let pace = pickSeries(root, ["pace"]);
  if (pace.length === 0 && speed.length > 0) {
    pace = speed.map((v) => (v > 0.1 ? 1000 / v / 60 : 0));
  } else if (pace.length === 0 && distM.length > 1 && elapsed.length > 1) {
    pace = derivePaceMinPerKm(elapsed, distM);
  }

  const latlng = pickLatLng(root);

  const lens = [
    elapsed.length,
    heartrate.length,
    cadence.length,
    altitude.length,
    distM.length,
    pace.length,
  ].filter((l) => l > 0);
  const trimLen = lens.length ? Math.min(...lens) : 0;

  const sliceN = (arr: number[]) => (trimLen > 0 ? arr.slice(0, trimLen) : []);

  return {
    time: sliceN(elapsed).map((t) => Math.round(t)),
    heartrate: sliceN(heartrate),
    cadence: sliceN(cadence),
    altitude: sliceN(altitude),
    distance: sliceN(distM),
    pace: sliceN(pace),
    latlng,
  };
}

export async function fetchVitalWorkoutStreamPayload(
  baseUrl: string,
  headers: Record<string, string>,
  workoutId: string,
): Promise<unknown | null> {
  const paths = [
    `/v2/timeseries/workouts/${encodeURIComponent(workoutId)}/stream`,
  ];
  for (const p of paths) {
    const res = await fetch(`${baseUrl}${p}`, { headers });
    if (res.ok) {
      try {
        return await res.json();
      } catch {
        return null;
      }
    }
  }
  return null;
}

function formatPace(secPerKm: number): string {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return "-";
  let min = Math.floor(secPerKm / 60);
  let s = Math.round(secPerKm % 60);
  if (s >= 60) {
    min += 1;
    s = 0;
  }
  return `${min}:${String(s).padStart(2, "0")}/km`;
}

/** KM splits from cumulative distance (m) and elapsed time (s). */
export function deriveKmSplitsFromDistanceTime(
  timeElapsedSec: number[],
  distMeters: number[],
  heartrate?: number[],
): Array<{ km: number; pace: string; elapsed_sec: number; hr?: number }> {
  const n = Math.min(timeElapsedSec.length, distMeters.length);
  if (n < 2) return [];
  const distRel = distMeters.map((d) => Math.max(0, d - distMeters[0]));
  const totalM = distRel[n - 1];
  const maxKm = Math.floor(totalM / 1000);
  if (maxKm < 1) return [];

  const splits: Array<{ km: number; pace: string; elapsed_sec: number; hr?: number }> = [];
  let prevTime = timeElapsedSec[0];
  let j = 0;

  for (let km = 1; km <= maxKm; km++) {
    const targetM = km * 1000;
    while (j < n && distRel[j] < targetM) j++;
    if (j >= n) break;
    const j0 = Math.max(0, j - 1);
    const j1 = j;
    const dLo = distRel[j0];
    const dHi = distRel[j1];
    const tLo = timeElapsedSec[j0];
    const tHi = timeElapsedSec[j1];
    let tAt = tHi;
    if (dHi > dLo) {
      tAt = tLo + ((targetM - dLo) / (dHi - dLo)) * (tHi - tLo);
    }
    const splitSec = Math.max(0, tAt - prevTime);
    prevTime = tAt;

    let hrAvg: number | undefined;
    if (heartrate && heartrate.length === n) {
      const hrs = heartrate.slice(j0, j1 + 1).filter((h) => h > 0);
      if (hrs.length) hrAvg = Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length);
    }

    const row: { km: number; pace: string; elapsed_sec: number; hr?: number } = {
      km,
      pace: formatPace(splitSec),
      elapsed_sec: Math.round(splitSec),
    };
    if (hrAvg != null) row.hr = hrAvg;
    splits.push(row);
  }

  return splits;
}
