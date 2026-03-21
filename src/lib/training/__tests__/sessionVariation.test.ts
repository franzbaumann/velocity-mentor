import { describe, it, expect } from "vitest";
import { pickDeterministicLibrarySession, selectSession, workoutTypeToSelectorDayType } from "../sessionSelector";

describe("session variation", () => {
  it("returnerar olika pass för varje dag i veckan", () => {
    const days = [0, 1, 2, 3, 4, 5, 6];
    const sessions = days.map((day) =>
      selectSession({
        distance: "marathon",
        phase: "base",
        sessionType: day === 5 ? "long" : "easy",
        weekNumber: 1,
        dayOfWeek: day,
        philosophy: "daniels",
        weeklyVolume: 60,
      })
    );

    const titles = sessions.filter(Boolean).map((s) => s!.title);
    const uniqueTitles = new Set(titles);
    expect(uniqueTitles.size).toBeGreaterThan(2);
  });

  it("returnerar aldrig null för giltiga kombinationer", () => {
    const result = selectSession({
      distance: "marathon",
      phase: "base",
      sessionType: "easy",
      weekNumber: 1,
      dayOfWeek: 0,
      philosophy: "daniels",
      weeklyVolume: 60,
    });
    expect(result).not.toBeNull();
  });

  it("workoutTypeToSelectorDayType maps workout types", () => {
    expect(workoutTypeToSelectorDayType("rest")).toBe("rest");
    expect(workoutTypeToSelectorDayType("easy")).toBe("easy");
    expect(workoutTypeToSelectorDayType("long")).toBe("long");
    expect(workoutTypeToSelectorDayType("tempo")).toBe("quality");
    expect(workoutTypeToSelectorDayType("interval")).toBe("quality");
    expect(workoutTypeToSelectorDayType("strides")).toBe("quality");
  });
});

describe("pickDeterministicLibrarySession", () => {
  it("returns different session names across a week (mix easy + long)", () => {
    let prev: string | null = null;
    const names: string[] = [];
    for (let d = 0; d < 7; d++) {
      const dayType = d === 5 ? "long" : "easy";
      const p = pickDeterministicLibrarySession({
        targetDistance: "marathon",
        phase: "base",
        dayType,
        injuryFlags: [],
        philosophy: "daniels",
        currentCTL: 55,
        variationIndex: d,
        previousLibraryId: prev,
      });
      expect(p).not.toBeNull();
      names.push(p!.name);
      prev = p!.id;
    }
    expect(new Set(names).size).toBeGreaterThan(2);
  });

  it("never returns null for marathon base easy when pool exists", () => {
    const p = pickDeterministicLibrarySession({
      targetDistance: "marathon",
      phase: "base",
      dayType: "easy",
      injuryFlags: [],
      philosophy: "daniels",
      currentCTL: 60,
      variationIndex: 0,
      previousLibraryId: null,
    });
    expect(p).not.toBeNull();
    expect(p!.id.length).toBeGreaterThan(0);
  });
});
