/**
 * Shared stream-derived metrics (matches intervals-proxy sync_streams helpers).
 * HR zone times use the same %max (+ optional Karvonen) model as src/lib/hr-zones.ts.
 */

export function avg(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = avg(arr);
  const sq = arr.reduce((s, v) => s + (v - m) ** 2, 0);
  return Math.sqrt(sq / (arr.length - 1));
}

export function getHRZoneForStream(heartrate: number, lthr: number | null, _maxHr: number | null): number {
  if (!lthr || lthr <= 0) return 0;
  const zones = [0.6, 0.7, 0.8, 0.9, 1.0].map((pct) => lthr * pct);
  for (let z = 0; z < zones.length; z++) {
    if (heartrate <= zones[z]) return z + 1;
  }
  return 5;
}

/** Per-sample zone index (1–5) for activity_streams.hr_zones; 0 if LTHR unknown. */
export function buildHrZonesSeries(heartrate: number[], lthr: number | null, maxHr: number | null): number[] {
  if (!heartrate.length) return [];
  return heartrate.map((h) => (h > 0 ? getHRZoneForStream(h, lthr, maxHr) : 0));
}

export function computeCardiacDrift(heartrate: number[]): number | null {
  if (heartrate.length < 60) return null;
  const q = Math.floor(heartrate.length * 0.25);
  const firstQ = heartrate.slice(0, q).filter((h) => h > 0);
  const lastQ = heartrate.slice(heartrate.length - q).filter((h) => h > 0);
  if (firstQ.length < 10 || lastQ.length < 10) return null;
  const firstAvg = avg(firstQ);
  const lastAvg = avg(lastQ);
  if (firstAvg <= 0) return null;
  return ((lastAvg - firstAvg) / firstAvg) * 100;
}

export function computePaceEfficiency(avgPaceMinPerKm: number, avgHr: number): number | null {
  if (avgPaceMinPerKm <= 0 || avgHr <= 0) return null;
  return avgPaceMinPerKm / avgHr;
}

export function computeCadenceConsistency(cadence: number[]): number | null {
  const valid = cadence.filter((c) => c > 0);
  if (valid.length < 30) return null;
  return Math.round(stdDev(valid) * 100) / 100;
}

/**
 * Time in each HR zone (6 buckets: Z1..Z5, Z5+) in seconds — aligned with
 * src/lib/hr-zones.ts computeHrZoneTimesFromStream.
 */
export function computeHrZoneTimesFromSamples(
  heartrate: number[],
  timeElapsedSec: number[],
  maxHr: number,
  restingHr: number | null,
): number[] {
  const times = [0, 0, 0, 0, 0, 0];
  if (heartrate.length === 0 || maxHr <= 0) return times;

  const getZoneFromBpm = (bpm: number): number => {
    if (bpm <= 0) return 1;
    const pct =
      restingHr != null && restingHr < maxHr
        ? (bpm - restingHr) / (maxHr - restingHr)
        : bpm / maxHr;
    if (pct < 0.6) return 1;
    if (pct < 0.7) return 2;
    if (pct < 0.8) return 3;
    if (pct < 0.9) return 4;
    return 5;
  };

  const n = Math.min(heartrate.length, timeElapsedSec.length);
  for (let i = 0; i < n; i++) {
    const hr = heartrate[i];
    if (hr <= 0) continue;
    const nextT = i < n - 1 ? timeElapsedSec[i + 1] : timeElapsedSec[i];
    const prevT = timeElapsedSec[i];
    const dt = Math.max(0, nextT - prevT);
    if (dt <= 0 || dt > 120) continue;

    const z = hr > maxHr ? 6 : getZoneFromBpm(hr);
    times[z - 1] += dt;
  }
  return times.map((s) => Math.round(s));
}
