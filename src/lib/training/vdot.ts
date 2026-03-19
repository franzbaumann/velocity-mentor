/**
 * VDOT Calculator — Jack Daniels' formula and training pace derivation.
 * Pure TypeScript, no dependencies, no API calls. Source of truth for pace calculations in Cade.
 */

// ─── Part 1: VDOT from race result ─────────────────────────────────────────

/**
 * Jack Daniels' VDOT formula (Daniels & Gilbert 1979).
 * Calculates VDOT from a race distance and time.
 */
export function calculateVDOT(distanceMeters: number, timeSeconds: number): number {
  if (distanceMeters <= 0 || timeSeconds <= 0) return 30;
  const velocity = distanceMeters / timeSeconds; // m/s
  const v60 = velocity * 60; // m/min
  const VO2 = -4.6 + 0.182258 * v60 + 0.000104 * v60 * v60;
  const tMin = timeSeconds / 60;
  const percentMax =
    0.8 +
    0.1894393 * Math.exp(-0.012778 * tMin) +
    0.2989558 * Math.exp(-0.1932605 * tMin);
  const vdot = VO2 / percentMax;
  const rounded = Math.round(vdot * 10) / 10;
  return Math.max(30, Math.min(85, rounded));
}

// ─── Part 2: VDOT from field tests ─────────────────────────────────────────

/** Cooper test: 12-minute run. Distance in meters. */
export function vdotFromCooper(distanceMeters: number): number {
  const vo2max = (distanceMeters - 504.9) / 44.73;
  const vdot = Math.round(vo2max * 10) / 10;
  return Math.max(30, Math.min(85, vdot));
}

/** 2400m time trial. Time in seconds. */
export function vdotFrom2400m(timeSeconds: number): number {
  return calculateVDOT(2400, timeSeconds);
}

// ─── Part 3: Training paces from VDOT ───────────────────────────────────────

export interface TrainingPaces {
  easy: { min: number; max: number };
  marathon: number;
  threshold: number;
  interval: number;
  repetition: number;
  easyHR: { min: number; max: number };
  tempoHR: { min: number; max: number };
}

const VDOT_TABLE: Record<
  number,
  {
    easyMin: number;
    easyMax: number;
    marathon: number;
    threshold: number;
    interval: number;
    repetition: number;
  }
> = {
  30: { easyMin: 480, easyMax: 534, marathon: 444, threshold: 408, interval: 378, repetition: 360 },
  32: { easyMin: 462, easyMax: 516, marathon: 426, threshold: 390, interval: 363, repetition: 342 },
  34: { easyMin: 444, easyMax: 498, marathon: 408, threshold: 375, interval: 348, repetition: 327 },
  36: { easyMin: 429, easyMax: 480, marathon: 393, threshold: 360, interval: 336, repetition: 315 },
  38: { easyMin: 414, easyMax: 462, marathon: 378, threshold: 348, interval: 324, repetition: 303 },
  40: { easyMin: 399, easyMax: 450, marathon: 366, threshold: 336, interval: 312, repetition: 292 },
  42: { easyMin: 387, easyMax: 435, marathon: 354, threshold: 324, interval: 301, repetition: 282 },
  44: { easyMin: 375, easyMax: 420, marathon: 342, threshold: 315, interval: 291, repetition: 273 },
  46: { easyMin: 363, easyMax: 408, marathon: 330, threshold: 304, interval: 282, repetition: 264 },
  48: { easyMin: 354, easyMax: 396, marathon: 321, threshold: 295, interval: 273, repetition: 255 },
  50: { easyMin: 342, easyMax: 384, marathon: 311, threshold: 286, interval: 264, repetition: 246 },
  52: { easyMin: 333, easyMax: 375, marathon: 302, threshold: 278, interval: 256, repetition: 239 },
  54: { easyMin: 324, easyMax: 363, marathon: 294, threshold: 270, interval: 249, repetition: 232 },
  56: { easyMin: 315, easyMax: 354, marathon: 286, threshold: 263, interval: 243, repetition: 226 },
  58: { easyMin: 307, easyMax: 345, marathon: 279, threshold: 256, interval: 237, repetition: 220 },
  60: { easyMin: 300, easyMax: 336, marathon: 272, threshold: 250, interval: 231, repetition: 214 },
  62: { easyMin: 292, easyMax: 328, marathon: 265, threshold: 244, interval: 225, repetition: 209 },
  64: { easyMin: 285, easyMax: 321, marathon: 259, threshold: 238, interval: 220, repetition: 204 },
  66: { easyMin: 279, easyMax: 313, marathon: 253, threshold: 233, interval: 215, repetition: 199 },
  68: { easyMin: 273, easyMax: 306, marathon: 247, threshold: 228, interval: 210, repetition: 194 },
  70: { easyMin: 267, easyMax: 300, marathon: 242, threshold: 223, interval: 205, repetition: 190 },
  72: { easyMin: 261, easyMax: 294, marathon: 237, threshold: 218, interval: 201, repetition: 186 },
  74: { easyMin: 256, easyMax: 288, marathon: 232, threshold: 214, interval: 197, repetition: 182 },
  76: { easyMin: 251, easyMax: 282, marathon: 227, threshold: 209, interval: 193, repetition: 178 },
  78: { easyMin: 246, easyMax: 277, marathon: 223, threshold: 205, interval: 189, repetition: 175 },
  80: { easyMin: 242, easyMax: 272, marathon: 219, threshold: 201, interval: 185, repetition: 171 },
  82: { easyMin: 237, easyMax: 267, marathon: 215, threshold: 198, interval: 182, repetition: 168 },
  85: { easyMin: 231, easyMax: 260, marathon: 209, threshold: 193, interval: 177, repetition: 164 },
};

const VDOT_KEYS = [30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 62, 64, 66, 68, 70, 72, 74, 76, 78, 80, 82, 85];

function interpolate(key: keyof (typeof VDOT_TABLE)[30], vdot: number): number {
  const clamped = Math.max(30, Math.min(85, vdot));
  const low = VDOT_KEYS.filter((k) => k <= clamped).pop() ?? 30;
  const high = VDOT_KEYS.find((k) => k >= clamped) ?? 85;
  if (low === high) return VDOT_TABLE[low][key];
  const t = (clamped - low) / (high - low);
  return VDOT_TABLE[low][key] + t * (VDOT_TABLE[high][key] - VDOT_TABLE[low][key]);
}

export function pacesFromVDOT(vdot: number): TrainingPaces {
  const clamped = Math.max(30, Math.min(85, vdot));
  return {
    easy: {
      min: Math.round(interpolate("easyMin", clamped)),
      max: Math.round(interpolate("easyMax", clamped)),
    },
    marathon: Math.round(interpolate("marathon", clamped)),
    threshold: Math.round(interpolate("threshold", clamped)),
    interval: Math.round(interpolate("interval", clamped)),
    repetition: Math.round(interpolate("repetition", clamped)),
    easyHR: { min: 65, max: 79 },
    tempoHR: { min: 80, max: 90 },
  };
}

// ─── Part 4: Paces from LT data ─────────────────────────────────────────────

export interface LTData {
  lt1Pace: number;
  lt2Pace: number;
}

export interface TrainingPacesFromLT {
  easy: { min: number; max: number };
  threshold: number;
  marathon: number;
  interval: number;
  repetition: number;
}

export function pacesFromLT(lt: LTData): TrainingPacesFromLT {
  return {
    easy: {
      min: lt.lt1Pace + 60,
      max: lt.lt1Pace + 30,
    },
    threshold: lt.lt2Pace,
    marathon: Math.round(lt.lt1Pace + (lt.lt2Pace - lt.lt1Pace) * 0.6),
    interval: lt.lt2Pace - 15,
    repetition: lt.lt2Pace - 30,
  };
}

// ─── Part 5: Pace source selector ───────────────────────────────────────────

export type PaceSource =
  | "lactate_test"
  | "intervals_lt"
  | "race_result"
  | "field_test"
  | "calibrating";

export interface PaceProfile {
  paces: TrainingPaces;
  source: PaceSource;
  vdot?: number;
  confidence: "high" | "medium" | "low";
  lastUpdated: Date;
  sourceDescription: string;
}

const EIGHT_WEEKS_MS = 8 * 7 * 24 * 60 * 60 * 1000;

function ltToTrainingPaces(lt: TrainingPacesFromLT): TrainingPaces {
  return {
    ...lt,
    easyHR: { min: 65, max: 79 },
    tempoHR: { min: 80, max: 90 },
  };
}

function formatRaceLabel(distanceMeters: number, timeSeconds: number): string {
  const km = distanceMeters / 1000;
  const h = Math.floor(timeSeconds / 3600);
  const m = Math.floor((timeSeconds % 3600) / 60);
  const s = Math.floor(timeSeconds % 60);
  let distLabel = `${km}K`;
  if (Math.abs(km - 42.195) < 0.1) distLabel = "Marathon";
  else if (Math.abs(km - 21.0975) < 0.1) distLabel = "Half Marathon";
  else if (Math.abs(km - 5) < 0.1) distLabel = "5K";
  else if (Math.abs(km - 10) < 0.1) distLabel = "10K";
  const timeStr = h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
  return `${distLabel} in ${timeStr}`;
}

function formatDate(d: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

export function calculatePaceProfile(athleteData: {
  recentRaces?: Array<{
    distanceMeters: number;
    timeSeconds: number;
    date: Date;
  }>;
  ltData?: LTData;
  cooperDistance?: number;
  trialTime2400?: number;
}): PaceProfile {
  const now = new Date();

  // 1. LT data present → pacesFromLT
  if (athleteData.ltData) {
    const ltPaces = pacesFromLT(athleteData.ltData);
    return {
      paces: ltToTrainingPaces(ltPaces),
      source: "intervals_lt",
      confidence: "high",
      lastUpdated: now,
      sourceDescription: "Based on your lactate threshold data from intervals.icu",
    };
  }

  // 2. Recent race (< 8 weeks)
  const recentRaces = (athleteData.recentRaces ?? []).filter(
    (r) => now.getTime() - r.date.getTime() < EIGHT_WEEKS_MS
  );
  if (recentRaces.length > 0) {
    const sorted = [...recentRaces].sort((a, b) => b.date.getTime() - a.date.getTime());
    const mostRecent = sorted[0];
    const vdot = calculateVDOT(mostRecent.distanceMeters, mostRecent.timeSeconds);
    const paces = pacesFromVDOT(vdot);
    return {
      paces,
      source: "race_result",
      vdot,
      confidence: "high",
      lastUpdated: now,
      sourceDescription: `Based on your ${formatRaceLabel(mostRecent.distanceMeters, mostRecent.timeSeconds)} on ${formatDate(mostRecent.date)}`,
    };
  }

  // 3. Cooper
  if (athleteData.cooperDistance != null && athleteData.cooperDistance > 0) {
    const vdot = vdotFromCooper(athleteData.cooperDistance);
    const paces = pacesFromVDOT(vdot);
    return {
      paces,
      source: "field_test",
      vdot,
      confidence: "medium",
      lastUpdated: now,
      sourceDescription: `Based on your Cooper test (${Math.round(athleteData.cooperDistance / 1000 * 10) / 10} km in 12 min)`,
    };
  }

  // 4. 2400m trial
  if (athleteData.trialTime2400 != null && athleteData.trialTime2400 > 0) {
    const vdot = vdotFrom2400m(athleteData.trialTime2400);
    const paces = pacesFromVDOT(vdot);
    return {
      paces,
      source: "field_test",
      vdot,
      confidence: "medium",
      lastUpdated: now,
      sourceDescription: `Based on your 2400m time trial (${formatPace(athleteData.trialTime2400 / 2.4)}/km)`,
    };
  }

  // 5. Calibrating — VDOT 40 defaults
  const paces = pacesFromVDOT(40);
  return {
    paces,
    source: "calibrating",
    vdot: 40,
    confidence: "low",
    lastUpdated: now,
    sourceDescription: "No pace data yet — using conservative defaults. Add a recent race or field test to calibrate.",
  };
}

// ─── Part 6: Display helpers ────────────────────────────────────────────────

/** Convert seconds per km to mm:ss string. */
export function formatPace(secondsPerKm: number): string {
  const sec = Math.round(secondsPerKm);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Convert seconds per km to min/mile string. */
export function paceToMileString(secondsPerKm: number): string {
  const secPerMile = secondsPerKm * 1.609344;
  const m = Math.floor(secPerMile / 60);
  const s = Math.round(secPerMile % 60);
  return `${m}:${String(s).padStart(2, "0")}/mi`;
}

const SESSION_DESCRIPTIONS: Record<string, string> = {
  easy: "Conversational pace. You should be able to speak in full sentences.",
  marathon: "Steady, sustainable effort. Comfortable but purposeful.",
  threshold: "Comfortably hard. You should be able to speak in short sentences.",
  interval: "Hard effort. 3–5 min at a time with full recovery.",
  repetition: "Very hard, short efforts. Focus on form and leg turnover.",
  long: "Easy to steady. Same as easy pace — stay conversational for the duration.",
};

export function getPaceForSession(
  sessionType: "easy" | "marathon" | "threshold" | "interval" | "repetition" | "long",
  profile: PaceProfile
): { pace: string; hrZone?: string; description: string } {
  const p = profile.paces;
  let pace: string;
  let hrZone: string | undefined;

  switch (sessionType) {
    case "easy":
    case "long":
      pace = `${formatPace(p.easy.min)}-${formatPace(p.easy.max)}/km`;
      hrZone = `${p.easyHR.min}-${p.easyHR.max}% max HR`;
      break;
    case "marathon":
      pace = `${formatPace(p.marathon)}/km`;
      break;
    case "threshold":
      pace = `${formatPace(p.threshold)}/km`;
      hrZone = `${p.tempoHR.min}-${p.tempoHR.max}% max HR`;
      break;
    case "interval":
      pace = `${formatPace(p.interval)}/km`;
      break;
    case "repetition":
      pace = `${formatPace(p.repetition)}/km`;
      break;
    default:
      pace = `${formatPace(p.easy.min)}-${formatPace(p.easy.max)}/km`;
  }

  return {
    pace,
    hrZone,
    description: SESSION_DESCRIPTIONS[sessionType] ?? SESSION_DESCRIPTIONS.easy,
  };
}

// ─── Part 7: Auto-update trigger ────────────────────────────────────────────

const PACE_CHANGE_THRESHOLD = 3;

export function shouldUpdatePaceProfile(
  currentProfile: PaceProfile,
  newAthleteData: Parameters<typeof calculatePaceProfile>[0]
): { shouldUpdate: boolean; reason?: string } {
  const newProfile = calculatePaceProfile(newAthleteData);
  if (newProfile.source === "calibrating" && currentProfile.source !== "calibrating") {
    return { shouldUpdate: false };
  }
  if (newProfile.source === "calibrating") {
    return { shouldUpdate: false };
  }

  const cur = currentProfile.paces;
  const next = newProfile.paces;

  const thresholdDiff = Math.abs(cur.threshold - next.threshold);
  const easyMinDiff = Math.abs(cur.easy.min - next.easy.min);
  const easyMaxDiff = Math.abs(cur.easy.max - next.easy.max);

  if (thresholdDiff > PACE_CHANGE_THRESHOLD || easyMinDiff > PACE_CHANGE_THRESHOLD || easyMaxDiff > PACE_CHANGE_THRESHOLD) {
    const reasons: string[] = [];
    if (thresholdDiff > PACE_CHANGE_THRESHOLD) {
      const dir = next.threshold < cur.threshold ? "faster" : "slower";
      reasons.push(`Threshold pace is ${formatPace(Math.abs(next.threshold - cur.threshold))} ${dir}`);
    }
    if (newProfile.source === "race_result" && newProfile.sourceDescription) {
      reasons.push(newProfile.sourceDescription.replace("Based on your ", ""));
    } else if (newProfile.source === "intervals_lt") {
      reasons.push("Lactate threshold data updated");
    }
    return {
      shouldUpdate: true,
      reason: reasons.length ? reasons[0] : "Paces changed significantly",
    };
  }

  return { shouldUpdate: false };
}
