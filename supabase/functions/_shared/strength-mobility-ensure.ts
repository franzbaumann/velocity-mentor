/** Parsers + post-process: ensure strength/mobility blocks match onboarding caps without stealing run days from the athlete. */

export function parseDaysPerWeekFromAnswers(answers: Record<string, unknown>): number {
  const v = answers.daysPerWeek;
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(7, Math.round(v)));
}

export function parseStrengthMobilityCapsFromAnswers(answers: Record<string, unknown>): {
  strength: number;
  mobility: number;
} {
  const defS = 2;
  const defM = 2;
  let s = typeof answers.strengthSessionsPerWeekCap === "number" ? answers.strengthSessionsPerWeekCap : defS;
  let m = typeof answers.mobilitySessionsPerWeekCap === "number" ? answers.mobilitySessionsPerWeekCap : defM;
  if (!Number.isFinite(s)) s = defS;
  if (!Number.isFinite(m)) m = defM;
  return {
    strength: Math.max(0, Math.min(3, Math.round(s))),
    mobility: Math.max(0, Math.min(5, Math.round(m))),
  };
}

const QUALITY_TYPES = new Set(["tempo", "interval", "race", "strides", "threshold"]);

function normType(t: string | undefined): string {
  return String(t ?? "").toLowerCase();
}

export type EnsureWeekWorkout = {
  type: string;
  session_library_id?: string | null;
  day_of_week?: number;
  name?: string;
  description?: string;
  distance_km?: number;
  duration_minutes?: number;
  is_double_run?: boolean;
};

export type EnsurePlanWeek = {
  phase: string;
  workouts: EnsureWeekWorkout[];
};

/** Adds strength and mobility up to onboarding caps if the AI omitted them. Only adds rows — never removes runs. */
export function ensureStrengthMobilitySessions(
  weeks: EnsurePlanWeek[],
  answers: Record<string, unknown>,
): void {
  const caps = parseStrengthMobilityCapsFromAnswers(answers);
  const dpw = parseDaysPerWeekFromAnswers(answers);
  const highFreq = dpw >= 6;

  const targetStrengthForPhase = (phase: string): number => {
    if (caps.strength === 0) return 0;
    if (phase === "taper") return Math.min(1, caps.strength);
    return caps.strength;
  };

  const targetMobilityForPhase = (phase: string): number => {
    if (caps.mobility === 0) return 0;
    if (phase === "taper") return Math.min(1, caps.mobility);
    return caps.mobility;
  };

  const dayHasNonQualityRun = (wk: Array<{ type: string; day_of_week?: number }>, d: number): boolean =>
    wk.some(
      (w) =>
        w.day_of_week === d &&
        (normType(w.type) === "easy" || normType(w.type) === "long" || normType(w.type) === "recovery"),
    );

  for (const week of weeks) {
    const workouts = week.workouts;
    const phase = week.phase ?? "base";

    const qualityDays = new Set(
      workouts
        .filter((w) => QUALITY_TYPES.has(normType(w.type)))
        .map((w) => w.day_of_week)
        .filter((d): d is number => d != null),
    );

    const targetStrength = targetStrengthForPhase(phase);
    while (workouts.filter((w) => normType(w.type) === "strength").length < targetStrength) {
      const usedStrengthDays = new Set(
        workouts
          .filter((w) => normType(w.type) === "strength")
          .map((w) => w.day_of_week)
          .filter((d): d is number => d != null),
      );
      const strengthDay = [2, 4, 3, 5, 6].find((d) => {
        if (qualityDays.has(d) || usedStrengthDays.has(d)) return false;
        if (highFreq) return dayHasNonQualityRun(workouts, d);
        return workouts.some(
          (w) =>
            w.day_of_week === d &&
            (normType(w.type) === "easy" || normType(w.type) === "long" || normType(w.type) === "recovery"),
        );
      });
      if (strengthDay == null) break;
      const isPeak = phase === "peak" || phase === "taper";
      workouts.push({
        type: "strength",
        session_library_id: isPeak ? "str-02" : "str-01",
        day_of_week: strengthDay,
        name: isPeak ? "Runner Strength Maintenance" : "Runner Strength Foundation",
        description: isPeak
          ? "20-30 min maintenance strength: lateral band walks, single-leg calf raise, glute bridge, dead bug, hip flexor stretch"
          : "30-40 min runner-specific strength: single-leg deadlift 3×8, Bulgarian split squat 3×8, hip thrust 3×12, Copenhagen plank 3×20s, soleus raise 3×15",
        distance_km: 0,
        duration_minutes: isPeak ? 25 : 35,
        is_double_run: false,
      });
    }

    const targetMobility = targetMobilityForPhase(phase);
    while (workouts.filter((w) => normType(w.type) === "mobility").length < targetMobility) {
      const usedMobilityDays = new Set(
        workouts
          .filter((w) => normType(w.type) === "mobility")
          .map((w) => w.day_of_week)
          .filter((d): d is number => d != null),
      );
      const strengthDays = new Set(
        workouts
          .filter((w) => normType(w.type) === "strength")
          .map((w) => w.day_of_week)
          .filter((d): d is number => d != null),
      );
      const blockStrengthDayForMobility = !highFreq;

      const order = [4, 3, 5, 6, 2, 7, 1];
      let mobilityDay = order.find(
        (d) =>
          !qualityDays.has(d) &&
          !usedMobilityDays.has(d) &&
          (!blockStrengthDayForMobility || !strengthDays.has(d)) &&
          dayHasNonQualityRun(workouts, d),
      );

      if (mobilityDay == null) {
        const restDay = workouts.find(
          (w) =>
            normType(w.type) === "rest" &&
            w.day_of_week != null &&
            !qualityDays.has(w.day_of_week) &&
            !usedMobilityDays.has(w.day_of_week) &&
            (!blockStrengthDayForMobility || !strengthDays.has(w.day_of_week)),
        )?.day_of_week;
        mobilityDay =
          restDay ??
          order.find(
            (d) =>
              !qualityDays.has(d) &&
              !usedMobilityDays.has(d) &&
              (!blockStrengthDayForMobility || !strengthDays.has(d)) &&
              workouts.some((w) => w.day_of_week === d && normType(w.type) === "easy"),
          );
      }

      if (mobilityDay == null) break;

      workouts.push({
        type: "mobility",
        session_library_id: "mob-01",
        day_of_week: mobilityDay,
        name: "Post-Run Mobility",
        description:
          "~20 min post-run: hip flexors, hamstrings, calves, thoracic — light, not a separate rest-day workout",
        distance_km: 0,
        duration_minutes: 20,
        is_double_run: false,
      });
    }
  }
}
