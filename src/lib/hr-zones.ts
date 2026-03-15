/**
 * Athlete-specific HR zone logic from max_hr (and optionally resting_hr).
 * Used for dashboard HR bar and activity detail so zones are consistent and "real" for the athlete.
 */

/** 5-zone model: % of max HR. Z1 < 60%, Z2 60-70%, Z3 70-80%, Z4 80-90%, Z5 >= 90%. */
const ZONE_PCT_MAX: [number, number][] = [
  [0, 0.6],   // Z1
  [0.6, 0.7], // Z2
  [0.7, 0.8], // Z3
  [0.8, 0.9], // Z4
  [0.9, 1.0], // Z5
];

export type ZoneBounds = {
  z1: [number, number];
  z2: [number, number];
  z3: [number, number];
  z4: [number, number];
  z5: [number, number];
};

export type HrZonePct = { z1: number; z2: number; z3: number; z4: number; z5: number };

/**
 * Returns min/max BPM per zone (1-5) using % of max HR.
 * If restingHr is provided, uses Karvonen (HR reserve) for slightly more accurate zones.
 */
export function getZoneBounds(
  maxHr: number,
  restingHr?: number | null
): ZoneBounds {
  if (maxHr <= 0) {
    return {
      z1: [0, 0],
      z2: [0, 0],
      z3: [0, 0],
      z4: [0, 0],
      z5: [0, 0],
    };
  }
  const reserve = restingHr != null && restingHr < maxHr ? maxHr - restingHr : maxHr;
  const toBpm = (pct: number) =>
    restingHr != null && restingHr < maxHr
      ? Math.round(restingHr + reserve * pct)
      : Math.round(maxHr * pct);

  return {
    z1: [toBpm(0), toBpm(0.6)],
    z2: [toBpm(0.6), toBpm(0.7)],
    z3: [toBpm(0.7), toBpm(0.8)],
    z4: [toBpm(0.8), toBpm(0.9)],
    z5: [toBpm(0.9), maxHr],
  };
}

/**
 * Returns which zone (1-5) a BPM falls into using athlete's max_hr (and optional resting_hr).
 */
export function getZoneFromBpm(
  bpm: number,
  maxHr: number,
  restingHr?: number | null
): 1 | 2 | 3 | 4 | 5 {
  if (maxHr <= 0 || bpm <= 0) return 1;
  const pct =
    restingHr != null && restingHr < maxHr
      ? (bpm - restingHr) / (maxHr - restingHr)
      : bpm / maxHr;
  if (pct < 0.6) return 1;
  if (pct < 0.7) return 2;
  if (pct < 0.8) return 3;
  if (pct < 0.9) return 4;
  return 5;
}

/**
 * Compute time (seconds) in each zone from HR stream using athlete's zone boundaries.
 * Returns 6 elements: [Z1, Z2, Z3, Z4, Z5, Z5+] in seconds. Z5+ is 0 unless HR exceeds max.
 */
export function computeHrZoneTimesFromStream(
  points: { t: number; hr: number }[],
  maxHr: number,
  restingHr?: number | null
): number[] {
  const times: number[] = [0, 0, 0, 0, 0, 0]; // Z1..Z5, Z5+
  if (points.length === 0 || maxHr <= 0) return times;

  for (let i = 0; i < points.length; i++) {
    const hr = points[i].hr;
    if (hr <= 0) continue;
    const nextT = i < points.length - 1 ? points[i + 1].t : points[i].t;
    const prevT = points[i].t;
    const dt = Math.max(0, nextT - prevT);
    const z = hr > maxHr ? 6 : getZoneFromBpm(hr, maxHr, restingHr); // Z5+ = index 5
    times[z - 1] += dt;
  }
  return times;
}

/**
 * When we have no hr_zone_times, estimate distribution from avg HR: 100% in the zone containing avgHr.
 */
export function estimateHrZoneDistributionFromAvgHr(
  avgHr: number,
  maxHr: number,
  restingHr?: number | null
): HrZonePct {
  const z = getZoneFromBpm(avgHr, maxHr, restingHr);
  return {
    z1: z === 1 ? 100 : 0,
    z2: z === 2 ? 100 : 0,
    z3: z === 3 ? 100 : 0,
    z4: z === 4 ? 100 : 0,
    z5: z === 5 ? 100 : 0,
  };
}
