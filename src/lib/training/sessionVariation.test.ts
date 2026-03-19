import { describe, it, expect } from "vitest";
import { pickDeterministicLibrarySession, workoutTypeToSelectorDayType } from "./sessionSelector";

describe("session variation (library rotation)", () => {
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

  it("workoutTypeToSelectorDayType maps workout types", () => {
    expect(workoutTypeToSelectorDayType("rest")).toBe("rest");
    expect(workoutTypeToSelectorDayType("easy")).toBe("easy");
    expect(workoutTypeToSelectorDayType("long")).toBe("long");
    expect(workoutTypeToSelectorDayType("tempo")).toBe("quality");
    expect(workoutTypeToSelectorDayType("interval")).toBe("quality");
    expect(workoutTypeToSelectorDayType("strides")).toBe("quality");
  });
});
