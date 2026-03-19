import { describe, it, expect } from "vitest";
import {
  calculateVDOT,
  vdotFromCooper,
  vdotFrom2400m,
  pacesFromVDOT,
  pacesFromLT,
  calculatePaceProfile,
  formatPace,
  paceToMileString,
  getPaceForSession,
  shouldUpdatePaceProfile,
  type LTData,
  type PaceProfile,
} from "./vdot";

describe("calculateVDOT", () => {
  it("10K in 40:00 → VDOT ~54", () => {
    const vdot = calculateVDOT(10000, 40 * 60);
    expect(vdot).toBeGreaterThanOrEqual(50);
    expect(vdot).toBeLessThanOrEqual(56);
  });

  it("Marathon in 3:30 → VDOT ~46", () => {
    const vdot = calculateVDOT(42195, 3.5 * 3600);
    expect(vdot).toBeGreaterThanOrEqual(44);
    expect(vdot).toBeLessThanOrEqual(48);
  });

  it("5K in 20:00 → VDOT ~53", () => {
    const vdot = calculateVDOT(5000, 20 * 60);
    expect(vdot).toBeGreaterThanOrEqual(48);
    expect(vdot).toBeLessThanOrEqual(55);
  });

  it("Half marathon in 1:30 → VDOT ~54", () => {
    const vdot = calculateVDOT(21097.5, 90 * 60);
    expect(vdot).toBeGreaterThanOrEqual(49);
    expect(vdot).toBeLessThanOrEqual(56);
  });

  it("clamps VDOT between 30 and 85", () => {
    expect(calculateVDOT(100, 1)).toBe(85);
    expect(calculateVDOT(100000, 86400)).toBeLessThanOrEqual(85);
  });
});

describe("vdotFromCooper", () => {
  it("returns VDOT from 12-min distance", () => {
    const vdot = vdotFromCooper(2500);
    expect(vdot).toBeGreaterThan(30);
    expect(vdot).toBeLessThan(85);
  });
});

describe("vdotFrom2400m", () => {
  it("delegates to calculateVDOT", () => {
    const vdot = vdotFrom2400m(600); // 10 min
    expect(vdot).toBeGreaterThan(30);
    expect(vdot).toBeLessThan(85);
  });
});

describe("pacesFromVDOT", () => {
  it("VDOT 50: easy ~5:42-6:24/km, threshold ~4:46/km, interval ~4:24/km", () => {
    const p = pacesFromVDOT(50);
    expect(p.easy.min).toBe(342);
    expect(p.easy.max).toBe(384);
    expect(p.threshold).toBe(286); // 4:46
    expect(p.interval).toBe(264); // 4:24
    expect(p.repetition).toBe(246);
  });

  it("VDOT 47.3: interpolates between 46 and 48", () => {
    const p47 = pacesFromVDOT(47);
    const p47_3 = pacesFromVDOT(47.3);
    const p48 = pacesFromVDOT(48);
    expect(p47_3.threshold).toBeGreaterThan(p48.threshold);
    expect(p47_3.threshold).toBeLessThan(p47.threshold);
    expect(p47_3.easy.min).toBeGreaterThan(p48.easy.min);
    expect(p47_3.easy.min).toBeLessThan(p47.easy.min);
  });

  it("includes HR zones", () => {
    const p = pacesFromVDOT(50);
    expect(p.easyHR).toEqual({ min: 65, max: 79 });
    expect(p.tempoHR).toEqual({ min: 80, max: 90 });
  });
});

describe("pacesFromLT", () => {
  it("derives paces from LT1/LT2", () => {
    const lt: LTData = { lt1Pace: 330, lt2Pace: 270 };
    const p = pacesFromLT(lt);
    expect(p.easy.min).toBe(390); // 330 + 60
    expect(p.easy.max).toBe(360); // 330 + 30
    expect(p.threshold).toBe(270);
    expect(p.interval).toBe(255); // 270 - 15
    expect(p.repetition).toBe(240); // 270 - 30
    expect(p.marathon).toBeGreaterThan(270);
    expect(p.marathon).toBeLessThan(330);
  });
});

describe("calculatePaceProfile", () => {
  it("LT data present → always wins", () => {
    const profile = calculatePaceProfile({
      ltData: { lt1Pace: 360, lt2Pace: 300 },
      recentRaces: [
        { distanceMeters: 10000, timeSeconds: 2400, date: new Date() },
      ],
      cooperDistance: 3000,
      trialTime2400: 600,
    });
    expect(profile.source).toBe("intervals_lt");
    expect(profile.confidence).toBe("high");
    expect(profile.paces.threshold).toBe(300);
  });

  it("recent race (< 8 weeks) used when no LT", () => {
    const profile = calculatePaceProfile({
      recentRaces: [
        {
          distanceMeters: 10000,
          timeSeconds: 2400,
          date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      ],
    });
    expect(profile.source).toBe("race_result");
    expect(profile.vdot).toBeDefined();
    expect(profile.confidence).toBe("high");
  });

  it("race older than 8 weeks → not used", () => {
    const profile = calculatePaceProfile({
      recentRaces: [
        {
          distanceMeters: 10000,
          timeSeconds: 2400,
          date: new Date(Date.now() - 70 * 24 * 60 * 60 * 1000),
        },
      ],
    });
    expect(profile.source).toBe("calibrating");
    expect(profile.vdot).toBe(40);
  });

  it("Cooper used when no LT or recent race", () => {
    const profile = calculatePaceProfile({
      cooperDistance: 2800,
    });
    expect(profile.source).toBe("field_test");
    expect(profile.vdot).toBeDefined();
    expect(profile.confidence).toBe("medium");
  });

  it("2400m trial used when no LT, race, or Cooper", () => {
    const profile = calculatePaceProfile({
      trialTime2400: 600,
    });
    expect(profile.source).toBe("field_test");
    expect(profile.vdot).toBeDefined();
  });

  it("no data → returns VDOT 40 defaults", () => {
    const profile = calculatePaceProfile({});
    expect(profile.source).toBe("calibrating");
    expect(profile.vdot).toBe(40);
    expect(profile.confidence).toBe("low");
    expect(profile.paces.threshold).toBe(336); // VDOT 40 threshold
  });
});

describe("formatPace", () => {
  it("264 → 4:24", () => {
    expect(formatPace(264)).toBe("4:24");
  });

  it("300 → 5:00", () => {
    expect(formatPace(300)).toBe("5:00");
  });

  it("183 → 3:03", () => {
    expect(formatPace(183)).toBe("3:03");
  });

  it("rounds seconds", () => {
    expect(formatPace(264.7)).toBe("4:25");
  });
});

describe("paceToMileString", () => {
  it("converts sec/km to min/mile", () => {
    const s = paceToMileString(300); // 5:00/km
    expect(s).toMatch(/\d+:\d{2}\/mi/);
  });
});

describe("getPaceForSession", () => {
  const profile: PaceProfile = {
    paces: pacesFromVDOT(50),
    source: "race_result",
    vdot: 50,
    confidence: "high",
    lastUpdated: new Date(),
    sourceDescription: "Test",
  };

  it("returns pace and description for easy", () => {
    const r = getPaceForSession("easy", profile);
    expect(r.pace).toContain("/km");
    expect(r.description).toContain("Conversational");
    expect(r.hrZone).toBeDefined();
  });

  it("returns pace for threshold", () => {
    const r = getPaceForSession("threshold", profile);
    expect(r.pace).toBe("4:46/km");
    expect(r.description).toContain("Comfortably hard");
  });

  it("long uses easy pace range", () => {
    const r = getPaceForSession("long", profile);
    expect(r.pace).toContain("-");
    expect(r.description).toContain("Easy");
  });
});

describe("shouldUpdatePaceProfile", () => {
  it("returns true when paces change > 3 sec/km", () => {
    const current = calculatePaceProfile({
      recentRaces: [
        {
          distanceMeters: 10000,
          timeSeconds: 2700, // slower
          date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      ],
    });
    const result = shouldUpdatePaceProfile(current, {
      recentRaces: [
        {
          distanceMeters: 10000,
          timeSeconds: 2400, // faster
          date: new Date(),
        },
      ],
    });
    expect(result.shouldUpdate).toBe(true);
    expect(result.reason).toBeDefined();
  });

  it("returns false when no significant change", () => {
    const current = calculatePaceProfile({
      recentRaces: [
        {
          distanceMeters: 10000,
          timeSeconds: 2400,
          date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      ],
    });
    const result = shouldUpdatePaceProfile(current, {
      recentRaces: [
        {
          distanceMeters: 10000,
          timeSeconds: 2405, // tiny change
          date: new Date(),
        },
      ],
    });
    expect(result.shouldUpdate).toBe(false);
  });

  it("does not downgrade from real data to calibrating", () => {
    const current = calculatePaceProfile({
      recentRaces: [
        {
          distanceMeters: 10000,
          timeSeconds: 2400,
          date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      ],
    });
    const result = shouldUpdatePaceProfile(current, {});
    expect(result.shouldUpdate).toBe(false);
  });
});
