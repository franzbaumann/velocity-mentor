/** Round numbers for display - sensible precision throughout Cade */

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

export function formatPaceFromMinPerKm(minPerKm: number | null | undefined): string {
  if (minPerKm == null || isNaN(minPerKm) || minPerKm <= 0) return "—";
  const min = Math.floor(minPerKm);
  const sec = Math.round((minPerKm - min) * 60);
  return `${min}:${String(sec).padStart(2, "0")}/km`;
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
