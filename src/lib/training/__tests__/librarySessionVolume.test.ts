import { describe, expect, it } from "vitest";
import { resolveWorkoutVolumeForDisplay } from "../librarySessionVolume";

describe("resolveWorkoutVolumeForDisplay", () => {
  it("trusts scaled km within band (below template min but above 0.65 * min)", () => {
    const row = {
      distance_km: 12,
      duration_minutes: 70,
      session_library_id: "10k-12",
    };
    const out = resolveWorkoutVolumeForDisplay(row);
    expect(out.distanceKm).toBe(12);
  });

  it("replaces PaceIQ placeholder km far below band", () => {
    const row = {
      distance_km: 5,
      duration_minutes: 30,
      session_library_id: "10k-12",
    };
    const out = resolveWorkoutVolumeForDisplay(row);
    expect(out.distanceKm).toBe(19);
  });

  it("uses library midpoint when distance is missing", () => {
    const row = {
      distance_km: null as number | null,
      duration_minutes: null as number | null,
      session_library_id: "10k-01",
    };
    const out = resolveWorkoutVolumeForDisplay(row);
    expect(out.distanceKm).toBe(10);
  });

  it("trusts km above template max (manual override)", () => {
    const row = {
      distance_km: 20,
      duration_minutes: 100,
      session_library_id: "10k-02",
    };
    const out = resolveWorkoutVolumeForDisplay(row);
    expect(out.distanceKm).toBe(20);
  });
});
