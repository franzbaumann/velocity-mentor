import { describe, expect, it } from "vitest";
import { getFallbackPhilosophy, mapOnboardingAnswersToIntake } from "./onboarding-plan";

describe("shared/onboarding-plan", () => {
  it("recommends 80/20 for low mileage", () => {
    const rec = getFallbackPhilosophy({ weeklyKm: 10 });
    expect(rec.primary.philosophy).toBe("80_20_polarized");
    expect(rec.alternatives.length).toBeGreaterThan(0);
  });

  it("recommends Daniels mid mileage", () => {
    const rec = getFallbackPhilosophy({ weeklyKm: 45 });
    expect(rec.primary.philosophy).toBe("jack_daniels");
  });

  it("recommends Lydiard high mileage", () => {
    const rec = getFallbackPhilosophy({ weeklyKm: 80 });
    expect(rec.primary.philosophy).toBe("lydiard");
  });

  it("prioritizes injuries over volume", () => {
    const rec = getFallbackPhilosophy({
      weeklyKm: 80,
      injuries: ["achilles"],
      injuryDetail: "Sore for 2 weeks",
      experienceLevel: "competitive",
      raceDistance: "Marathon",
      daysPerWeek: 6,
    });
    expect(rec.primary.philosophy).toBe("80_20_polarized");
  });

  it("recommends Pfitzinger for experienced high-volume marathoners", () => {
    const rec = getFallbackPhilosophy({
      weeklyKm: 75,
      daysPerWeek: 6,
      raceDistance: "Marathon",
      experienceLevel: "experienced",
      injuries: ["none"],
      injuryDetail: "",
    });
    expect(rec.primary.philosophy).toBe("pfitzinger");
  });

  it("biases to Daniels when race is soon", () => {
    const inSixWeeks = new Date(Date.now() + 6 * 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const rec = getFallbackPhilosophy({
      weeklyKm: 40,
      daysPerWeek: 5,
      raceDistance: "10K",
      raceDate: inSixWeeks,
      experienceLevel: "building",
      injuries: ["none"],
      injuryDetail: "",
      hasIntervalsData: true,
    });
    expect(rec.primary.philosophy).toBe("jack_daniels");
  });

  it("biases to 80/20 when no data and not in a sharpening window", () => {
    const inTwelveWeeks = new Date(Date.now() + 12 * 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const rec = getFallbackPhilosophy({
      weeklyKm: 55,
      daysPerWeek: 5,
      raceDistance: "Half Marathon",
      raceDate: inTwelveWeeks,
      experienceLevel: "building",
      injuries: ["none"],
      injuryDetail: "",
      hasIntervalsData: false,
    });
    expect(rec.primary.philosophy).toBe("80_20_polarized");
  });

  it("maps intake with philosophy + plan_name when provided", () => {
    const intake = mapOnboardingAnswersToIntake({
      raceDate: "2026-10-01",
      raceDistance: "Marathon",
      goalTime: "3:30:00",
      planStartDate: "2026-09-01",
      daysPerWeek: 5,
      schedulingNote: "Sunday long run works best",
      injuryDetail: "none",
      trainingHistoryNote: "5 years running",
      philosophy: "jack_daniels",
    });
    expect(intake.weekly_frequency).toMatch(/5/);
    expect(intake.long_run_day).toBe("Sunday");
    expect(intake.philosophy).toBe("jack_daniels");
    expect(intake.plan_name).toContain("jack_daniels");
    expect(intake.plan_start_date).toBe("2026-09-01");
  });
});

