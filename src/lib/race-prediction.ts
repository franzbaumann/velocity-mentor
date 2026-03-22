import type { ActivityRow } from "@/hooks/useActivities";
import { findBestForDistance, isRunningActivity, parsePaceToMinPerKm } from "@/lib/analytics";

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
  /** Human-readable summary of data sources used */
  basedOn?: string;
  /** Confidence: "high" | "medium" | "preliminary" */
  confidence?: "high" | "medium" | "preliminary";
  /** Full breakdown for transparency */
  metricsBreakdown?: {
    ctl: number | null;
    tsb: number | null;
    vol7dKm: number;
    vol28dKm: number;
    injuryApplied: boolean;
    rampRate: number | null;
    multipliers: {
      ctl: number;
      volume: number;
      injury: number;
      tsb: number;
      ramp: number;
      ctlTrend: number;
    };
  };
};

export type RacePredictionInput = {
  activities: ActivityRow[];
  targetDistanceKm: number;
  ctl: number | null;
  atl: number | null;
  tsb: number | null;
  rampRate: number | null;
  athleteProfile: {
    vdot: number | null;
    vo2max: number | null;
    lactateThresholdPace: string | null;
  } | null;
  /** Recent readiness rows for VO2max and CTL trend */
  readiness?: Array<{
    date: string;
    vo2max?: number | null;
    ctl?: number | null;
    icu_ctl?: number | null;
  }>;
  /** km in last 7 days (running only) */
  recentVolume7dKm?: number;
  /** km in last 28 days (running only) */
  recentVolume28dKm?: number;
  /** From athlete_profile; non-empty indicates injury/illness context */
  injuryHistoryText?: string | null;
};

/** Standard race distances in km */
const RACE_DISTANCES_KM = [5, 10, 21.0975, 42.195] as const;

/**
 * Jack Daniels VDOT to race time (seconds). Uses empirical fit from Daniels tables:
 * VDOT 50 → 5K ~18:00, 10K ~37:30, Half ~1:23, Marathon ~2:55.
 * Formula: 5K time ≈ 2400 - 24*VDOT, then Riegel extrapolation to other distances.
 */
function vdotToRaceTimeSeconds(vdot: number, distanceKm: number): number | null {
  if (vdot < 25 || vdot > 85) return null;
  const time5kSec = Math.max(600, 2400 - 24 * vdot);
  const riegel = 1.06;
  const timeSec = time5kSec * Math.pow(distanceKm / 5, riegel);
  if (timeSec < 60 || timeSec > 86400) return null;
  return timeSec;
}

/** Convert VO2max (ml/kg/min) to approximate VDOT. VDOT ≈ 0.8 * VO2max + 3.5 */
function vo2maxToVdot(vo2max: number): number {
  return 0.8 * vo2max + 3.5;
}

/** Days since date string (YYYY-MM-DD) */
function daysSince(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
}

/** Recency weight: 1.0 for < 30 days, decay to 0.5 at 6 months */
function recencyWeight(daysAgo: number): number {
  if (daysAgo <= 30) return 1.0;
  if (daysAgo >= 180) return 0.5;
  return 1.0 - (daysAgo - 30) * (0.5 / 150);
}

/** Distance proximity weight: closer PR distance = higher weight */
function distanceProximityWeight(prKm: number, targetKm: number): number {
  const ratio = Math.min(prKm, targetKm) / Math.max(prKm, targetKm);
  return 0.5 + 0.5 * ratio;
}

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
  goalDistanceKm: number,
  options?: {
    lactateThresholdPace?: string | null;
    recentRunsMedianPaceSecPerKm?: number | null;
  }
): { zone2: string; threshold: string; vo2max: string } {
  const racePaceSecPerKm = goalTimeSeconds / goalDistanceKm;

  if (options?.lactateThresholdPace) {
    const ltMinPerKm = parsePaceToMinPerKm(options.lactateThresholdPace);
    if (ltMinPerKm != null && ltMinPerKm >= 2 && ltMinPerKm <= 15) {
      const thresholdSecPerKm = ltMinPerKm * 60;
      return {
        zone2: formatPaceFromSecondsPerKm(thresholdSecPerKm * 1.18),
        threshold: formatPaceFromSecondsPerKm(thresholdSecPerKm),
        vo2max: formatPaceFromSecondsPerKm(thresholdSecPerKm * 0.92),
      };
    }
  }

  if (options?.recentRunsMedianPaceSecPerKm != null && options.recentRunsMedianPaceSecPerKm >= 240 && options.recentRunsMedianPaceSecPerKm <= 600) {
    const easySecPerKm = options.recentRunsMedianPaceSecPerKm;
    const thresholdSecPerKm = easySecPerKm / 1.15;
    return {
      zone2: formatPaceFromSecondsPerKm(easySecPerKm),
      threshold: formatPaceFromSecondsPerKm(thresholdSecPerKm),
      vo2max: formatPaceFromSecondsPerKm(thresholdSecPerKm * 0.92),
    };
  }

  return {
    zone2: formatPaceFromSecondsPerKm(racePaceSecPerKm * 1.25),
    threshold: formatPaceFromSecondsPerKm(racePaceSecPerKm * 1.05),
    vo2max: formatPaceFromSecondsPerKm(racePaceSecPerKm * 0.90),
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

/** Build ensemble prediction from distance-specific PRs with recency and proximity weighting */
function ensembleFromPRs(
  activities: ActivityRow[],
  targetKm: number,
  ctl: number,
  baselineCTL: number
): { timeSec: number; sources: string[]; primaryDaysAgo: number } | null {
  const predictions: { timeSec: number; weight: number; source: string; daysAgo: number }[] = [];

  for (const distKm of RACE_DISTANCES_KM) {
    const pr = findBestForDistance(activities, distKm);
    if (!pr) continue;

    const daysAgo = daysSince(pr.date);
    const recency = recencyWeight(daysAgo);
    const proximity = distanceProximityWeight(distKm, targetKm);
    const weight = recency * proximity;

    const pred = predictRaceTime(pr.timeSec, distKm, targetKm, ctl, baselineCTL);
    const distLabel = distKm <= 5 ? "5K" : distKm <= 10 ? "10K" : distKm <= 22 ? "Half" : "Marathon";
    const monthsAgo = Math.round(daysAgo / 30);
    predictions.push({
      timeSec: pred,
      weight,
      source: `${distLabel} PR${monthsAgo > 0 ? ` (${monthsAgo}mo ago)` : ""}`,
      daysAgo,
    });
  }

  if (predictions.length === 0) return null;

  const totalWeight = predictions.reduce((s, p) => s + p.weight, 0);
  const weightedTime = predictions.reduce((s, p) => s + p.timeSec * p.weight, 0) / totalWeight;
  const sources = predictions.map((p) => p.source).filter(Boolean);
  const primaryIdx = predictions.reduce((best, p, i) =>
    p.weight > predictions[best].weight ? i : best
  , 0);
  const primaryDaysAgo = predictions[primaryIdx].daysAgo;

  return { timeSec: weightedTime, sources, primaryDaysAgo };
}

/** Apply recency decay: -2% per month for efforts > 6 months old */
function applyRecencyDecay(timeSec: number, daysAgo: number): number {
  if (daysAgo <= 120) return timeSec;
  const monthsOver = (daysAgo - 120) / 30;
  const decay = 1 - monthsOver * 0.02;
  return timeSec * Math.max(0.7, decay);
}

/** TSB adjustment: ±3% max. TSB < -15 fatigued, TSB > +10 fresh */
function tsbMultiplier(tsb: number | null): number {
  if (tsb == null) return 1.0;
  if (tsb < -15) return Math.max(0.97, 1 + (tsb + 15) * 0.002);
  if (tsb > 10) return Math.min(1.03, 1 + (tsb - 10) * 0.002);
  return 1.0;
}

/** Ramp rate adjustment: very high ramp may indicate fatigue */
function rampMultiplier(rampRate: number | null): number {
  if (rampRate == null) return 1.0;
  if (rampRate > 5) return 0.98; // slight reduction
  return 1.0;
}

/** CTL trend: rising = slight uplift, falling = slight reduction */
function ctlTrendMultiplier(
  ctl: number | null,
  readiness: RacePredictionInput["readiness"]
): number {
  if (!ctl || !readiness || readiness.length < 7) return 1.0;
  const recent = readiness.slice(-14).filter((r) => (r.icu_ctl ?? r.ctl) != null);
  if (recent.length < 2) return 1.0;
  const first = recent[0].icu_ctl ?? recent[0].ctl ?? 0;
  const last = recent[recent.length - 1].icu_ctl ?? recent[recent.length - 1].ctl ?? 0;
  const trend = last - first;
  if (trend > 5) return 1.02; // rising fitness
  if (trend < -5) return 0.98; // declining
  return 1.0;
}

/** Strong CTL fitness multiplier: low CTL = significant slowdown. Marathon most sensitive. */
function ctlFitnessMultiplier(ctl: number | null, targetDistanceKm: number, useLighterPenalty = false): number {
  if (ctl == null || ctl >= 50) return 1.0;
  const targetCtl = targetDistanceKm >= 40 ? 50 : targetDistanceKm >= 20 ? 45 : targetDistanceKm >= 10 ? 40 : 35;
  const deficit = targetCtl - ctl;
  if (deficit <= 0) return 1.0;
  let perPoint = targetDistanceKm >= 40 ? 0.012 : targetDistanceKm >= 20 ? 0.01 : 0.008;
  if (useLighterPenalty) perPoint *= 0.5;
  return Math.min(1.35, 1 + deficit * perPoint);
}

/** Volume penalty: low recent mileage = slower race prediction. */
function volumeMultiplier(
  vol7d: number | undefined,
  vol28d: number | undefined,
  targetDistanceKm: number,
  useLighterPenalty = false
): number {
  const v7 = vol7d ?? 0;
  const v28 = vol28d ?? 0;
  const scale = useLighterPenalty ? 0.5 : 1;
  if (targetDistanceKm >= 40) {
    if (v28 >= 80) return 1.0;
    const penalty28 = v28 < 40 ? (40 - v28) / 40 * 0.10 * scale : 0;
    const penalty7 = v28 < 60 && v7 < 10 ? (10 - v7) / 10 * 0.05 * scale : 0;
    return Math.min(1.25, 1 + penalty28 + penalty7);
  }
  if (targetDistanceKm >= 20) {
    if (v28 >= 50) return 1.0;
    return Math.min(1.15, 1 + (50 - Math.max(v28, 0)) / 50 * 0.08 * scale);
  }
  if (targetDistanceKm >= 10) {
    if (v28 >= 30) return 1.0;
    return Math.min(1.10, 1 + (30 - Math.max(v28, 0)) / 30 * 0.05 * scale);
  }
  return 1.0;
}

/** Injury/illness penalty: conservative adjustment when history present. */
function injuryMultiplier(injuryHistoryText: string | null | undefined): number {
  if (!injuryHistoryText || typeof injuryHistoryText !== "string") return 1.0;
  const t = injuryHistoryText.trim().toLowerCase();
  if (!t || t === "none" || t === "no" || t === "n/a") return 1.0;
  return 1.05;
}

/**
 * Map CTL to approximate marathon time (seconds). Calibrated from research:
 * CTL 60 → ~2:50, CTL 50 → ~3:05, CTL 40 → ~3:25, CTL 30 → ~3:55, CTL 20 → ~4:30
 */
function ctlToMarathonTime(ctl: number): number {
  if (ctl >= 60) return 10200; // ~2:50
  if (ctl >= 50) return 11100; // ~3:05
  if (ctl >= 40) return 12300; // ~3:25
  if (ctl >= 30) return 14100; // ~3:55
  if (ctl >= 20) return 16200; // ~4:30
  return 18000; // ~5:00 for very low CTL
}

/** Extrapolate CTL-derived marathon time to other distances via Riegel */
function ctlToRaceTime(ctl: number, targetDistanceKm: number): number {
  const marathonSec = ctlToMarathonTime(ctl);
  const riegel = 1.06;
  return marathonSec * Math.pow(targetDistanceKm / 42.195, riegel);
}

/**
 * Predict from recent run paces (last 28 days). Uses trimmed mean (drop slowest 20%)
 * to reduce impact of one bad run. Easy pace is typically 1.15-1.25x marathon pace.
 * Returns null if fewer than 2 runs.
 */
function recentRunsMarathonPrediction(
  activities: ActivityRow[],
  targetDistanceKm: number
): { timeSec: number; paceSecPerKm: number; source: string } | null {
  const recent = activities.filter((a) => {
    if (!isRunningActivity(a.type)) return false;
    const dist = a.distance_km ?? 0;
    const dur = a.duration_seconds ?? 0;
    if (dist < 3 || !dur) return false;
    return daysSince(a.date) <= 28;
  });

  if (recent.length < 2) return null;

  const pacesSecPerKm = recent
    .map((a) => (a.duration_seconds ?? 0) / (a.distance_km ?? 1))
    .filter((p) => p >= 180 && p <= 900);

  if (pacesSecPerKm.length < 2) return null;

  const sorted = [...pacesSecPerKm].sort((a, b) => a - b);
  const dropCount = Math.floor(sorted.length * 0.2);
  const trimmed = dropCount > 0 ? sorted.slice(0, -dropCount) : sorted;
  const paceSecPerKm = trimmed.reduce((s, p) => s + p, 0) / trimmed.length;

  const easyToRaceRatio = targetDistanceKm >= 40 ? 1.2 : targetDistanceKm >= 20 ? 1.15 : targetDistanceKm >= 10 ? 1.1 : 1.08;
  const racePaceSecPerKm = paceSecPerKm / easyToRaceRatio;
  const timeSec = racePaceSecPerKm * targetDistanceKm;

  if (timeSec < 600 || timeSec > 86400) return null;

  const paceStr = formatPaceFromSecondsPerKm(paceSecPerKm);
  return { timeSec, paceSecPerKm: racePaceSecPerKm, source: `recent runs (${paceStr})` };
}

/**
 * Predict race time using multi-source ensemble: distance-specific PRs,
 * VDOT/VO2max, CTL/TSB, recency. Falls back to legacy predictRaceTime when sparse.
 */
export function predictRaceTimeV2(input: RacePredictionInput): RacePrediction | null {
  const {
    activities,
    targetDistanceKm,
    ctl,
    atl,
    tsb,
    rampRate,
    athleteProfile,
    readiness,
    recentVolume7dKm,
    recentVolume28dKm,
    injuryHistoryText,
  } = input;

  const baselineCTL = ctl != null ? Math.max(ctl * 0.7, 20) : 20;
  const effectiveCtl = ctl ?? 40;
  const isDetrained = (ctl != null && ctl < 35) || (recentVolume28dKm != null && recentVolume28dKm < 30);

  const sources: string[] = [];
  let baseTimeSec: number | null = null;
  let confidence: "high" | "medium" | "preliminary" = "preliminary";
  let recentRunsPrediction: { timeSec: number; source: string } | null = null;
  let hasRecentAnchor = false;
  const vol28d = recentVolume28dKm ?? 0;
  const recentCount = activities.filter((a) => isRunningActivity(a.type) && daysSince(a.date) <= 28 && (a.distance_km ?? 0) >= 3).length;
  const lowVolume = vol28d < 15;

  // 0. Recent runs pace (primary when 5+ runs in 28d and vol28d >= 15 km)
  const recentRuns = recentRunsMarathonPrediction(activities, targetDistanceKm);
  if (recentRuns) {
    recentRunsPrediction = { timeSec: recentRuns.timeSec, source: recentRuns.source };
    if (recentCount >= 5 && !lowVolume) {
      baseTimeSec = recentRuns.timeSec;
      sources.push(recentRuns.source);
      confidence = "medium";
      hasRecentAnchor = true;
    } else if (recentCount >= 2 && lowVolume) {
      sources.push(recentRuns.source);
    }
  }

  // 0b. CTL-derived prediction when recent runs sparse (< 5) or low volume (< 15 km/28d)
  if (ctl != null && ctl >= 15 && (baseTimeSec == null || (!hasRecentAnchor && recentCount < 5) || lowVolume)) {
    const ctlTime = ctlToRaceTime(ctl, targetDistanceKm);
    if (baseTimeSec == null) {
      baseTimeSec = ctlTime;
      sources.push(`CTL ${Math.round(ctl)}`);
      confidence = "medium";
    } else {
      const ctlWeight = hasRecentAnchor ? 0.2 : lowVolume ? 0.5 : 0.5;
      baseTimeSec = baseTimeSec * (1 - ctlWeight) + ctlTime * ctlWeight;
      if (!sources.some((s) => s.startsWith("CTL"))) sources.push(`CTL ${Math.round(ctl)}`);
    }
  }

  // 1. VDOT from profile (de-prioritize when detrained or when recent runs anchor)
  const vdot = athleteProfile?.vdot ?? null;
  if (vdot != null && vdot >= 30 && vdot <= 80) {
    const vdotTime = vdotToRaceTimeSeconds(vdot, targetDistanceKm);
    if (vdotTime != null) {
      const vdotWeight = hasRecentAnchor ? 0.15 : isDetrained ? 0.2 : 0.5;
      baseTimeSec = baseTimeSec == null ? vdotTime : baseTimeSec * (1 - vdotWeight) + vdotTime * vdotWeight;
      if (!hasRecentAnchor) sources.push(`VDOT ${Math.round(vdot)}`);
      if (confidence === "preliminary") confidence = "medium";
    }
  }

  // 2. VO2max from profile or readiness (de-prioritize when detrained or recent anchor)
  let effectiveVdot = vdot;
  if (effectiveVdot == null && athleteProfile?.vo2max != null) {
    effectiveVdot = vo2maxToVdot(athleteProfile.vo2max);
    const vdotTime = vdotToRaceTimeSeconds(effectiveVdot, targetDistanceKm);
    if (vdotTime != null) {
      const vo2Weight = hasRecentAnchor ? 0.15 : isDetrained ? 0.2 : 0.5;
      baseTimeSec = baseTimeSec == null ? vdotTime : baseTimeSec * (1 - vo2Weight) + vdotTime * vo2Weight;
      if (!hasRecentAnchor) sources.push("VO2max");
      if (confidence === "preliminary") confidence = "medium";
    }
  }
  if (effectiveVdot == null && readiness?.length) {
    const latestVo2 = readiness
      .slice()
      .reverse()
      .find((r) => r.vo2max != null);
    if (latestVo2?.vo2max != null) {
      effectiveVdot = vo2maxToVdot(latestVo2.vo2max);
      const vdotTime = vdotToRaceTimeSeconds(effectiveVdot, targetDistanceKm);
      if (vdotTime != null) {
        const vo2Weight = hasRecentAnchor ? 0.15 : isDetrained ? 0.2 : 0.5;
        baseTimeSec = baseTimeSec == null ? vdotTime : baseTimeSec * (1 - vo2Weight) + vdotTime * vo2Weight;
        if (!hasRecentAnchor) sources.push("VO2max");
        if (confidence === "preliminary") confidence = "medium";
      }
    }
  }

  // 3. Ensemble from distance-specific PRs
  const ensemble = ensembleFromPRs(activities, targetDistanceKm, effectiveCtl, baselineCTL);
  if (ensemble) {
    const { timeSec, sources: prSources, primaryDaysAgo } = ensemble;
    const decayed = applyRecencyDecay(timeSec, primaryDaysAgo);
    const prWeight = hasRecentAnchor ? 0.30 : isDetrained ? 0.8 : 0.6;
    baseTimeSec = baseTimeSec == null ? decayed : baseTimeSec * (1 - prWeight) + decayed * prWeight;
    sources.push(...prSources);
    if (prSources.length >= 2) confidence = "high";
    else if (confidence === "preliminary") confidence = "medium";
  }

  // 4. Fallback: legacy findBestEffort + Riegel
  if (baseTimeSec == null) {
    const best = findBestEffort(activities);
    if (!best || !ctl) return null;
    baseTimeSec = predictRaceTime(
      best.timeSeconds,
      best.distanceKm,
      targetDistanceKm,
      effectiveCtl,
      baselineCTL
    );
    sources.push(`best effort (${best.distanceKm.toFixed(1)} km)`);
  }

  // 5. Low volume: when vol28d < 15 km, blend in recent runs at max 20% if we have them
  if (lowVolume && recentRunsPrediction && baseTimeSec != null) {
    baseTimeSec = baseTimeSec * 0.8 + recentRunsPrediction.timeSec * 0.2;
  }

  // Apply form adjustments (lighter when recent runs anchor — already reflects current fitness)
  const useLighterPenalty = hasRecentAnchor;
  const multCtl = ctlFitnessMultiplier(ctl, targetDistanceKm, useLighterPenalty);
  const multVolume = volumeMultiplier(recentVolume7dKm, recentVolume28dKm, targetDistanceKm, useLighterPenalty);
  const multInjury = injuryMultiplier(injuryHistoryText);
  const multTsb = tsbMultiplier(tsb);
  const multRamp = rampMultiplier(rampRate);
  const multCtlTrend = ctlTrendMultiplier(ctl, readiness);

  let finalTime = baseTimeSec;
  finalTime *= multCtl;
  finalTime *= multVolume;
  finalTime *= multInjury;
  finalTime *= multTsb;
  finalTime *= multRamp;
  finalTime *= multCtlTrend;

  // Floor: when recent runs exist, don't let PRs pull prediction faster than recent pace suggests
  if (recentRunsPrediction && finalTime < recentRunsPrediction.timeSec * 0.92) {
    finalTime = recentRunsPrediction.timeSec * 0.92;
  }

  // Append context to basedOn when CTL low or volume low
  const contextParts: string[] = [];
  if (ctl != null && ctl < 40) contextParts.push(`CTL ${Math.round(ctl)}`);
  if (recentVolume28dKm != null && recentVolume28dKm < 50) contextParts.push("low volume");
  if (contextParts.length > 0) sources.push(contextParts.join(", "));

  const recentMedianPace = recentRuns
    ? (() => {
        const paces = activities
          .filter((a) => isRunningActivity(a.type) && daysSince(a.date) <= 28 && (a.distance_km ?? 0) >= 3 && (a.duration_seconds ?? 0) > 0)
          .map((a) => (a.duration_seconds ?? 0) / (a.distance_km ?? 1))
          .filter((p) => p >= 180 && p <= 900);
        if (paces.length < 2) return null;
        const sorted = [...paces].sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)];
      })()
    : null;

  const paces = calculateZonePaces(finalTime, targetDistanceKm, {
    lactateThresholdPace: athleteProfile?.lactateThresholdPace ?? null,
    recentRunsMedianPaceSecPerKm: recentMedianPace,
  });
  const distLabel =
    targetDistanceKm <= 5
      ? "5K"
      : targetDistanceKm <= 10
        ? "10K"
        : targetDistanceKm <= 22
          ? "Half Marathon"
          : "Marathon";

  const injuryApplied = multInjury !== 1.0;

  return {
    goalDistance: distLabel,
    predictedTimeSeconds: Math.round(finalTime),
    predictedPace: formatPaceFromSecondsPerKm(finalTime / targetDistanceKm),
    upliftSeconds: 0,
    ctlAtPrediction: effectiveCtl,
    zone2Pace: paces.zone2,
    thresholdPace: paces.threshold,
    vo2maxPace: paces.vo2max,
    predictedAt: new Date().toISOString(),
    basedOn: sources.length ? sources.slice(0, 4).join(", ") : undefined,
    confidence,
    metricsBreakdown: {
      ctl,
      tsb,
      vol7dKm: recentVolume7dKm ?? 0,
      vol28dKm: recentVolume28dKm ?? 0,
      injuryApplied,
      rampRate,
      multipliers: {
        ctl: multCtl,
        volume: multVolume,
        injury: multInjury,
        tsb: multTsb,
        ramp: multRamp,
        ctlTrend: multCtlTrend,
      },
    },
  };
}
