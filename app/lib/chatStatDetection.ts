import type { ActivityRow, ReadinessRow } from "../hooks/useDashboardData";
import { format, startOfWeek } from "date-fns";
import { isRunningActivity } from "../lib/analytics";

/** Resolve CTL/ATL/TSB with icu_* fallbacks and derive TSB = CTL - ATL when null */
export function resolveCtlAtlTsb(r: {
  ctl?: number | null;
  atl?: number | null;
  tsb?: number | null;
  icu_ctl?: number | null;
  icu_atl?: number | null;
  icu_tsb?: number | null;
}) {
  const ctl = r.ctl ?? r.icu_ctl ?? null;
  const atl = r.atl ?? r.icu_atl ?? null;
  const tsb = r.tsb ?? r.icu_tsb ?? (ctl != null && atl != null ? ctl - atl : null);
  return { ctl, atl, tsb };
}

export type StatType =
  | "fitness"
  | "hrv"
  | "mileage"
  | "sleep"
  | "resting_hr"
  | "vo2max";

interface StatPattern {
  type: StatType;
  patterns: RegExp[];
}

const STAT_PATTERNS: StatPattern[] = [
  {
    type: "fitness",
    patterns: [
      /\bctl\b/i,
      /\batl\b/i,
      /\btsb\b/i,
      /\bfitness\s+(is|trend|level|progress|track|load|curve)/i,
      /\btraining\s+(stress|load)\b/i,
      /\bchronic\s+training/i,
      /\bacute\s+training/i,
      /\btraining\s+stress\s+balance/i,
      /\bform\b.*\b(peak|fresh|fatigue)/i,
    ],
  },
  {
    type: "hrv",
    patterns: [/\bhrv\b/i, /\bheart\s+rate\s+variab/i, /\bautonomic/i, /\bparasympathetic/i],
  },
  {
    type: "mileage",
    patterns: [
      /\b(weekly|week)\s*(mileage|volume|km|kilometers|distance)/i,
      /\bmileage\b/i,
      /\bweekly\s+km\b/i,
      /\bvolume\b.*\b(trend|progress|increase|decrease|ramp)/i,
      /\bkm\s+per\s+week\b/i,
      /\brunning\s+volume\b/i,
    ],
  },
  {
    type: "sleep",
    patterns: [
      /\bsleep\s*(score|hours|quality|trend|data|duration|average)/i,
      /\bsleep\b.*\b(improv|declin|trend|track|vary|varying|consisten)/i,
      /\b(hours|quality)\s+of\s+sleep\b/i,
      /\baverage\s+sleep\b/i,
      /\bsleep\b.*\b\d+(\.\d+)?\s*hours?\b/i,
    ],
  },
  {
    type: "resting_hr",
    patterns: [/\bresting\s*(hr|heart\s*rate)\b/i, /\brhr\b/i],
  },
  {
    type: "vo2max",
    patterns: [/\bvo2\s*max\b/i, /\baerobic\s+capacity\b/i],
  },
];

export function detectStats(text: string): StatType[] {
  const found: StatType[] = [];
  for (const { type, patterns } of STAT_PATTERNS) {
    if (patterns.some((p) => p.test(text))) {
      found.push(type);
    }
  }
  return found;
}

export interface ChartDataPoint {
  date: string;
  label: string;
  [key: string]: string | number | null;
}

const DAYS_16_WEEKS = 112;

function deduplicateByDate(rows: ReadinessRow[]): ReadinessRow[] {
  const byDate = new Map<string, ReadinessRow>();
  for (const r of rows) {
    const existing = byDate.get(r.date);
    if (!existing) {
      byDate.set(r.date, r);
      continue;
    }
    const countNonNull = (row: ReadinessRow) => {
      const { ctl, atl, tsb } = resolveCtlAtlTsb(row);
      let n = 0;
      if (ctl != null) n++;
      if (atl != null) n++;
      if (tsb != null) n++;
      if (row.hrv != null) n++;
      if (row.resting_hr != null) n++;
      if (row.sleep_hours != null) n++;
      if (row.score != null || row.sleep_score != null) n++;
      if (row.vo2max != null) n++;
      if (row.icu_ctl != null || row.icu_atl != null || row.icu_tsb != null) n++;
      return n;
    };
    if (countNonNull(r) > countNonNull(existing)) {
      byDate.set(r.date, r);
    }
  }
  return Array.from(byDate.values());
}

export function buildFitnessData(readiness: ReadinessRow[]): ChartDataPoint[] {
  return deduplicateByDate(readiness)
    .map((r) => ({ r, ...resolveCtlAtlTsb(r) }))
    .filter(({ ctl, atl, tsb }) => ctl != null || atl != null || tsb != null)
    .sort((a, b) => a.r.date.localeCompare(b.r.date))
    .slice(-DAYS_16_WEEKS)
    .map(({ r, ctl, atl, tsb }) => ({
      date: r.date,
      label: format(new Date(r.date), "MMM d"),
      CTL: ctl != null ? Math.round(ctl * 10) / 10 : null,
      ATL: atl != null ? Math.round(atl * 10) / 10 : null,
      TSB: tsb != null ? Math.round(tsb * 10) / 10 : null,
    }));
}

export function buildHrvData(readiness: ReadinessRow[]): ChartDataPoint[] {
  return deduplicateByDate(readiness)
    .filter((r) => r.hrv != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-DAYS_16_WEEKS)
    .map((r) => ({
      date: r.date,
      label: format(new Date(r.date), "MMM d"),
      HRV: r.hrv,
    }));
}

export function buildMileageData(activities: ActivityRow[]): ChartDataPoint[] {
  const weeks: Record<string, number> = {};
  for (const a of activities) {
    if (!a.date || !a.distance_km || !isRunningActivity(a.type)) continue;
    const d = new Date(a.date);
    const wk = format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
    weeks[wk] = (weeks[wk] ?? 0) + a.distance_km;
  }
  return Object.entries(weeks)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-16)
    .map(([week, km]) => ({
      date: week,
      label: format(new Date(week), "MMM d"),
      km: Math.round(km * 10) / 10,
    }));
}

export function buildSleepData(readiness: ReadinessRow[]): ChartDataPoint[] {
  return deduplicateByDate(readiness)
    .filter((r) => r.sleep_hours != null || r.sleep_score != null || r.score != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-DAYS_16_WEEKS)
    .map((r) => ({
      date: r.date,
      label: format(new Date(r.date), "MMM d"),
      sleep: r.sleep_score ?? r.score ?? (r.sleep_hours != null ? Math.round(r.sleep_hours * 12.5) : null),
    }));
}

export function buildRestingHrData(readiness: ReadinessRow[]): ChartDataPoint[] {
  return deduplicateByDate(readiness)
    .filter((r) => r.resting_hr != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-DAYS_16_WEEKS)
    .map((r) => ({
      date: r.date,
      label: format(new Date(r.date), "MMM d"),
      rhr: r.resting_hr,
    }));
}

export function buildVO2maxData(readiness: ReadinessRow[]): ChartDataPoint[] {
  return deduplicateByDate(readiness)
    .filter((r) => r.vo2max != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-DAYS_16_WEEKS)
    .map((r) => ({
      date: r.date,
      label: format(new Date(r.date), "MMM d"),
      vo2max: r.vo2max ?? null,
    }));
}

