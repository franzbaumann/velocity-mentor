/**
 * Plan Architect — builds training plan skeleton from athlete input.
 * Pure logic, no AI calls.
 *
 * Session detail (library id, title, description) is filled in by:
 * - `enrichTrainingPlanWorkoutsFromLibrary` after PaceIQ / season plan insert, or
 * - `weekProposal.checkAndGenerateProposal` → `selectSessionsForWeeks` (AI) when the athlete approves a proposal.
 */

import { supabase } from "@/integrations/supabase/client";
import { type PaceProfile } from "./vdot";

// ─── Part 2: Types and constants ────────────────────────────────────────────

export type GoalDistance =
  | "1500m"
  | "5k"
  | "10k"
  | "half_marathon"
  | "marathon"
  | "ultra";

export type TrainingPhase = "base" | "build" | "peak" | "taper";

export type DayType = "rest" | "easy" | "quality" | "long" | "double";

export interface AthleteInput {
  userId: string;
  goalDistance: GoalDistance;
  goalRaceDate: Date;
  goalTimeSeconds?: number;
  currentWeeklyKm: number;
  trainingDaysPerWeek: number;
  longestSessionMinutes: number;
  doubleRunsEnabled: boolean;
  doubleRunDays: string[];
  doubleRunDurationMinutes: number;
  experienceLevel: "beginner" | "building" | "experienced" | "competitive";
  injuryHistory: string[];
  paceProfile: PaceProfile;
}

export interface WeekSkeleton {
  weekNumber: number;
  phase: TrainingPhase;
  targetVolumeKm: number;
  isRecoveryWeek: boolean;
  days: DaySkeleton[];
}

export interface DaySkeleton {
  dayOfWeek:
    | "monday"
    | "tuesday"
    | "wednesday"
    | "thursday"
    | "friday"
    | "saturday"
    | "sunday";
  type: DayType;
  isHardDay: boolean;
  isDouble: boolean;
  approximateKm: number;
  approximateDurationMinutes: number;
  sessionCategory: string;
  phase: TrainingPhase;
  weekNumber: number;
}

export interface PlanSkeleton {
  userId: string;
  totalWeeks: number;
  startDate: Date;
  raceDate: Date;
  goalDistance: GoalDistance;
  startWeeklyKm: number;
  peakWeeklyKm: number;
  phases: {
    base: { startWeek: number; endWeek: number };
    build: { startWeek: number; endWeek: number };
    peak: { startWeek: number; endWeek: number };
    taper: { startWeek: number; endWeek: number };
  };
  weeks: WeekSkeleton[];
}

// ─── Part 3: Phase durations ────────────────────────────────────────────────

const MIN_WEEKS: Record<GoalDistance, number> = {
  "1500m": 8,
  "5k": 8,
  "10k": 10,
  half_marathon: 10,
  marathon: 14,
  ultra: 16,
};

const TAPER_WEEKS: Record<GoalDistance, number> = {
  "1500m": 1,
  "5k": 1,
  "10k": 2,
  half_marathon: 2,
  marathon: 3,
  ultra: 3,
};

const PHASE_RATIO: Record<GoalDistance, [number, number, number]> = {
  "1500m": [0.35, 0.4, 0.25],
  "5k": [0.35, 0.4, 0.25],
  "10k": [0.35, 0.4, 0.25],
  half_marathon: [0.35, 0.4, 0.25],
  marathon: [0.4, 0.4, 0.2],
  ultra: [0.45, 0.35, 0.2],
};

function calculatePhaseDurations(
  totalWeeks: number,
  distance: GoalDistance
): { base: number; build: number; peak: number; taper: number } {
  const taper = TAPER_WEEKS[distance];
  const remaining = totalWeeks - taper;
  const [baseRatio, buildRatio, peakRatio] = PHASE_RATIO[distance];

  const base = Math.round(remaining * baseRatio);
  const peak = Math.round(remaining * peakRatio);
  const build = remaining - base - peak;

  return { base, build, peak, taper };
}

// ─── Part 4: Volume progression ─────────────────────────────────────────────

function calculateStartVolume(
  currentWeeklyKm: number,
  targetPeakKm: number
): number {
  const byCurrentFitness = currentWeeklyKm * 0.9;
  const byPeak = targetPeakKm * 0.5;
  return Math.max(byCurrentFitness, byPeak);
}

function calculatePeakVolume(athlete: AthleteInput): number {
  const base: Record<GoalDistance, number> = {
    "1500m": 55,
    "5k": 65,
    "10k": 75,
    half_marathon: 85,
    marathon: 100,
    ultra: 120,
  };

  let peak = base[athlete.goalDistance];

  if (athlete.trainingDaysPerWeek <= 4) peak *= 0.75;
  else if (athlete.trainingDaysPerWeek === 5) peak *= 0.85;
  else if (athlete.trainingDaysPerWeek === 6) peak *= 0.95;

  if (athlete.experienceLevel === "beginner") peak *= 0.65;
  else if (athlete.experienceLevel === "building") peak *= 0.8;
  else if (athlete.experienceLevel === "experienced") peak *= 0.9;

  const maxPeak = athlete.currentWeeklyKm * 1.3;
  return Math.min(peak, maxPeak);
}

function generateWeeklyVolumes(
  startKm: number,
  peakKm: number,
  phases: { base: number; build: number; peak: number; taper: number }
): number[] {
  const volumes: number[] = [];
  const buildWeeks = phases.base + phases.build + phases.peak;
  let current = startKm;
  let weekInBlock = 0;

  for (let w = 0; w < buildWeeks; w++) {
    weekInBlock++;

    if (weekInBlock === 3) {
      volumes.push(Math.round(current * 0.75));
      weekInBlock = 0;
      continue;
    }

    const remaining = buildWeeks - w;
    const needed = (peakKm - current) / remaining;
    const increase = Math.min(needed, current * 0.07);
    current = Math.min(current + increase, peakKm);
    volumes.push(Math.round(current));
  }

  const taperReductions = [0.8, 0.65, 0.5];
  for (let t = 0; t < phases.taper; t++) {
    const reduction = taperReductions[t] ?? 0.5;
    volumes.push(Math.round(peakKm * reduction));
  }

  return volumes;
}

// ─── Part 5: Weekly structure ────────────────────────────────────────────────

const WEEKLY_PATTERNS: Record<
  GoalDistance,
  Record<
    number,
    { hardDays: string[]; longRunDay: string; restDays: string[] }
  >
> = {
  marathon: {
    4: {
      hardDays: ["tuesday"],
      longRunDay: "sunday",
      restDays: ["monday", "thursday", "saturday"],
    },
    5: {
      hardDays: ["tuesday", "friday"],
      longRunDay: "sunday",
      restDays: ["monday", "thursday"],
    },
    6: {
      hardDays: ["tuesday", "friday"],
      longRunDay: "sunday",
      restDays: ["monday"],
    },
    7: {
      hardDays: ["tuesday", "friday"],
      longRunDay: "sunday",
      restDays: [],
    },
  },
  half_marathon: {
    4: {
      hardDays: ["tuesday"],
      longRunDay: "sunday",
      restDays: ["monday", "thursday", "saturday"],
    },
    5: {
      hardDays: ["tuesday", "friday"],
      longRunDay: "sunday",
      restDays: ["monday", "thursday"],
    },
    6: {
      hardDays: ["tuesday", "friday"],
      longRunDay: "sunday",
      restDays: ["monday"],
    },
    7: {
      hardDays: ["tuesday", "friday"],
      longRunDay: "sunday",
      restDays: [],
    },
  },
  "10k": {
    4: {
      hardDays: ["tuesday"],
      longRunDay: "sunday",
      restDays: ["monday", "wednesday", "saturday"],
    },
    5: {
      hardDays: ["tuesday", "thursday"],
      longRunDay: "sunday",
      restDays: ["monday", "saturday"],
    },
    6: {
      hardDays: ["tuesday", "thursday"],
      longRunDay: "sunday",
      restDays: ["monday"],
    },
    7: {
      hardDays: ["tuesday", "thursday", "saturday"],
      longRunDay: "sunday",
      restDays: [],
    },
  },
  "5k": {
    4: {
      hardDays: ["tuesday"],
      longRunDay: "saturday",
      restDays: ["monday", "wednesday", "sunday"],
    },
    5: {
      hardDays: ["tuesday", "thursday"],
      longRunDay: "saturday",
      restDays: ["monday", "sunday"],
    },
    6: {
      hardDays: ["tuesday", "thursday"],
      longRunDay: "saturday",
      restDays: ["monday"],
    },
    7: {
      hardDays: ["tuesday", "thursday", "saturday"],
      longRunDay: "sunday",
      restDays: [],
    },
  },
  "1500m": {
    4: {
      hardDays: ["tuesday"],
      longRunDay: "saturday",
      restDays: ["monday", "wednesday", "sunday"],
    },
    5: {
      hardDays: ["tuesday", "thursday"],
      longRunDay: "saturday",
      restDays: ["monday", "sunday"],
    },
    6: {
      hardDays: ["tuesday", "thursday"],
      longRunDay: "saturday",
      restDays: ["monday"],
    },
    7: {
      hardDays: ["tuesday", "thursday", "saturday"],
      longRunDay: "sunday",
      restDays: [],
    },
  },
  ultra: {
    4: {
      hardDays: ["wednesday"],
      longRunDay: "sunday",
      restDays: ["monday", "tuesday", "friday"],
    },
    5: {
      hardDays: ["wednesday"],
      longRunDay: "sunday",
      restDays: ["monday", "friday"],
    },
    6: {
      hardDays: ["wednesday", "friday"],
      longRunDay: "sunday",
      restDays: ["monday"],
    },
    7: {
      hardDays: ["wednesday", "friday"],
      longRunDay: "sunday",
      restDays: [],
    },
  },
};

function getControlMetric(
  dayType: DayType,
  distance: GoalDistance
): "pace" | "hr" | "rpe" {
  if (distance === "ultra") return "rpe";
  if (dayType === "easy" || dayType === "long") return "hr";
  if (dayType === "quality") return "pace";
  return "hr";
}

function buildWeekDays(
  weekNumber: number,
  phase: TrainingPhase,
  weeklyKm: number,
  athlete: AthleteInput,
  isRecoveryWeek: boolean
): DaySkeleton[] {
  const days = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ];
  const daysAvailable = athlete.trainingDaysPerWeek;
  const pattern =
    WEEKLY_PATTERNS[athlete.goalDistance]?.[daysAvailable] ??
    WEEKLY_PATTERNS[athlete.goalDistance]?.[5];

  if (!pattern) {
    return days.map((day) => ({
      dayOfWeek: day as DaySkeleton["dayOfWeek"],
      type: "rest" as DayType,
      isHardDay: false,
      isDouble: false,
      approximateKm: 0,
      approximateDurationMinutes: 0,
      sessionCategory: "rest",
      phase,
      weekNumber,
    }));
  }

  const { hardDays, longRunDay, restDays } = pattern;
  const activeHardDays = isRecoveryWeek ? [] : hardDays;

  return days.map((day) => {
    const isRest = restDays.includes(day);
    const isHard = activeHardDays.includes(day);
    const isLong = day === longRunDay && !isRecoveryWeek;
    const isDouble =
      athlete.doubleRunsEnabled &&
      athlete.doubleRunDays.includes(day) &&
      !isHard &&
      !isRest &&
      !isRecoveryWeek;

    let type: DayType = "easy";
    if (isRest) type = "rest";
    else if (isHard) type = "quality";
    else if (isLong) type = "long";

    const longKm = weeklyKm * 0.28;
    const hardKm = weeklyKm * 0.15;
    const easyKm = weeklyKm * 0.1;
    const doubleKm = athlete.doubleRunDurationMinutes * 0.13;

    const approxKm =
      isRest ? 0 : isLong ? longKm : isHard ? hardKm : isDouble ? doubleKm : easyKm;

    const approxMin = isRest ? 0 : Math.round(approxKm * 6);

    return {
      dayOfWeek: day as DaySkeleton["dayOfWeek"],
      type,
      isHardDay: isHard,
      isDouble,
      approximateKm: Math.round(approxKm * 10) / 10,
      approximateDurationMinutes: approxMin,
      sessionCategory: type,
      phase,
      weekNumber,
    };
  });
}

// ─── Part 6: Double run auto-activation ───────────────────────────────────────

export function shouldSuggestDoubleRuns(athlete: AthleteInput): {
  suggest: boolean;
  reason?: string;
  recommendedDays?: string[];
} {
  const peak = calculatePeakVolume(athlete);

  if (peak >= 110 && !athlete.doubleRunsEnabled) {
    return {
      suggest: true,
      reason: `Your plan peaks at ${Math.round(peak)} km/week. At this volume, double runs on 2-3 days will improve your training quality and reduce injury risk compared to longer single sessions.`,
      recommendedDays: ["tuesday", "thursday"],
    };
  }

  if (peak >= 90 && !athlete.doubleRunsEnabled) {
    return {
      suggest: true,
      reason: `Your plan peaks at ${Math.round(peak)} km/week. Adding one double run day would help distribute the load more effectively.`,
      recommendedDays: ["tuesday"],
    };
  }

  return { suggest: false };
}

// ─── Part 7: Main builder function ───────────────────────────────────────────

export function buildPlanSkeleton(athlete: AthleteInput): PlanSkeleton {
  const today = new Date();
  const weeksAvailable = Math.floor(
    (athlete.goalRaceDate.getTime() - today.getTime()) /
      (7 * 24 * 60 * 60 * 1000)
  );

  const minWeeks = MIN_WEEKS[athlete.goalDistance];
  if (weeksAvailable < minWeeks) {
    console.warn(
      `Only ${weeksAvailable} weeks available, minimum is ${minWeeks}`
    );
  }

  const totalWeeks = Math.max(weeksAvailable, minWeeks);
  const phases = calculatePhaseDurations(totalWeeks, athlete.goalDistance);
  const peakKm = calculatePeakVolume(athlete);
  const startKm = calculateStartVolume(athlete.currentWeeklyKm, peakKm);
  const weeklyVolumes = generateWeeklyVolumes(startKm, peakKm, phases);

  const phaseForWeek = (w: number): TrainingPhase => {
    if (w < phases.base) return "base";
    if (w < phases.base + phases.build) return "build";
    if (w < phases.base + phases.build + phases.peak) return "peak";
    return "taper";
  };

  const weeks: WeekSkeleton[] = weeklyVolumes.map((volumeKm, i) => {
    const weekNumber = i + 1;
    const phase = phaseForWeek(i);
    const isRecoveryWeek =
      phase !== "taper" &&
      weekNumber % 3 === 0 &&
      phase !== "peak";

    return {
      weekNumber,
      phase,
      targetVolumeKm: volumeKm,
      isRecoveryWeek,
      days: buildWeekDays(weekNumber, phase, volumeKm, athlete, isRecoveryWeek),
    };
  });

  const phaseEndWeeks = {
    base: { startWeek: 1, endWeek: phases.base },
    build: {
      startWeek: phases.base + 1,
      endWeek: phases.base + phases.build,
    },
    peak: {
      startWeek: phases.base + phases.build + 1,
      endWeek: phases.base + phases.build + phases.peak,
    },
    taper: {
      startWeek: phases.base + phases.build + phases.peak + 1,
      endWeek: totalWeeks,
    },
  };

  return {
    userId: athlete.userId,
    totalWeeks,
    startDate: today,
    raceDate: athlete.goalRaceDate,
    goalDistance: athlete.goalDistance,
    startWeeklyKm: Math.round(startKm),
    peakWeeklyKm: Math.round(peakKm),
    phases: phaseEndWeeks,
    weeks,
  };
}

// ─── Part 8: Save to Supabase ────────────────────────────────────────────────

function getDateForWeekDay(
  startDate: Date,
  weekNumber: number,
  dayOfWeek: string
): string {
  const days = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ];
  const dayIndex = days.indexOf(dayOfWeek);
  const date = new Date(startDate);
  date.setDate(date.getDate() + (weekNumber - 1) * 7 + dayIndex);
  return date.toISOString().split("T")[0];
}

export async function savePlanSkeleton(
  skeleton: PlanSkeleton,
  planId: string
): Promise<void> {
  const { data: plan, error: planErr } = await supabase
    .from("training_plan")
    .select("user_id")
    .eq("id", planId)
    .single();

  if (planErr || !plan) {
    throw new Error("Plan not found or access denied");
  }

  const userId = plan.user_id;

  await supabase
    .from("training_plan")
    .update({
      phase_structure: skeleton.phases,
      peak_weekly_km: skeleton.peakWeeklyKm,
      start_weekly_km: skeleton.startWeeklyKm,
      total_weeks: skeleton.totalWeeks,
      current_phase: skeleton.weeks[0]?.phase ?? "base",
      current_week: 1,
      last_regenerated_at: new Date().toISOString(),
    })
    .eq("id", planId);

  const { error: deleteErr } = await supabase
    .from("training_plan_workout")
    .delete()
    .eq("plan_id", planId)
    .eq("is_skeleton", true);

  if (deleteErr) {
    // If is_skeleton column doesn't exist yet, delete all workouts for plan
    const { error: deleteAllErr } = await supabase
      .from("training_plan_workout")
      .delete()
      .eq("plan_id", planId);
    if (deleteAllErr) throw deleteAllErr;
  }

  const workouts = skeleton.weeks.flatMap((week) =>
    week.days.map((day) => ({
      plan_id: planId,
      user_id: userId,
      week_number: week.weekNumber,
      phase: week.phase,
      is_skeleton: true,
      is_hard_day: day.isHardDay,
      is_double_run: day.isDouble,
      session_category: day.sessionCategory,
      skeleton_session_type: day.type,
      target_distance_km: day.approximateKm,
      target_duration_minutes: day.approximateDurationMinutes,
      distance_km: day.approximateKm,
      duration_minutes: day.approximateDurationMinutes,
      date: getDateForWeekDay(skeleton.startDate, week.weekNumber, day.dayOfWeek),
    }))
  );

  const { error: insertErr } = await supabase
    .from("training_plan_workout")
    .insert(workouts);

  if (insertErr) throw insertErr;
}

// ─── Part 9: Export helper for UI ───────────────────────────────────────────

export function getSkeletonSummary(skeleton: PlanSkeleton): {
  totalWeeks: number;
  peakWeeklyKm: number;
  phases: PlanSkeleton["phases"];
  weekSummaries: Array<{
    weekNumber: number;
    phase: TrainingPhase;
    volumeKm: number;
    isRecoveryWeek: boolean;
    hardDays: number;
    longRunKm: number;
  }>;
} {
  return {
    totalWeeks: skeleton.totalWeeks,
    peakWeeklyKm: skeleton.peakWeeklyKm,
    phases: skeleton.phases,
    weekSummaries: skeleton.weeks.map((w) => ({
      weekNumber: w.weekNumber,
      phase: w.phase,
      volumeKm: w.targetVolumeKm,
      isRecoveryWeek: w.isRecoveryWeek,
      hardDays: w.days.filter((d) => d.isHardDay).length,
      longRunKm: w.days.find((d) => d.type === "long")?.approximateKm ?? 0,
    })),
  };
}
