export function formatSleepHours(hours: number | null | undefined): string {
  if (hours == null || isNaN(hours) || hours <= 0) return "—";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatDistance(km: number | null | undefined): string {
  if (km == null || isNaN(km)) return "—";
  if (km < 0.01) return "0 km";
  if (km < 1) return `${Math.round(km * 100) / 100} km`;
  return `${Math.round(km * 10) / 10} km`;
}
