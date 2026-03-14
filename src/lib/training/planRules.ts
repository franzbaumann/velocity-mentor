import type { Philosophy, TargetDistance, TrainingPhase } from "./sessionLibrary";

export const PLAN_RULES = {
  maxWeeklyVolumeIncreasePercent: 7,
  maxLongRunIncreasePercent: 10,
  recoveryWeekEvery: 3,
  recoveryWeekVolumeReduction: 0.25,

  startingVolumeByCTL: (ctl: number, targetWeeklyKm: number): number => {
    if (ctl < 30) return targetWeeklyKm * 0.5;
    if (ctl < 50) return targetWeeklyKm * 0.65;
    if (ctl < 70) return targetWeeklyKm * 0.75;
    return targetWeeklyKm * 0.85;
  },

  maxHardSessionsPerWeek: 2,
  minEasyDaysBetweenHardSessions: 1,
  longRunCountsAsHardSession: true,

  vo2maxAllowedDistances: ["1500m", "5k", "10k"] as TargetDistance[],
  vo2maxSparselyAllowed: ["half_marathon", "marathon"] as TargetDistance[],
  vo2maxForbidden: ["ultra"] as TargetDistance[],
  vo2maxMaxFrequencyMarathonDays: 14,

  doubleRunRequiresCTL: 65,
  doubleRunAlwaysEasy: true,
  doubleRunMaxPerWeek: 3,
  doubleRunAllowedDays: ["tuesday", "thursday"],

  phaseDuration: {
    "1500m": { base: 5, build: 5, peak: 4, taper: 1 },
    "5k": { base: 5, build: 5, peak: 3, taper: 1 },
    "10k": { base: 5, build: 5, peak: 4, taper: 1 },
    half_marathon: { base: 6, build: 6, peak: 3, taper: 2 },
    marathon: { base: 6, build: 7, peak: 4, taper: 3 },
    ultra: { base: 7, build: 8, peak: 4, taper: 3 },
    season: { base: 0, build: 0, peak: 0, taper: 0 },
  } as Record<TargetDistance, Record<Exclude<TrainingPhase, "recovery">, number>>,

  hansonsMaxLongRun: 26,

  injuryModifiers: {
    stress_fracture: {
      maxVolumeIncreasePercent: 5,
      forbiddenSessions: [] as string[],
    },
    achilles: {
      forbiddenSessions: ["1500-03", "u-06"],
    },
    it_band: {
      requiredSessions: ["str-02"],
      reduceDownhills: true,
    },
  },
} as const;

export type PlanRules = typeof PLAN_RULES;

export function isRecoveryWeek(weekNumber: number): boolean {
  return weekNumber > 1 && weekNumber % PLAN_RULES.recoveryWeekEvery === 0;
}

export function getRecoveryWeekVolume(normalVolume: number): number {
  return normalVolume * (1 - PLAN_RULES.recoveryWeekVolumeReduction);
}

export function canUseVO2max(
  distance: TargetDistance,
  phase: TrainingPhase,
): boolean {
  if (PLAN_RULES.vo2maxForbidden.includes(distance)) return false;
  if (PLAN_RULES.vo2maxAllowedDistances.includes(distance)) {
    return phase === "build" || phase === "peak";
  }
  if (PLAN_RULES.vo2maxSparselyAllowed.includes(distance)) {
    return phase === "peak";
  }
  return false;
}

export function canUseDoubleRun(
  ctl: number,
  doubleRunsEnabled: boolean,
): boolean {
  return doubleRunsEnabled && ctl >= PLAN_RULES.doubleRunRequiresCTL;
}

export function getPhaseWeeks(
  distance: TargetDistance,
  totalWeeks: number,
): Record<Exclude<TrainingPhase, "recovery">, number> {
  const template = PLAN_RULES.phaseDuration[distance];
  if (distance === "season") {
    return { base: 0, build: totalWeeks, peak: 0, taper: 0 };
  }
  const templateTotal = template.base + template.build + template.peak + template.taper;
  if (totalWeeks >= templateTotal) {
    const extra = totalWeeks - templateTotal;
    return {
      base: template.base + Math.ceil(extra / 2),
      build: template.build + Math.floor(extra / 2),
      peak: template.peak,
      taper: template.taper,
    };
  }
  const ratio = totalWeeks / templateTotal;
  const taper = Math.max(1, Math.round(template.taper * ratio));
  const peak = Math.max(1, Math.round(template.peak * ratio));
  const build = Math.max(2, Math.round(template.build * ratio));
  const base = Math.max(1, totalWeeks - taper - peak - build);
  return { base, build, peak, taper };
}

export function maxWeeklyIncrease(currentKm: number): number {
  return currentKm * (PLAN_RULES.maxWeeklyVolumeIncreasePercent / 100);
}

export function maxLongRunIncrease(currentKm: number): number {
  return currentKm * (PLAN_RULES.maxLongRunIncreasePercent / 100);
}

export function getPhilosophyConstraints(philosophy: Philosophy): {
  noGrayZone: boolean;
  thresholdDominant: boolean;
  lateIntensityOnly: boolean;
  maxLongRunKm: number | null;
  backToBackRequired: boolean;
  mediumLongRequired: boolean;
  exactVdotPaces: boolean;
} {
  switch (philosophy) {
    case "80_20":
      return {
        noGrayZone: true,
        thresholdDominant: false,
        lateIntensityOnly: false,
        maxLongRunKm: null,
        backToBackRequired: false,
        mediumLongRequired: false,
        exactVdotPaces: false,
      };
    case "norwegian":
      return {
        noGrayZone: false,
        thresholdDominant: true,
        lateIntensityOnly: false,
        maxLongRunKm: null,
        backToBackRequired: false,
        mediumLongRequired: false,
        exactVdotPaces: false,
      };
    case "lydiard":
      return {
        noGrayZone: false,
        thresholdDominant: false,
        lateIntensityOnly: true,
        maxLongRunKm: null,
        backToBackRequired: false,
        mediumLongRequired: false,
        exactVdotPaces: false,
      };
    case "hansons":
      return {
        noGrayZone: false,
        thresholdDominant: false,
        lateIntensityOnly: false,
        maxLongRunKm: PLAN_RULES.hansonsMaxLongRun,
        backToBackRequired: true,
        mediumLongRequired: false,
        exactVdotPaces: false,
      };
    case "pfitzinger":
      return {
        noGrayZone: false,
        thresholdDominant: false,
        lateIntensityOnly: false,
        maxLongRunKm: null,
        backToBackRequired: false,
        mediumLongRequired: true,
        exactVdotPaces: false,
      };
    case "daniels":
      return {
        noGrayZone: false,
        thresholdDominant: false,
        lateIntensityOnly: false,
        maxLongRunKm: null,
        backToBackRequired: false,
        mediumLongRequired: false,
        exactVdotPaces: true,
      };
    case "japanese":
      return {
        noGrayZone: false,
        thresholdDominant: false,
        lateIntensityOnly: false,
        maxLongRunKm: null,
        backToBackRequired: false,
        mediumLongRequired: false,
        exactVdotPaces: false,
      };
    default:
      return {
        noGrayZone: false,
        thresholdDominant: false,
        lateIntensityOnly: false,
        maxLongRunKm: null,
        backToBackRequired: false,
        mediumLongRequired: false,
        exactVdotPaces: false,
      };
  }
}
