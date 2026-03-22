import { describe, expect, it } from "vitest";
import { applyWeekLongVersusEasyCoherence, type WeekVolumeRow } from "../planVolumeScale";

describe("applyWeekLongVersusEasyCoherence", () => {
  it("bumps long day above max easy when long template distMax allows it", () => {
    const rows: WeekVolumeRow[] = [
      {
        id: "e1",
        weekKey: "2026-W12",
        dayType: "easy",
        distanceKm: 12,
        distMin: 8,
        distMax: 14,
        durationMin: 50,
      },
      {
        id: "l1",
        weekKey: "2026-W12",
        dayType: "long",
        distanceKm: 10,
        distMin: 12,
        distMax: 18,
        durationMin: 60,
      },
    ];
    applyWeekLongVersusEasyCoherence(rows);
    const longRow = rows.find((r) => r.id === "l1");
    expect(longRow?.distanceKm).toBeGreaterThan(12);
    expect(longRow?.distanceKm).toBeLessThanOrEqual(18);
  });

  it("does not exceed long template distMax", () => {
    const rows: WeekVolumeRow[] = [
      {
        id: "e1",
        weekKey: "2026-W13",
        dayType: "easy",
        distanceKm: 25,
        distMin: 8,
        distMax: 30,
        durationMin: 50,
      },
      {
        id: "l1",
        weekKey: "2026-W13",
        dayType: "long",
        distanceKm: 8,
        distMin: 12,
        distMax: 16,
        durationMin: 50,
      },
    ];
    applyWeekLongVersusEasyCoherence(rows);
    const longRow = rows.find((r) => r.id === "l1");
    expect(longRow?.distanceKm).toBe(16);
  });
});
