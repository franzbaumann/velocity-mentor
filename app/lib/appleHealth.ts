import {
  WorkoutTypeIdentifier,
  WorkoutActivityType,
  CategoryValueSleepAnalysis,
  queryWorkoutSamples,
  queryQuantitySamples,
  queryStatisticsForQuantity,
  queryCategorySamples,
  type ObjectTypeIdentifier,
} from "@kingstinct/react-native-healthkit";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Types we request for coaching: load, recovery, and Apple-recorded runs/walks.
 * Add identifiers here as features need them; keep App Store privacy labels in sync.
 */
export const APPLE_HEALTH_READ_TYPES: readonly ObjectTypeIdentifier[] = [
  WorkoutTypeIdentifier,
  "HKQuantityTypeIdentifierHeartRate",
  "HKQuantityTypeIdentifierRestingHeartRate",
  "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
  "HKQuantityTypeIdentifierDistanceWalkingRunning",
  "HKQuantityTypeIdentifierRunningSpeed",
  "HKQuantityTypeIdentifierActiveEnergyBurned",
  "HKQuantityTypeIdentifierStepCount",
  "HKQuantityTypeIdentifierVO2Max",
  "HKCategoryTypeIdentifierSleepAnalysis",
];

export const appleHealthReadAuth = {
  toRead: APPLE_HEALTH_READ_TYPES,
} as const;

const WORKOUT_TYPE_MAP: Partial<Record<WorkoutActivityType, string>> = {
  [WorkoutActivityType.running]: "Run",
  [WorkoutActivityType.walking]: "Walk",
  [WorkoutActivityType.cycling]: "Ride",
  [WorkoutActivityType.hiking]: "Hike",
  [WorkoutActivityType.swimming]: "Swim",
  [WorkoutActivityType.yoga]: "Yoga",
  [WorkoutActivityType.highIntensityIntervalTraining]: "Workout",
  [WorkoutActivityType.traditionalStrengthTraining]: "Workout",
  [WorkoutActivityType.functionalStrengthTraining]: "Workout",
  [WorkoutActivityType.crossTraining]: "Workout",
  [WorkoutActivityType.elliptical]: "Workout",
  [WorkoutActivityType.rowing]: "Workout",
  [WorkoutActivityType.stairClimbing]: "Workout",
  [WorkoutActivityType.preparationAndRecovery]: "Workout",
  [WorkoutActivityType.pilates]: "Workout",
  [WorkoutActivityType.coreTraining]: "Workout",
};

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dayStart(d: Date): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return s;
}

function dayEnd(d: Date): Date {
  const s = new Date(d);
  s.setHours(23, 59, 59, 999);
  return s;
}

/**
 * Reads workouts from Apple Health (last 365 days) and upserts into the
 * `activity` Supabase table. Deduplicates via external_id = Apple Health UUID.
 */
export async function syncAppleHealthActivities(
  userId: string,
  supabase: SupabaseClient
): Promise<number> {
  const since = new Date();
  since.setFullYear(since.getFullYear() - 1);

  const workouts = await queryWorkoutSamples({
    limit: 500,
    ascending: false,
    filter: { startDate: since },
  });

  const rows: Record<string, unknown>[] = [];

  console.log(`[AppleHealth] found ${workouts.length} workouts in HealthKit`);
  if (workouts.length > 0) {
    const typeCounts: Record<string, number> = {};
    for (const w of workouts) {
      const key = String(w.workoutActivityType);
      typeCounts[key] = (typeCounts[key] ?? 0) + 1;
    }
    console.log("[AppleHealth] workout types:", JSON.stringify(typeCounts));
  }

  for (const w of workouts) {
    const activityType = WORKOUT_TYPE_MAP[w.workoutActivityType];
    if (!activityType) continue;

    // Get avg & max HR via workout statistics
    let avgHr: number | null = null;
    let maxHr: number | null = null;
    try {
      const hrStat = await w.getStatistic("HKQuantityTypeIdentifierHeartRate");
      if (hrStat?.averageQuantity?.quantity) {
        avgHr = Math.round(hrStat.averageQuantity.quantity);
      }
      if (hrStat?.maximumQuantity?.quantity) {
        maxHr = Math.round(hrStat.maximumQuantity.quantity);
      }
    } catch {
      // HR not available for all workout types
    }

    const distanceKm = w.totalDistance?.quantity
      ? w.totalDistance.quantity / 1000
      : null;

    const elevationGain = w.metadataElevationAscended?.quantity ?? null;

    rows.push({
      user_id: userId,
      external_id: w.uuid,
      date: toDateStr(w.startDate),
      type: activityType,
      name: activityType,
      distance_km: distanceKm,
      duration_seconds: Math.round(w.duration.quantity),
      avg_hr: avgHr,
      max_hr: maxHr,
      elevation_gain: elevationGain ? Math.round(elevationGain) : null,
      source: "apple_health",
    });
  }

  if (rows.length === 0) return 0;

  const { error } = await supabase
    .from("activity")
    .upsert(rows, { onConflict: "user_id,external_id", ignoreDuplicates: false });

  if (error) {
    console.warn("[AppleHealth] activities upsert error:", error.message);
    return 0;
  }

  return rows.length;
}

/**
 * Reads daily wellness data from Apple Health (last 90 days) and upserts
 * into the `daily_readiness` table. Only writes Apple Health fields —
 * does NOT overwrite CTL/ATL/TSB from intervals.icu.
 */
export async function syncAppleHealthWellness(
  userId: string,
  supabase: SupabaseClient
): Promise<number> {
  const DAYS = 90;
  const now = new Date();
  const rows: Record<string, unknown>[] = [];

  // VO2max — fetch latest single value
  let latestVo2max: number | null = null;
  try {
    const vo2Samples = await queryQuantitySamples(
      "HKQuantityTypeIdentifierVO2Max",
      { limit: 1, ascending: false, unit: "ml/kg/min" }
    );
    if (vo2Samples.length > 0) {
      latestVo2max = Math.round(vo2Samples[0].quantity * 10) / 10;
    }
  } catch {
    // Not available
  }

  for (let i = 0; i < DAYS; i++) {
    const dayDate = new Date(now);
    dayDate.setDate(dayDate.getDate() - i);
    const start = dayStart(dayDate);
    const end = dayEnd(dayDate);
    const dateStr = toDateStr(dayDate);

    let hrv: number | null = null;
    let restingHr: number | null = null;
    let steps: number | null = null;
    let sleepHours: number | null = null;

    // HRV (ms)
    try {
      const res = await queryStatisticsForQuantity(
        "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
        ["discreteAverage"],
        { filter: { startDate: start, endDate: end }, unit: "ms" }
      );
      if (res.averageQuantity?.quantity) {
        hrv = Math.round(res.averageQuantity.quantity * 10) / 10;
      }
    } catch {
      // No HRV
    }

    // Resting HR (bpm)
    try {
      const samples = await queryQuantitySamples(
        "HKQuantityTypeIdentifierRestingHeartRate",
        {
          limit: 1,
          ascending: false,
          unit: "count/min",
          filter: { startDate: start, endDate: end },
        }
      );
      if (samples.length > 0) {
        restingHr = Math.round(samples[0].quantity);
      }
    } catch {
      // No resting HR
    }

    // Steps (sum)
    try {
      const res = await queryStatisticsForQuantity(
        "HKQuantityTypeIdentifierStepCount",
        ["cumulativeSum"],
        { filter: { startDate: start, endDate: end }, unit: "count" }
      );
      if (res.sumQuantity?.quantity) {
        steps = Math.round(res.sumQuantity.quantity);
      }
    } catch {
      // No steps
    }

    // Sleep — look back from 18:00 previous day to cover the night
    try {
      const sleepStart = new Date(start);
      sleepStart.setDate(sleepStart.getDate() - 1);
      sleepStart.setHours(18, 0, 0, 0);

      const sleepSamples = await queryCategorySamples(
        "HKCategoryTypeIdentifierSleepAnalysis",
        {
          limit: 200,
          ascending: true,
          filter: { startDate: sleepStart, endDate: end },
        }
      );

      let totalHours = 0;
      for (const s of sleepSamples) {
        const v = s.value as number;
        const isAsleep =
          v === CategoryValueSleepAnalysis.asleepCore ||
          v === CategoryValueSleepAnalysis.asleepDeep ||
          v === CategoryValueSleepAnalysis.asleepREM ||
          v === CategoryValueSleepAnalysis.asleepUnspecified;
        if (isAsleep) {
          totalHours +=
            (s.endDate.getTime() - s.startDate.getTime()) / 1000 / 3600;
        }
      }
      if (totalHours > 0) {
        sleepHours = Math.round(totalHours * 10) / 10;
      }
    } catch {
      // No sleep data
    }

    if (hrv === null && restingHr === null && steps === null && sleepHours === null) {
      continue;
    }

    const row: Record<string, unknown> = {
      user_id: userId,
      date: dateStr,
    };
    if (hrv !== null) row.hrv = hrv;
    if (restingHr !== null) row.resting_hr = restingHr;
    if (steps !== null) row.steps = steps;
    if (sleepHours !== null) row.sleep_hours = sleepHours;
    if (i === 0 && latestVo2max !== null) row.vo2max = latestVo2max;

    rows.push(row);
  }

  if (rows.length === 0) return 0;

  const { error } = await supabase
    .from("daily_readiness")
    .upsert(rows, { onConflict: "user_id,date", ignoreDuplicates: false });

  if (error) {
    console.warn("[AppleHealth] wellness upsert error:", error.message);
    return 0;
  }

  return rows.length;
}
