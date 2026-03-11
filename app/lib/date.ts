/**
 * Return date as YYYY-MM-DD in the device's local timezone.
 * Use this for "today", week boundaries, and any comparison with activity/readiness dates
 * so that the correct day is used regardless of timezone.
 */
export function getLocalDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
