import { SESSION_LIBRARY, type Session } from "./sessionLibrary";

/** Midpoint of library distance band, or null when the session has no km range (e.g. some quality-only templates). */
export function defaultDistanceKmFromSession(s: Session): number | null {
  const min = s.distanceKmMin;
  const max = s.distanceKmMax;
  if (min != null && max != null) return Math.round(((min + max) / 2) * 10) / 10;
  if (min != null) return min;
  if (max != null) return max;
  return null;
}

export function defaultDurationMinutesFromSession(s: Session): number {
  const a = s.durationMinRange;
  const b = s.durationMaxRange;
  if (b > a) return Math.round((a + b) / 2);
  return a;
}

type VolumeRow = {
  distance_km: number | null;
  duration_minutes?: number | null;
  duration_min?: number | null;
  session_library_id?: string | null;
};

/**
 * When a row is linked to the session library but PaceIQ left placeholder km/min,
 * use the library template band so headers and week totals match the description.
 *
 * Does **not** overwrite enrich/scaled values: if DB km is within the template ceiling
 * and not absurdly below the band floor, we trust it (avoids showing raw midpoint after
 * scaledPlannedVolumeFromSession wrote e.g. 12 km for a 16–22 km template).
 */
export function resolveWorkoutVolumeForDisplay(row: VolumeRow): {
  distanceKm: number | null;
  durationMin: number | null;
} {
  const storedKm = row.distance_km;
  const storedMin = row.duration_minutes ?? row.duration_min ?? null;
  const id = row.session_library_id;
  if (!id || id === "rest") {
    return { distanceKm: storedKm, durationMin: storedMin };
  }

  const session = SESSION_LIBRARY.find((x) => x.id === id);
  if (!session) {
    return { distanceKm: storedKm, durationMin: storedMin };
  }

  const libKm = defaultDistanceKmFromSession(session);
  const libMin = defaultDurationMinutesFromSession(session);
  const minKm = session.distanceKmMin;
  const maxKm = session.distanceKmMax;

  let km = storedKm;
  let replacedKm = false;

  if (libKm != null) {
    if (storedKm == null || storedKm <= 0) {
      km = libKm;
      replacedKm = true;
    } else if (minKm != null && maxKm != null) {
      const floor = minKm * 0.65;
      if (storedKm > maxKm) {
        km = storedKm;
      } else if (storedKm < floor) {
        km = libKm;
        replacedKm = true;
      } else {
        km = storedKm;
      }
    } else if (maxKm != null && storedKm <= maxKm) {
      km = storedKm;
    } else if (minKm != null && storedKm + 1 < minKm) {
      km = libKm;
      replacedKm = true;
    } else {
      km = storedKm;
    }
  }

  let min = storedMin;
  if (libMin > 0) {
    if (storedMin == null || storedMin <= 0) {
      min = libMin;
    } else if (replacedKm) {
      min = libMin;
    } else if (storedMin < libMin * 0.55) {
      min = libMin;
    }
  }

  return { distanceKm: km, durationMin: min };
}
