/** Round numbers for display - sensible precision throughout Cade */

import { parsePaceToMinPerKm } from "@/lib/analytics";

export function formatDistance(km: number | null | undefined): string {
  if (km == null || isNaN(km)) return "—";
  if (km < 0.01) return "0 km";
  if (km < 1) return `${Math.round(km * 100) / 100} km`;
  return `${Math.round(km * 10) / 10} km`;
}

export function formatCadence(spm: number | null | undefined): string {
  if (spm == null || isNaN(spm)) return "—";
  return `${Math.round(spm)} spm`;
}

/** Convert cadence to display as SPM. Many sources send RPM (one foot); double when in plausible RPM range. */
export function cadenceToDisplaySpm(cadence: number | null | undefined): number | null {
  if (cadence == null || typeof cadence !== "number" || isNaN(cadence)) return null;
  if (cadence >= 25 && cadence <= 130) return Math.round(cadence * 2);
  return Math.round(cadence);
}

export function formatPaceFromMinPerKm(minPerKm: number | null | undefined): string {
  if (minPerKm == null || isNaN(minPerKm) || minPerKm <= 0) return "—";
  let min = Math.floor(minPerKm);
  let sec = Math.round((minPerKm - min) * 60);
  if (sec >= 60) {
    min += 1;
    sec = 0;
  }
  return `${min}:${String(sec).padStart(2, "0")}/km`;
}

/** Normalize a stored pace string so seconds are 0–59 (e.g. "5:60/km" → "6:00/km"). */
export function normalizePaceDisplay(paceStr: string | null | undefined): string {
  if (paceStr == null || paceStr === "") return "";
  const match = paceStr.trim().match(/^(\d+):(\d+)(\/km)?$/i);
  if (!match) return paceStr;
  let min = parseInt(match[1], 10);
  let sec = parseInt(match[2], 10);
  if (sec >= 60) {
    min += Math.floor(sec / 60);
    sec = sec % 60;
  }
  const suffix = match[3] ?? "";
  return `${min}:${String(sec).padStart(2, "0")}${suffix}`;
}

export function formatDuration(sec: number | null | undefined): string {
  if (sec == null || isNaN(sec) || sec < 0) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatElevation(m: number | null | undefined): string {
  if (m == null || isNaN(m)) return "—";
  return `${Math.round(m)} m`;
}

/** 9.55 → "9h 33m" */
export function formatSleepHours(hours: number | null | undefined): string {
  if (hours == null || isNaN(hours) || hours <= 0) return "—";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatHr(hr: number | null | undefined): string {
  if (hr == null || isNaN(hr)) return "—";
  return `${Math.round(hr)} bpm`;
}

export function formatNumber(n: number | null | undefined, decimals = 0): string {
  if (n == null || isNaN(n)) return "—";
  return decimals > 0 ? n.toFixed(decimals) : String(Math.round(n));
}

/** Primary workout title — prefers library / AI name when present. */
export function plannedWorkoutSummary(w: {
  name?: string | null;
  session_type?: string;
  description?: string;
  distance_km?: number | null;
  duration_min?: number | null;
  duration_minutes?: number | null;
}): string {
  const named = w.name?.trim();
  if (named) return named;

  const type = (w.session_type ?? "easy").toLowerCase();
  const duration = w.duration_min ?? w.duration_minutes;
  if (w.distance_km != null && w.distance_km > 0) return `${w.distance_km} km ${type}`;
  if (duration != null && duration > 0) return `${duration} min ${type}`;
  return w.description?.trim() || `${type} run`;
}

/** Duration in minutes for display: prefers explicit stored duration, then distance × pace. */
export function plannedWorkoutDurationMinutes(w: {
  distance_km?: number | null;
  duration_min?: number | null;
  duration_minutes?: number | null;
  pace_target?: string | null;
  target_pace?: string | null;
}): number | null {
  const stored = w.duration_min ?? w.duration_minutes;
  if (stored != null && stored > 0) return Math.round(stored);

  const paceStr = w.pace_target ?? w.target_pace;
  if (w.distance_km != null && w.distance_km > 0 && paceStr) {
    const minPerKm = parsePaceToMinPerKm(paceStr);
    if (minPerKm != null) return Math.round(w.distance_km * minPerKm);
  }
  return null;
}

/** Parse goal time string (e.g. "2:55:00", "1:25:00", "45:00") to seconds */
export function parseGoalTimeToSeconds(s: string | null | undefined): number {
  if (s == null || s.trim() === "") return 0;
  const parts = s.trim().split(":").map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return 0;
}

/** Format seconds to goal time string "H:MM:SS" */
export function formatSecondsToGoalTime(sec: number | null | undefined): string {
  if (sec == null || isNaN(sec) || sec < 0) return "0:00:00";
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}
