export type RacePrediction = {
  goalDistance: string;
  predictedTimeSeconds: number;
  predictedPace: string;
  upliftSeconds: number;
  ctlAtPrediction: number;
  zone2Pace: string;
  thresholdPace: string;
  vo2maxPace: string;
  predictedAt: string;
};

export function predictRaceTime(
  bestTimeSeconds: number,
  bestDistanceKm: number,
  targetDistanceKm: number,
  ctl: number,
  baselineCTL: number,
): number {
  const riegelFactor = 1.06;
  const basePrediction =
    bestTimeSeconds * Math.pow(targetDistanceKm / bestDistanceKm, riegelFactor);

  let ctlMultiplier = 1 - ((ctl - baselineCTL) / baselineCTL) * 0.15;
  ctlMultiplier = Math.max(0.85, Math.min(1.15, ctlMultiplier));

  return basePrediction * ctlMultiplier;
}

const MIN_PACE_SEC_KM = 120; // 2 min/km
const MAX_PACE_SEC_KM = 1500; // 25 min/km

export function formatRaceTime(seconds: number): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "--:--";
  const totalSeconds = Math.round(seconds);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatPace(seconds: number, distanceKm: number): string {
  const paceSeconds = Math.round(seconds / distanceKm);
  const m = Math.floor(paceSeconds / 60);
  const s = paceSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

function formatPaceFromSecondsPerKm(secPerKm: number): string {
  if (secPerKm == null || !Number.isFinite(secPerKm) || secPerKm <= 0) return "--";
  const rounded = Math.round(secPerKm);
  const m = Math.floor(rounded / 60);
  const s = rounded % 60;
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

export function calculateZonePaces(
  goalTimeSeconds: number,
  goalDistanceKm: number,
): { zone2: string; threshold: string; vo2max: string } {
  if (
    goalTimeSeconds == null ||
    !Number.isFinite(goalTimeSeconds) ||
    goalTimeSeconds <= 0 ||
    goalDistanceKm == null ||
    !Number.isFinite(goalDistanceKm) ||
    goalDistanceKm <= 0
  ) {
    return { zone2: "--", threshold: "--", vo2max: "--" };
  }
  const vdotPace = goalTimeSeconds / goalDistanceKm;
  return {
    zone2: formatPaceFromSecondsPerKm(vdotPace * 1.25),
    threshold: formatPaceFromSecondsPerKm(vdotPace * 1.05),
    vo2max: formatPaceFromSecondsPerKm(vdotPace * 0.9),
  };
}

export function findBestEffort(
  activities: Array<{
    distance_km: number | null;
    duration_seconds: number | null;
    date: string;
  }>,
): { distanceKm: number; timeSeconds: number; date: string } | null {
  let best: { distanceKm: number; timeSeconds: number; date: string } | null =
    null;
  let bestPace = Infinity;

  for (const a of activities) {
    if (a.distance_km == null || a.duration_seconds == null) continue;
    if (a.distance_km < 3) continue;
    const pace = a.duration_seconds / a.distance_km;
    // Reject impossible paces (e.g. duration in minutes or wrong units)
    if (pace < MIN_PACE_SEC_KM || pace > MAX_PACE_SEC_KM) continue;
    if (pace < bestPace) {
      bestPace = pace;
      best = {
        distanceKm: a.distance_km,
        timeSeconds: a.duration_seconds,
        date: a.date,
      };
    }
  }

  return best;
}
