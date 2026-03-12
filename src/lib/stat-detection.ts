import type { ReadinessRow } from "@/hooks/useReadiness";
import type { ActivityRow } from "@/hooks/useActivities";
import { resolveCtlAtlTsb } from "@/hooks/useReadiness";
import { isRunningActivity } from "@/lib/analytics";
import { startOfWeek, format } from "date-fns";

export type StatType =
  | "fitness"       // CTL / ATL / TSB
  | "hrv"           // Heart rate variability
  | "mileage"       // Weekly running volume
  | "sleep"         // Sleep hours / score
  | "resting_hr"    // Resting heart rate
  | "vo2max"        // VO2max estimate
  | "last_activity"; // Pace + HR chart for the most recent run

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
    patterns: [
      /\bhrv\b/i,
      /\bheart\s+rate\s+variab/i,
      /\bautonomic/i,
      /\bparasympathetic/i,
    ],
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
    patterns: [
      /\bresting\s*(hr|heart\s*rate)\b/i,
      /\brhr\b/i,
    ],
  },
  {
    type: "vo2max",
    patterns: [
      /\bvo2\s*max\b/i,
      /\baerobic\s+capacity\b/i,
    ],
  },
  {
    type: "last_activity",
    patterns: [
      /\blast\s+run\b/i,
      /\bthat\s+run\b/i,
      /\byour\s+run\b/i,
      /\brun\s+analysis\b/i,
      /\bpost.?workout\b/i,
      /\beffort\s+level\b/i,
      /\bpace\s+of\s+\d+:\d+/i,
      /\bavg(?:erage)?\s+(?:hr|heart\s+rate)\s+of\s+\d+/i,
      /\bbreakdown\b.*\brun\b/i,
      /\b\d+(?:\.\d+)?\s*km\s+(?:at|run|pace)\b/i,
      /\blast\s+workout\b/i,
      /\bthis\s+run\b/i,
    ],
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
      let n = 0;
      if (row.ctl != null || row.icu_ctl != null) n++;
      if (row.atl != null || row.icu_atl != null) n++;
      if (row.tsb != null || row.icu_tsb != null) n++;
      if (row.hrv != null) n++;
      if (row.resting_hr != null) n++;
      if (row.sleep_score != null || row.sleep_hours != null) n++;
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
    .filter((r) => {
      const { ctl, atl, tsb } = resolveCtlAtlTsb(r);
      return ctl != null || atl != null || tsb != null;
    })
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-DAYS_16_WEEKS)
    .map((r) => {
      const { ctl, atl, tsb } = resolveCtlAtlTsb(r);
      return {
        date: r.date,
        label: format(new Date(r.date), "MMM d"),
        CTL: ctl != null ? Math.round(ctl * 10) / 10 : null,
        ATL: atl != null ? Math.round(atl * 10) / 10 : null,
        TSB: tsb != null ? Math.round(tsb * 10) / 10 : null,
      };
    });
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
    .filter((r) => r.sleep_score != null || r.sleep_hours != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-DAYS_16_WEEKS)
    .map((r) => ({
      date: r.date,
      label: format(new Date(r.date), "MMM d"),
      sleep: r.sleep_score ?? (r.sleep_hours != null ? Math.round(r.sleep_hours * 12.5) : null),
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
    .filter((r) => (r as ReadinessRow & { vo2max?: number | null }).vo2max != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-DAYS_16_WEEKS)
    .map((r) => ({
      date: r.date,
      label: format(new Date(r.date), "MMM d"),
      vo2max: (r as ReadinessRow & { vo2max?: number | null }).vo2max ?? null,
    }));
}
