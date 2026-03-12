/**
 * Return date as YYYY-MM-DD in the device's local timezone.
 * Use this for "today", week boundaries, and any comparison with activity/readiness dates
 * so that the correct day is used regardless of timezone.
 */
export function getLocalDateString(d?: Date | null): string {
  const date = d != null && d instanceof Date && !Number.isNaN(d.getTime()) ? d : new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
