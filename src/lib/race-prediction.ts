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
  baselineCTL: number
): number {
  const riegelFactor = 1.06;
  const basePrediction =
    bestTimeSeconds *
    Math.pow(targetDistanceKm / bestDistanceKm, riegelFactor);

  let ctlMultiplier =
    1 - ((ctl - baselineCTL) / baselineCTL) * 0.15;
  ctlMultiplier = Math.max(0.85, Math.min(1.15, ctlMultiplier));

  return basePrediction * ctlMultiplier;
}

export function formatRaceTime(seconds: number): string {
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
  const rounded = Math.round(secPerKm);
  const m = Math.floor(rounded / 60);
  const s = rounded % 60;
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

export function calculateZonePaces(
  goalTimeSeconds: number,
  goalDistanceKm: number
): { zone2: string; threshold: string; vo2max: string } {
  const vdotPace = goalTimeSeconds / goalDistanceKm;

  return {
    zone2: formatPaceFromSecondsPerKm(vdotPace * 1.25),
    threshold: formatPaceFromSecondsPerKm(vdotPace * 1.05),
    vo2max: formatPaceFromSecondsPerKm(vdotPace * 0.90),
  };
}

export function findBestEffort(
  activities: Array<{
    distance_km: number | null;
    duration_seconds: number | null;
    date: string;
  }>
): { distanceKm: number; timeSeconds: number; date: string } | null {
  let best: { distanceKm: number; timeSeconds: number; date: string } | null =
    null;
  let bestPace = Infinity;

  for (const a of activities) {
    if (a.distance_km == null || a.duration_seconds == null) continue;
    if (a.distance_km < 3) continue;

    const pace = a.duration_seconds / a.distance_km;
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
