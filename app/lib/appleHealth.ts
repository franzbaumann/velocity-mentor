import {
  WorkoutTypeIdentifier,
  WorkoutActivityType,
  CategoryValueSleepAnalysis,
  queryWorkoutSamples,
  queryQuantitySamples,
  queryCategorySamples,
  type ObjectTypeIdentifier,
} from "@kingstinct/react-native-healthkit";
import type { SupabaseClient } from "@supabase/supabase-js";

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    t = setTimeout(() => reject(new Error(`[AppleHealth] timeout: ${label} (${ms}ms)`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => {
    if (t) clearTimeout(t);
  });
}

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
  "HKQuantityTypeIdentifierStepCount",
  "HKQuantityTypeIdentifierVO2Max",
  "HKQuantityTypeIdentifierBodyMass",
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
  // Additional common Apple Watch workout types
  [WorkoutActivityType.soccer]: "Workout",
  [WorkoutActivityType.basketball]: "Workout",
  [WorkoutActivityType.tennis]: "Workout",
  [WorkoutActivityType.badminton]: "Workout",
  [WorkoutActivityType.volleyball]: "Workout",
  [WorkoutActivityType.handball]: "Workout",
  [WorkoutActivityType.golf]: "Workout",
  [WorkoutActivityType.skatingSports]: "Workout",
  [WorkoutActivityType.snowSports]: "Workout",
  [WorkoutActivityType.dance]: "Workout",
  [WorkoutActivityType.mixedCardio]: "Workout",
  [WorkoutActivityType.jumpRope]: "Workout",
  [WorkoutActivityType.boxing]: "Workout",
  [WorkoutActivityType.kickboxing]: "Workout",
  [WorkoutActivityType.martialArts]: "Workout",
  [WorkoutActivityType.mindAndBody]: "Workout",
  [WorkoutActivityType.flexibility]: "Workout",
  [WorkoutActivityType.climbing]: "Workout",
};

function toDateStr(d: Date): string {
  // Use local calendar date (same as getLocalDateString) to avoid UTC off-by-one
  // for users in timezones west of UTC (late-evening workouts would flip to next day).
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
  supabase: SupabaseClient,
  userMaxHr?: number | null
): Promise<{ found: number; synced: number }> {
  const since = new Date();
  since.setFullYear(since.getFullYear() - 1);

  console.log(`[AppleHealth] querying workouts since ${since.toISOString().slice(0, 10)}…`);
  let workouts = await queryWorkoutSamples({
    limit: 500,
    ascending: false,
    filter: { date: { startDate: since } },
  });

  // Fallback: if date-filtered query returns 0, retry without filter
  if (workouts.length === 0) {
    console.log("[AppleHealth] date-filtered query returned 0 — retrying without filter");
    workouts = await queryWorkoutSamples({ limit: 500, ascending: false });
  }

  const rows: Record<string, unknown>[] = [];

  console.log(`[AppleHealth] found ${workouts.length} workouts in HealthKit`);
  const typeCounts: Record<string, number> = {};
  for (const w of workouts) {
    const key = String(w.workoutActivityType);
    typeCounts[key] = (typeCounts[key] ?? 0) + 1;
  }
  if (workouts.length > 0) {
    console.log("[AppleHealth] workout types:", JSON.stringify(typeCounts));
  }

  for (const w of workouts) {
    // Fall back to "Workout" for unrecognized types so nothing is silently dropped
    const activityType = WORKOUT_TYPE_MAP[w.workoutActivityType] ?? "Workout";

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

    // Calories (kcal) from Apple Health totalEnergyBurned
    const calories = w.totalEnergyBurned?.quantity
      ? Math.round(w.totalEnergyBurned.quantity)
      : null;

    const elevationGain = w.metadataElevationAscended?.quantity ?? null;
    const durationSec = Math.round(w.duration.quantity);

    // Compute avg pace (min/km) for distance-based activities
    let avgPace: string | null = null;
    if (distanceKm && distanceKm > 0 && durationSec > 0) {
      const paceMinPerKm = durationSec / 60 / distanceKm;
      if (paceMinPerKm >= 2 && paceMinPerKm <= 25) {
        const mins = Math.floor(paceMinPerKm);
        const secs = Math.round((paceMinPerKm - mins) * 60);
        avgPace = `${mins}:${String(secs).padStart(2, "0")}`;
      }
    }

    rows.push({
      user_id: userId,
      external_id: w.uuid,
      date: toDateStr(w.startDate),
      type: activityType,
      name: activityType,
      distance_km: distanceKm,
      duration_seconds: durationSec,
      avg_hr: avgHr,
      max_hr: maxHr,
      avg_pace: avgPace,
      elevation_gain: elevationGain ? Math.round(elevationGain) : null,
      calories,
      source: "apple_health",
    });
  }

  if (rows.length === 0) return { found: workouts.length, synced: 0 };

  const { error } = await supabase
    .from("activity")
    .upsert(rows, { onConflict: "user_id,external_id", ignoreDuplicates: false });

  if (error) {
    console.warn("[AppleHealth] activities upsert error:", error.message);
    return { found: workouts.length, synced: 0 };
  }

  return { found: workouts.length, synced: rows.length };
}

// HR zone thresholds as fraction of max HR
const HR_ZONE_THRESHOLDS = [0.6, 0.7, 0.8, 0.9];

function computeHrZoneTimes(
  hrSamples: { startDate: Date; endDate: Date; quantity: number }[],
  maxHr = 190
): [number, number, number, number, number] {
  const zones: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  const effectiveMaxHr = maxHr > 0 ? maxHr : 190;
  // HR samples are point measurements — use inter-sample gap as the duration held at each HR
  for (let i = 0; i < hrSamples.length; i++) {
    const s = hrSamples[i]!;
    const next = hrSamples[i + 1];
    // Duration = time until next sample (or self-duration as fallback for last sample)
    const durSec = next
      ? (next.startDate.getTime() - s.startDate.getTime()) / 1000
      : Math.max(1, (s.endDate.getTime() - s.startDate.getTime()) / 1000);
    if (durSec <= 0 || durSec > 120) continue; // skip gaps > 2 min (pauses)
    const pct = s.quantity / effectiveMaxHr;
    let zone = 0;
    for (let z = 0; z < HR_ZONE_THRESHOLDS.length; z++) {
      if (pct >= HR_ZONE_THRESHOLDS[z]) zone = z + 1;
    }
    zones[zone] += durSec;
  }
  return zones;
}

/**
 * For each workout in the last 365 days that does NOT already have streams in the DB,
 * fetches HR (and optionally pace) samples from Apple Health and upserts them into
 * `activity_streams`. Also updates `hr_zone_times` on the `activity` row.
 *
 * Skips workouts that already have streams to avoid thousands of redundant HealthKit queries.
 */
export async function syncAppleHealthStreams(
  userId: string,
  supabase: SupabaseClient,
  userMaxHr?: number | null
): Promise<number> {
  const since = new Date();
  since.setFullYear(since.getFullYear() - 1);

  let workouts = await queryWorkoutSamples({
    limit: 500,
    ascending: false,
    filter: { date: { startDate: since } },
  });
  if (workouts.length === 0) {
    workouts = await queryWorkoutSamples({ limit: 500, ascending: false });
  }

  if (workouts.length === 0) return 0;

  // Fetch existing stream activity_ids so we can skip workouts that are already synced
  const { data: existingStreams } = await supabase
    .from("activity_streams")
    .select("activity_id")
    .eq("user_id", userId);
  const existingIds = new Set((existingStreams ?? []).map((r) => (r as { activity_id: string }).activity_id));

  const newWorkouts = workouts.filter((w) => !existingIds.has(w.uuid));
  console.log(`[AppleHealth] streams: ${workouts.length} total workouts, ${newWorkouts.length} need streams`);

  if (newWorkouts.length === 0) return 0;

  let synced = 0;

  for (const w of newWorkouts) {
    try {
      // Fetch HR samples during this workout
      const hrSamples = await queryQuantitySamples(
        "HKQuantityTypeIdentifierHeartRate",
        {
          limit: 10000,
          ascending: true,
          unit: "count/min",
          filter: { date: { startDate: w.startDate, endDate: w.endDate } },
        }
      );

      if (hrSamples.length === 0) continue;

      const workoutStart = w.startDate.getTime();
      const timeArr: number[] = hrSamples.map((s) =>
        Math.round((s.startDate.getTime() - workoutStart) / 1000)
      );
      const hrArr: number[] = hrSamples.map((s) => Math.round(s.quantity));

      // Fetch pace/speed samples for runs and walks
      let paceArr: number[] | null = null;
      try {
        const speedSamples = await queryQuantitySamples(
          "HKQuantityTypeIdentifierRunningSpeed",
          {
            limit: 10000,
            ascending: true,
            unit: "m/s",
            filter: { date: { startDate: w.startDate, endDate: w.endDate } },
          }
        );
        if (speedSamples.length > 0) {
          const speedByTime: { t: number; pace: number }[] = speedSamples
            .map((s) => ({
              t: Math.round((s.startDate.getTime() - workoutStart) / 1000),
              pace: s.quantity > 0 ? (1000 / s.quantity) / 60 : 0,
            }))
            .filter((s) => s.pace > 0);

          if (speedByTime.length > 0) {
            paceArr = timeArr.map((t) => {
              if (t <= speedByTime[0].t) {
                return Math.abs(t - speedByTime[0].t) <= 30 ? speedByTime[0].pace : 0;
              }
              if (t >= speedByTime[speedByTime.length - 1].t) {
                return Math.abs(t - speedByTime[speedByTime.length - 1].t) <= 30
                  ? speedByTime[speedByTime.length - 1].pace
                  : 0;
              }
              for (let j = 0; j < speedByTime.length - 1; j++) {
                const a = speedByTime[j];
                const b = speedByTime[j + 1];
                if (t >= a.t && t <= b.t) {
                  if (b.t - a.t > 60) {
                    const nearA = Math.abs(t - a.t);
                    const nearB = Math.abs(t - b.t);
                    return Math.min(nearA, nearB) <= 30 ? (nearA <= nearB ? a.pace : b.pace) : 0;
                  }
                  const dt = b.t - a.t;
                  if (dt === 0) return a.pace;
                  const frac = (t - a.t) / dt;
                  return a.pace + frac * (b.pace - a.pace);
                }
              }
              return 0;
            });
          }
        }
      } catch {
        // pace not available
      }

      // Fetch cadence from step count using 30-second rolling windows
      let cadenceArr: number[] | null = null;
      try {
        const stepSamples = await queryQuantitySamples(
          "HKQuantityTypeIdentifierStepCount",
          {
            limit: 10000,
            ascending: true,
            unit: "count",
            filter: { date: { startDate: w.startDate, endDate: w.endDate } },
          }
        );
        if (stepSamples.length > 0) {
          const steps = stepSamples.map((s) => ({
            sMs: s.startDate.getTime(),
            eMs: s.endDate.getTime(),
            qty: s.quantity,
          }));
          const WINDOW_MS = 30_000;
          const wStart = w.startDate.getTime();
          cadenceArr = timeArr.map((t) => {
            const centreMs = wStart + t * 1000;
            const winStart = centreMs - WINDOW_MS / 2;
            const winEnd = centreMs + WINDOW_MS / 2;
            let totalSteps = 0;
            let coveredMs = 0;
            for (const st of steps) {
              const ov0 = Math.max(st.sMs, winStart);
              const ov1 = Math.min(st.eMs, winEnd);
              if (ov1 <= ov0) continue;
              const dur = st.eMs - st.sMs;
              const frac = dur > 0 ? (ov1 - ov0) / dur : 1;
              totalSteps += st.qty * frac;
              coveredMs += ov1 - ov0;
            }
            const coveredSec = coveredMs / 1000;
            if (coveredSec < 5) return 0;
            const spm = Math.round(totalSteps / coveredSec * 60);
            return spm >= 60 && spm <= 230 ? spm : 0;
          });
        }
      } catch {
        // cadence not available
      }

      // Fetch altitude samples (barometric, iOS 15+ / watchOS 8+)
      let altitudeArr: number[] | null = null;
      try {
        const altSamples = await queryQuantitySamples(
          "HKQuantityTypeIdentifierElevation" as Parameters<typeof queryQuantitySamples>[0],
          {
            limit: 10000,
            ascending: true,
            unit: "m",
            filter: { date: { startDate: w.startDate, endDate: w.endDate } },
          }
        );
        if (altSamples.length > 0) {
          const altByTime = altSamples.map((s) => ({
            t: Math.round((s.startDate.getTime() - workoutStart) / 1000),
            alt: s.quantity,
          }));
          altitudeArr = timeArr.map((t) => {
            const closest = altByTime.reduce((a, b) =>
              Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a
            );
            return Math.abs(closest.t - t) <= 60 ? Math.round(closest.alt * 10) / 10 : 0;
          });
        }
      } catch {
        // Altitude not available on this device/OS version
      }

      const streamRow: Record<string, unknown> = {
        user_id: userId,
        activity_id: w.uuid,
        time: timeArr,
        heartrate: hrArr,
      };
      if (paceArr) streamRow.pace = paceArr;
      if (cadenceArr && cadenceArr.length > 0) streamRow.cadence = cadenceArr;
      if (altitudeArr && altitudeArr.some((v) => v !== 0)) streamRow.altitude = altitudeArr;

      const { error: streamErr } = await supabase
        .from("activity_streams")
        .upsert(streamRow, { onConflict: "user_id,activity_id" });

      if (streamErr) {
        console.warn("[AppleHealth] stream upsert error:", streamErr.message);
        continue;
      }

      // Compute HR zone times and update the activity row
      const zoneTimes = computeHrZoneTimes(
        Array.from(hrSamples) as unknown as { startDate: Date; endDate: Date; quantity: number }[],
        userMaxHr ?? undefined
      );
      // Edwards TRIMP from zone times: z1×1 + z2×2 + z3×3 + z4×4 + z5×5 (minutes)
      const trimp = Math.round((zoneTimes[0] * 1 + zoneTimes[1] * 2 + zoneTimes[2] * 3 + zoneTimes[3] * 4 + zoneTimes[4] * 5) / 60 * 10) / 10;
      await supabase
        .from("activity")
        .update({ hr_zone_times: zoneTimes, trimp: trimp > 0 ? trimp : null })
        .eq("user_id", userId)
        .eq("external_id", w.uuid);

      synced++;
    } catch (err) {
      console.warn("[AppleHealth] stream sync error for workout", w.uuid, err);
    }
  }

  console.log(`[AppleHealth] synced ${synced} new workout streams`);
  return synced;
}

/**
 * Reads daily wellness data from Apple Health (last 365 days) and upserts
 * into the `daily_readiness` table. Only writes Apple Health fields —
 * does NOT overwrite CTL/ATL/TSB from intervals.icu.
 *
 * Uses bulk fetches (one query per metric for the entire window) instead of
 * per-day queries, reducing HealthKit calls to ~7.
 */
export async function syncAppleHealthWellness(
  userId: string,
  supabase: SupabaseClient
): Promise<number> {
  const DAYS = 365;
  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - DAYS);
  windowStart.setHours(0, 0, 0, 0);
  const windowEnd = dayEnd(now);

  // Pre-build date list (newest first, like the old loop)
  const dates: string[] = [];
  for (let i = 0; i < DAYS; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push(toDateStr(d));
  }

  // --- Bulk fetch all metrics for the entire 90-day window ---
  const hrvByDate = new Map<string, number[]>();
  const rhrByDate = new Map<string, number>();
  const stepsByDate = new Map<string, number>();
  const weightByDate = new Map<string, number>();
  const vo2maxByDate = new Map<string, number>();
  let latestVo2max: number | null = null;

  // Sleep data per wake-up day
  const sleepByDate = new Map<string, { totalH: number; inBedH: number; deepH: number; remH: number }>();

  const bulkFetches = await Promise.allSettled([
    // 1. HRV samples (bulk) — ~1-3 per day = ~365-1100/year
    queryQuantitySamples(
      "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
      { limit: 5000, ascending: true, unit: "ms", filter: { date: { startDate: windowStart, endDate: windowEnd } } }
    ),
    // 2. Resting HR samples (bulk) — ~1 per day = ~365/year
    queryQuantitySamples(
      "HKQuantityTypeIdentifierRestingHeartRate",
      { limit: 5000, ascending: true, unit: "count/min", filter: { date: { startDate: windowStart, endDate: windowEnd } } }
    ),
    // 3. Step count samples (bulk) — ~50-100 per day = ~18k-36k/year
    queryQuantitySamples(
      "HKQuantityTypeIdentifierStepCount",
      { limit: 50000, ascending: true, unit: "count", filter: { date: { startDate: windowStart, endDate: windowEnd } } }
    ),
    // 4. Weight samples (bulk) — infrequent, ~1-2 per week
    queryQuantitySamples(
      "HKQuantityTypeIdentifierBodyMass",
      { limit: 2000, ascending: true, unit: "kg", filter: { date: { startDate: windowStart, endDate: windowEnd } } }
    ),
    // 5. VO2max samples (bulk) — ~1-2 per week from runs
    queryQuantitySamples(
      "HKQuantityTypeIdentifierVO2Max",
      { limit: 500, ascending: true, unit: "ml/kg/min", filter: { date: { startDate: windowStart, endDate: windowEnd } } }
    ),
    // 6. Sleep samples (bulk) — ~10-20 per night = ~3.5k-7k/year
    (() => {
      const sleepStart = new Date(windowStart);
      sleepStart.setDate(sleepStart.getDate() - 1);
      sleepStart.setHours(12, 0, 0, 0);
      return queryCategorySamples(
        "HKCategoryTypeIdentifierSleepAnalysis",
        { limit: 20000, ascending: true, filter: { date: { startDate: sleepStart, endDate: windowEnd } } }
      );
    })(),
  ]);

  // --- Log bulk fetch results ---
  const labels = ["HRV", "RestingHR", "Steps", "Weight", "VO2max", "Sleep"];
  let totalSamples = 0;
  let failedCount = 0;
  for (let i = 0; i < bulkFetches.length; i++) {
    const r = bulkFetches[i];
    if (r.status === "fulfilled") {
      const count = (r.value as unknown[]).length;
      totalSamples += count;
      console.log(`[AppleHealth] wellness ${labels[i]}: ${count} samples`);
    } else {
      failedCount++;
      console.warn(`[AppleHealth] wellness ${labels[i]}: FAILED — ${r.reason}`);
    }
  }
  console.log(`[AppleHealth] wellness totals: ${totalSamples} samples fetched, ${failedCount} queries failed`);

  // If all queries failed or returned 0, try a single unfiltered query as diagnostic
  if (totalSamples === 0 && failedCount === 0) {
    console.log("[AppleHealth] wellness: all queries returned 0 samples — HealthKit may have no data or permissions may be missing");
  }

  // --- Distribute bulk samples into per-day maps ---

  // HRV: average per day
  if (bulkFetches[0].status === "fulfilled") {
    for (const s of bulkFetches[0].value) {
      const d = toDateStr(s.startDate);
      const arr = hrvByDate.get(d) ?? [];
      arr.push(s.quantity);
      hrvByDate.set(d, arr);
    }
  }

  // Resting HR: keep lowest per day (most accurate)
  if (bulkFetches[1].status === "fulfilled") {
    for (const s of bulkFetches[1].value) {
      const d = toDateStr(s.startDate);
      const v = Math.round(s.quantity);
      const existing = rhrByDate.get(d);
      if (existing == null || v < existing) rhrByDate.set(d, v);
    }
  }

  // Steps: sum per day
  if (bulkFetches[2].status === "fulfilled") {
    for (const s of bulkFetches[2].value) {
      const d = toDateStr(s.startDate);
      stepsByDate.set(d, (stepsByDate.get(d) ?? 0) + s.quantity);
    }
  }

  // Weight: most recent per day (ascending order → last write wins)
  if (bulkFetches[3].status === "fulfilled") {
    for (const s of bulkFetches[3].value) {
      const kg = s.quantity;
      if (kg >= 30 && kg <= 300) {
        weightByDate.set(toDateStr(s.startDate), Math.round(kg * 10) / 10);
      }
    }
  }

  // VO2max: per day + carry-forward
  if (bulkFetches[4].status === "fulfilled") {
    for (const s of bulkFetches[4].value) {
      const v = Math.round(s.quantity * 10) / 10;
      vo2maxByDate.set(toDateStr(s.startDate), v);
      latestVo2max = v;
    }
  }

  // Sleep: assign to wake-up day (endDate)
  if (bulkFetches[5].status === "fulfilled") {
    for (const s of bulkFetches[5].value) {
      const wakeDay = toDateStr(s.endDate);
      const v = s.value as number;
      const durationH = (s.endDate.getTime() - s.startDate.getTime()) / 1000 / 3600;
      const entry = sleepByDate.get(wakeDay) ?? { totalH: 0, inBedH: 0, deepH: 0, remH: 0 };

      if (v === CategoryValueSleepAnalysis.asleepDeep) {
        entry.totalH += durationH;
        entry.deepH += durationH;
      } else if (v === CategoryValueSleepAnalysis.asleepREM) {
        entry.totalH += durationH;
        entry.remH += durationH;
      } else if (
        v === CategoryValueSleepAnalysis.asleepCore ||
        v === CategoryValueSleepAnalysis.asleepUnspecified
      ) {
        entry.totalH += durationH;
      } else if (v === CategoryValueSleepAnalysis.inBed) {
        entry.inBedH += durationH;
      }
      sleepByDate.set(wakeDay, entry);
    }
  }

  // Log today's sleep for debugging
  const todayStr = dates[0];
  const todaySleep = sleepByDate.get(todayStr);
  if (todaySleep) {
    console.log(`[AppleHealth] today sleep: total=${todaySleep.totalH.toFixed(2)}h (deep=${todaySleep.deepH.toFixed(2)}h rem=${todaySleep.remH.toFixed(2)}h) inBed=${todaySleep.inBedH.toFixed(2)}h`);
  }

  // --- Build rows from per-day maps ---
  const rows: Record<string, unknown>[] = [];

  for (let i = 0; i < dates.length; i++) {
    const dateStr = dates[i];

    // HRV: daily average
    const hrvSamples = hrvByDate.get(dateStr);
    const hrv = hrvSamples && hrvSamples.length > 0
      ? Math.round((hrvSamples.reduce((a, b) => a + b, 0) / hrvSamples.length) * 10) / 10
      : null;

    const restingHr = rhrByDate.get(dateStr) ?? null;

    const rawSteps = stepsByDate.get(dateStr);
    const steps = rawSteps != null ? Math.round(rawSteps) : null;

    const weight = weightByDate.get(dateStr) ?? null;

    // Sleep score
    let sleepHours: number | null = null;
    let sleepScore: number | null = null;
    const sleep = sleepByDate.get(dateStr);
    if (sleep) {
      const rawHours = sleep.totalH > 0 ? sleep.totalH : sleep.inBedH;
      if (rawHours > 0.5 && rawHours <= 14) {
        sleepHours = Math.round(rawHours * 10) / 10;
        const durationScore = Math.min(100, (sleepHours / 8) * 100);
        const hasStages = sleep.totalH > 0 && (sleep.deepH > 0 || sleep.remH > 0);
        const qualityBonus = hasStages
          ? (() => {
              const ratio = (sleep.deepH + sleep.remH) / sleep.totalH;
              return ratio >= 0.45 ? 10 : ratio >= 0.30 ? 5 : ratio < 0.15 ? -5 : 0;
            })()
          : 0;
        sleepScore = Math.round(Math.min(100, Math.max(0, durationScore + qualityBonus)));
      }
    }

    if (hrv === null && restingHr === null && steps === null && sleepHours === null && weight === null) {
      continue;
    }

    const row: Record<string, unknown> = { user_id: userId, date: dateStr };
    if (hrv !== null) row.hrv = hrv;
    if (restingHr !== null) row.resting_hr = restingHr;
    if (steps !== null) row.steps = steps;
    if (sleepHours !== null) row.sleep_hours = sleepHours;
    if (sleepScore !== null) row.sleep_score = sleepScore;
    if (weight !== null) row.weight = weight;
    const dayVo2 = vo2maxByDate.get(dateStr) ?? (i === 0 ? latestVo2max : null);
    if (dayVo2 !== null) row.vo2max = dayVo2;

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

/**
 * Fetches HR, pace, and cadence streams for a single workout from Apple Health
 * and saves them to activity_streams. Used for on-demand fetching when viewing
 * an activity detail that has no cached streams yet.
 */
export async function fetchAndSaveWorkoutStreams(
  workoutUUID: string,
  startDate: Date,
  endDate: Date,
  userId: string,
  supabase: SupabaseClient,
  userMaxHr?: number | null
): Promise<{ time: number[]; heartrate: number[]; pace: number[]; cadence: number[]; altitude: number[] } | null> {
  const hrSamples = await withTimeout(
    queryQuantitySamples("HKQuantityTypeIdentifierHeartRate", {
      limit: 10000,
      ascending: true,
      unit: "count/min",
      filter: { date: { startDate, endDate } },
    }),
    15000,
    "queryQuantitySamples(HeartRate)"
  );

  if (hrSamples.length === 0) return null;

  const workoutStart = startDate.getTime();
  const workoutDurationSec = (endDate.getTime() - workoutStart) / 1000;

  // Build time array (seconds since workout start), clamped to workout window
  const rawTime = hrSamples.map((s) =>
    Math.round((s.startDate.getTime() - workoutStart) / 1000)
  );
  const rawHr = hrSamples.map((s) => Math.round(s.quantity));

  // Trim post-workout artifacts: remove trailing samples where HR drops
  // sharply below 70 bpm (resting HR territory after stopping)
  let trimEnd = rawHr.length;
  for (let i = rawHr.length - 1; i > Math.floor(rawHr.length * 0.9); i--) {
    const drop = (rawHr[i - 1] ?? 0) - (rawHr[i] ?? 0);
    if ((rawHr[i] ?? 0) < 70 && drop > 20) {
      trimEnd = i;
    } else {
      break;
    }
  }
  const timeArr = rawTime.slice(0, trimEnd);
  const hrArr = rawHr.slice(0, trimEnd);

  // --- Pace from running speed (aligned to HR timeline) ---
  let paceArr: number[] = [];
  try {
    const speedSamples = await withTimeout(
      queryQuantitySamples("HKQuantityTypeIdentifierRunningSpeed", {
        limit: 10000,
        ascending: true,
        unit: "m/s",
        filter: { date: { startDate, endDate } },
      }),
      15000,
      "queryQuantitySamples(RunningSpeed)"
    );
    if (speedSamples.length > 0) {
      // Map each speed sample to its time offset and pace value
      const speedByTime: { t: number; pace: number }[] = speedSamples
        .map((s) => ({
          t: Math.round((s.startDate.getTime() - workoutStart) / 1000),
          pace: s.quantity > 0 ? (1000 / s.quantity) / 60 : 0, // min/km
        }))
        .filter((s) => s.pace > 0);

      // Linear interpolation onto the HR timeline
      paceArr = timeArr.map((t) => {
        if (speedByTime.length === 0) return 0;
        // Before first speed sample or after last — use nearest if within 30s
        if (t <= speedByTime[0].t) {
          return Math.abs(t - speedByTime[0].t) <= 30 ? speedByTime[0].pace : 0;
        }
        if (t >= speedByTime[speedByTime.length - 1].t) {
          return Math.abs(t - speedByTime[speedByTime.length - 1].t) <= 30
            ? speedByTime[speedByTime.length - 1].pace
            : 0;
        }
        // Find bracketing samples and linearly interpolate
        for (let i = 0; i < speedByTime.length - 1; i++) {
          const a = speedByTime[i];
          const b = speedByTime[i + 1];
          if (t >= a.t && t <= b.t) {
            // Skip interpolation across large gaps (> 60s between samples)
            if (b.t - a.t > 60) {
              const nearA = Math.abs(t - a.t);
              const nearB = Math.abs(t - b.t);
              return Math.min(nearA, nearB) <= 30 ? (nearA <= nearB ? a.pace : b.pace) : 0;
            }
            const dt2 = b.t - a.t;
            if (dt2 === 0) return a.pace;
            const frac = (t - a.t) / dt2;
            return a.pace + frac * (b.pace - a.pace);
          }
        }
        return 0;
      });
    }
  } catch {}

  // --- Cadence from step count (30-second rolling window centred on each HR point) ---
  let cadenceArr: number[] = [];
  try {
    const stepSamples = await withTimeout(
      queryQuantitySamples("HKQuantityTypeIdentifierStepCount", {
        limit: 10000,
        ascending: true,
        unit: "count",
        filter: { date: { startDate, endDate } },
      }),
      15000,
      "queryQuantitySamples(StepCount)"
    );
    if (stepSamples.length > 0) {
      // Pre-compute step sample time offsets
      const steps: { sMs: number; eMs: number; qty: number }[] = stepSamples.map((s) => ({
        sMs: s.startDate.getTime(),
        eMs: s.endDate.getTime(),
        qty: s.quantity,
      }));

      const WINDOW_MS = 30_000; // 30-second window
      cadenceArr = timeArr.map((t) => {
        const centreMs = workoutStart + t * 1000;
        const winStart = centreMs - WINDOW_MS / 2;
        const winEnd = centreMs + WINDOW_MS / 2;

        let totalSteps = 0;
        let coveredMs = 0;
        for (const st of steps) {
          const overlapStart = Math.max(st.sMs, winStart);
          const overlapEnd = Math.min(st.eMs, winEnd);
          if (overlapEnd <= overlapStart) continue;
          const sampleDurMs = st.eMs - st.sMs;
          const frac = sampleDurMs > 0 ? (overlapEnd - overlapStart) / sampleDurMs : 1;
          totalSteps += st.qty * frac;
          coveredMs += overlapEnd - overlapStart;
        }

        const coveredSec = coveredMs / 1000;
        if (coveredSec < 5) return 0;
        const spm = Math.round(totalSteps / coveredSec * 60);
        // Filter implausible cadence (valid running: 100-230 spm, walking: 60-130)
        return spm >= 60 && spm <= 230 ? spm : 0;
      });
    }
  } catch {}

  // --- Altitude from barometric elevation (iOS 15+ / watchOS 8+) ---
  let altitudeArr: number[] = [];
  try {
    const altSamples = await withTimeout(
      queryQuantitySamples(
        "HKQuantityTypeIdentifierElevation" as Parameters<typeof queryQuantitySamples>[0],
        {
          limit: 10000,
          ascending: true,
          unit: "m",
          filter: { date: { startDate, endDate } },
        }
      ),
      10000,
      "queryQuantitySamples(Elevation)"
    );
    if (altSamples.length > 0) {
      const altByTime = altSamples.map((s) => ({
        t: Math.round((s.startDate.getTime() - workoutStart) / 1000),
        alt: s.quantity,
      }));
      altitudeArr = timeArr.map((t) => {
        const closest = altByTime.reduce((a, b) =>
          Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a
        );
        return Math.abs(closest.t - t) <= 60 ? Math.round(closest.alt * 10) / 10 : 0;
      });
    }
  } catch {
    // Altitude not available on this device/OS version
  }

  const streamRow: Record<string, unknown> = {
    user_id: userId,
    activity_id: workoutUUID,
    time: timeArr,
    heartrate: hrArr,
  };
  if (paceArr.some((v) => v > 0)) streamRow.pace = paceArr;
  if (cadenceArr.some((v) => v > 0)) streamRow.cadence = cadenceArr;
  if (altitudeArr.some((v) => v !== 0)) streamRow.altitude = altitudeArr;

  const { error } = await supabase
    .from("activity_streams")
    .upsert(streamRow, { onConflict: "user_id,activity_id" });

  if (error) {
    console.warn("[AppleHealth] fetchAndSaveWorkoutStreams upsert error:", error.message);
    // Return data in-memory even if DB save fails, so the chart still shows
  }

  // Update HR zone times + TRIMP on the activity row
  const zoneTimes = computeHrZoneTimes(
    Array.from(hrSamples.slice(0, trimEnd)) as unknown as {
      startDate: Date;
      endDate: Date;
      quantity: number;
    }[],
    userMaxHr ?? undefined
  );
  const trimp = Math.round((zoneTimes[0] * 1 + zoneTimes[1] * 2 + zoneTimes[2] * 3 + zoneTimes[3] * 4 + zoneTimes[4] * 5) / 60 * 10) / 10;
  await supabase
    .from("activity")
    .update({ hr_zone_times: zoneTimes, trimp: trimp > 0 ? trimp : null })
    .eq("user_id", userId)
    .eq("external_id", workoutUUID);

  console.log(
    `[AppleHealth] on-demand streams: ${hrArr.length} HR pts, ${paceArr.filter(Boolean).length} pace pts, ${cadenceArr.filter(Boolean).length} cadence pts, ${altitudeArr.filter(Boolean).length} alt pts, duration=${Math.round(workoutDurationSec)}s`
  );

  return { time: timeArr, heartrate: hrArr, pace: paceArr, cadence: cadenceArr, altitude: altitudeArr };
}
