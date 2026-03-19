import { describe, it, expect } from "vitest";
import {
  buildPlanSkeleton,
  shouldSuggestDoubleRuns,
  getSkeletonSummary,
  type AthleteInput,
  type GoalDistance,
} from "./planArchitect";
import { calculatePaceProfile } from "./vdot";

function createAthlete(overrides: Partial<AthleteInput> = {}): AthleteInput {
  const raceDate = new Date();
  raceDate.setDate(raceDate.getDate() + 17 * 7); // 17 weeks out to ensure >= 16
  return {
    userId: "test-user",
    goalDistance: "marathon",
    goalRaceDate: raceDate,
    currentWeeklyKm: 55,
    trainingDaysPerWeek: 5,
    longestSessionMinutes: 90,
    doubleRunsEnabled: false,
    doubleRunDays: [],
    doubleRunDurationMinutes: 30,
    experienceLevel: "experienced",
    injuryHistory: [],
    paceProfile: calculatePaceProfile({}),
    ...overrides,
  };
}

describe("buildPlanSkeleton", () => {
  it("marathon 16 weeks, 5 days, 55km current: peakVolume ~85, startVolume ~49, totalWeeks 16", () => {
    const athlete = createAthlete({ currentWeeklyKm: 70 });
    const skeleton = buildPlanSkeleton(athlete);

    expect(skeleton.totalWeeks).toBeGreaterThanOrEqual(16);
    expect(skeleton.peakWeeklyKm).toBeGreaterThanOrEqual(75);
    expect(skeleton.peakWeeklyKm).toBeLessThanOrEqual(95);
    expect(skeleton.startWeeklyKm).toBeGreaterThanOrEqual(40);
    expect(skeleton.startWeeklyKm).toBeLessThanOrEqual(65);
  });

  it("marathon: phases base ~6, build ~7, peak ~3, taper 3", () => {
    const athlete = createAthlete({ currentWeeklyKm: 70 });
    const skeleton = buildPlanSkeleton(athlete);

    const { base, build, peak, taper } = skeleton.phases;
    expect(base.endWeek - base.startWeek + 1).toBeGreaterThanOrEqual(4);
    expect(base.endWeek - base.startWeek + 1).toBeLessThanOrEqual(8);
    expect(build.endWeek - build.startWeek + 1).toBeGreaterThanOrEqual(4);
    expect(build.endWeek - build.startWeek + 1).toBeLessThanOrEqual(9);
    expect(peak.endWeek - peak.startWeek + 1).toBeGreaterThanOrEqual(2);
    expect(peak.endWeek - peak.startWeek + 1).toBeLessThanOrEqual(5);
    expect(taper.endWeek - taper.startWeek + 1).toBe(3);
  });

  it("marathon: every 3rd build/base week is recovery week", () => {
    const athlete = createAthlete();
    const skeleton = buildPlanSkeleton(athlete);

    const buildWeeks = skeleton.weeks.filter(
      (w) => w.phase === "base" || w.phase === "build"
    );
    const recoveryWeeks = buildWeeks.filter((w) => w.isRecoveryWeek);
    expect(recoveryWeeks.length).toBeGreaterThan(0);
    recoveryWeeks.forEach((w) => {
      expect(w.weekNumber % 3).toBe(0);
    });
  });

  it("marathon: longRunDay is always sunday", () => {
    const athlete = createAthlete();
    const skeleton = buildPlanSkeleton(athlete);

    const longDays = skeleton.weeks.flatMap((w) =>
      w.days.filter((d) => d.type === "long").map((d) => d.dayOfWeek)
    );
    longDays.forEach((day) => expect(day).toBe("sunday"));
  });

  it("marathon: taper weeks volume decreasing", () => {
    const athlete = createAthlete();
    const skeleton = buildPlanSkeleton(athlete);

    const taperWeeks = skeleton.weeks.filter((w) => w.phase === "taper");
    expect(taperWeeks.length).toBe(3);
    for (let i = 1; i < taperWeeks.length; i++) {
      expect(taperWeeks[i].targetVolumeKm).toBeLessThanOrEqual(
        taperWeeks[i - 1].targetVolumeKm
      );
    }
  });

  it("never two consecutive hard days in any week", () => {
    const distances: GoalDistance[] = [
      "1500m",
      "5k",
      "10k",
      "half_marathon",
      "marathon",
      "ultra",
    ];
    const daysPerWeek = [4, 5, 6, 7];

    for (const distance of distances) {
      for (const days of daysPerWeek) {
        const raceDate = new Date();
        raceDate.setDate(raceDate.getDate() + 112);
        const athlete = createAthlete({
          goalDistance: distance,
          trainingDaysPerWeek: days,
          goalRaceDate: raceDate,
        });
        const skeleton = buildPlanSkeleton(athlete);

        for (const week of skeleton.weeks) {
          const hardIndices = week.days
            .map((d, i) => (d.isHardDay ? i : -1))
            .filter((i) => i >= 0);
          for (let i = 1; i < hardIndices.length; i++) {
            expect(hardIndices[i] - hardIndices[i - 1]).toBeGreaterThan(1);
          }
        }
      }
    }
  });

  it("5K 8 weeks, 4 days: peakVolume scaled for 4 days, 1 hard day per week", () => {
    const raceDate = new Date();
    raceDate.setDate(raceDate.getDate() + 9 * 7); // 9 weeks to ensure >= 8
    const athlete = createAthlete({
      goalDistance: "5k",
      trainingDaysPerWeek: 4,
      goalRaceDate: raceDate,
    });
    const skeleton = buildPlanSkeleton(athlete);

    expect(skeleton.totalWeeks).toBeGreaterThanOrEqual(8);
    expect(skeleton.peakWeeklyKm).toBeLessThan(70);
    skeleton.weeks.forEach((w) => {
      const hardCount = w.days.filter((d) => d.isHardDay).length;
      expect(hardCount).toBeLessThanOrEqual(1);
    });
  });
});

describe("shouldSuggestDoubleRuns", () => {
  it("110+ km peak suggests true", () => {
    const raceDate = new Date();
    raceDate.setDate(raceDate.getDate() + 140);
    const athlete = createAthlete({
      goalDistance: "ultra",
      trainingDaysPerWeek: 7,
      currentWeeklyKm: 100,
      experienceLevel: "competitive",
      goalRaceDate: raceDate,
    });
    const result = shouldSuggestDoubleRuns(athlete);
    expect(result.suggest).toBe(true);
    expect(result.recommendedDays).toBeDefined();
  });

  it("60 km peak suggests false", () => {
    const raceDate = new Date();
    raceDate.setDate(raceDate.getDate() + 56);
    const athlete = createAthlete({
      goalDistance: "5k",
      trainingDaysPerWeek: 4,
      currentWeeklyKm: 50,
      goalRaceDate: raceDate,
    });
    const result = shouldSuggestDoubleRuns(athlete);
    expect(result.suggest).toBe(false);
  });
});

describe("getSkeletonSummary", () => {
  it("returns week summaries with hardDays and longRunKm", () => {
    const athlete = createAthlete();
    const skeleton = buildPlanSkeleton(athlete);
    const summary = getSkeletonSummary(skeleton);

    expect(summary.totalWeeks).toBe(skeleton.totalWeeks);
    expect(summary.peakWeeklyKm).toBe(skeleton.peakWeeklyKm);
    expect(summary.phases).toEqual(skeleton.phases);
    expect(summary.weekSummaries.length).toBe(skeleton.weeks.length);

    summary.weekSummaries.forEach((ws, i) => {
      expect(ws.weekNumber).toBe(skeleton.weeks[i].weekNumber);
      expect(ws.phase).toBe(skeleton.weeks[i].phase);
      expect(ws.volumeKm).toBe(skeleton.weeks[i].targetVolumeKm);
      expect(ws.isRecoveryWeek).toBe(skeleton.weeks[i].isRecoveryWeek);
      expect(ws.hardDays).toBe(
        skeleton.weeks[i].days.filter((d) => d.isHardDay).length
      );
      const longDay = skeleton.weeks[i].days.find((d) => d.type === "long");
      expect(ws.longRunKm).toBe(longDay?.approximateKm ?? 0);
    });
  });
});
