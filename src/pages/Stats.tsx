import { AppLayout } from "@/components/AppLayout";
import { useMergedActivities } from "@/hooks/useMergedIntervalsData";
import { useMergedReadiness } from "@/hooks/useMergedIntervalsData";
import { resolveCtlAtlTsb } from "@/hooks/useReadiness";
import { useIntervalsIntegration } from "@/hooks/useIntervalsIntegration";
import {
  computeFitnessCurves,
  parsePaceToMinPerKm,
  inferRunType,
  isRunningActivity,
  PR_DISTANCES,
  findBestForDistance,
} from "@/lib/analytics";
import { formatDuration, formatPaceFromMinPerKm } from "@/lib/format";
import { Link2, ArrowRight, TrendingUp, BarChart3, Activity, Trophy, Heart, Moon, Zap, Wind, Info } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format, subDays, subWeeks, startOfWeek } from "date-fns";
import { useMemo, useState, useEffect } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";

const fmt = (d: Date) => format(d, "yyyy-MM-dd");
const now = new Date();
const oldest16w = fmt(subWeeks(now, 16));
const oldest12w = fmt(subWeeks(now, 12));
const oldest120d = fmt(subDays(now, 120));

const THRESHOLD_HR = 170; // TODO: from settings

const STAT_INFO: Record<string, React.ReactNode> = {
  fitness: (
    <>
      <p className="font-semibold text-foreground mb-1">CTL / ATL / TSB</p>
      <p className="text-muted-foreground text-xs mb-1"><strong>CTL</strong> — 42-day fitness. <strong>ATL</strong> — 7-day fatigue. <strong>TSB</strong> = CTL − ATL. Positive = fresh, negative = fatigued.</p>
      <p className="text-muted-foreground text-xs">Peak &gt;5 · Fatigued &lt;−10.</p>
    </>
  ),
  mileage: (
    <>
      <p className="font-semibold text-foreground mb-1">Weekly Mileage</p>
      <p className="text-muted-foreground text-xs">Total km per week (Mon–Sun). Tracks volume trends.</p>
    </>
  ),
  pace: (
    <>
      <p className="font-semibold text-foreground mb-1">Pace Progression</p>
      <p className="text-muted-foreground text-xs">Pace per run. Dashed line = 4-week average; filter by run type.</p>
    </>
  ),
  prs: (
    <>
      <p className="font-semibold text-foreground mb-1">Personal Records</p>
      <p className="text-muted-foreground text-xs">Best times at 5K, 10K, Half, Marathon. Tap a row to open the activity.</p>
    </>
  ),
  hrEfficiency: (
    <>
      <p className="font-semibold text-foreground mb-1">HR Efficiency</p>
      <p className="text-muted-foreground text-xs">Pace at 140–150 bpm. Faster over time = better aerobic fitness.</p>
    </>
  ),
  readiness: (
    <>
      <p className="font-semibold text-foreground mb-1">Readiness Score</p>
      <p className="text-muted-foreground text-xs">0–100 from TSB/CTL or intervals.icu. Higher = ready to train hard.</p>
    </>
  ),
  sleep: (
    <>
      <p className="font-semibold text-foreground mb-1">Sleep Score</p>
      <p className="text-muted-foreground text-xs">0–100 from intervals.icu. Tracks recovery.</p>
    </>
  ),
  hrv: (
    <>
      <p className="font-semibold text-foreground mb-1">HRV Trend</p>
      <p className="text-muted-foreground text-xs">Heart rate variability (ms). Low = fatigue or illness.</p>
    </>
  ),
  sleepResting: (
    <>
      <p className="font-semibold text-foreground mb-1">Sleep & Resting HR</p>
      <p className="text-muted-foreground text-xs">Sleep hours + resting HR. Rising RHR = fatigue.</p>
    </>
  ),
  vo2max: (
    <>
      <p className="font-semibold text-foreground mb-1">VO2max</p>
      <p className="text-muted-foreground text-xs">Estimated aerobic capacity from intervals.icu or wearable.</p>
    </>
  ),
  rampRate: (
    <>
      <p className="font-semibold text-foreground mb-1">Ramp Rate</p>
      <p className="text-muted-foreground text-xs">CTL change per week. &gt;5 pts/week = injury risk.</p>
    </>
  ),
};

function ChartCard({
  icon: Icon,
  title,
  children,
  info,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
  info?: string;
}) {
  return (
    <div className="glass-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-card/60 backdrop-blur-sm flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="text-sm font-semibold text-foreground truncate">{title}</span>
        </div>
        {info && STAT_INFO[info] && (
          <div className="relative group flex-shrink-0">
            <button
              type="button"
              className="w-7 h-7 rounded-full flex items-center justify-center bg-muted text-foreground/70 hover:text-foreground hover:bg-muted/80 transition-colors border border-border"
              aria-label="Info"
            >
              <Info className="w-4 h-4" />
            </button>
            <div className="absolute right-0 top-full mt-1 z-50 rounded-lg border border-border bg-popover px-3 py-2.5 shadow-lg text-left opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity w-64 pointer-events-none">
              {STAT_INFO[info]}
            </div>
          </div>
        )}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="h-[280px] animate-pulse flex items-center justify-center rounded-lg bg-secondary/30">
      <span className="text-sm text-muted-foreground">Loading…</span>
    </div>
  );
}

function EmptyState({ message, sub }: { message: string; sub?: string }) {
  return (
    <div className="h-[260px] flex flex-col items-center justify-center gap-2 text-sm text-center px-4">
      <p className="text-muted-foreground">{message}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** Format pace number (min/km) for chart axis: 5.5 → "5:30/km" */
function formatPaceTick(val: number): string {
  if (val == null || val < 2 || val > 25) return "";
  const min = Math.floor(val);
  const sec = Math.round((val - min) * 60);
  return `${min}:${String(sec).padStart(2, "0")}/km`;
}

/** Deduplicate readiness by date — keep row with most complete CTL/ATL/TSB */
function deduplicateReadiness<T extends { date: string } & Record<string, unknown>>(
  rows: T[],
  resolve: (r: T) => { ctl: number | null; atl: number | null; tsb: number | null }
): T[] {
  const byDate = new Map<string, T>();
  for (const r of rows) {
    const existing = byDate.get(r.date);
    if (!existing) {
      byDate.set(r.date, r);
      continue;
    }
    const curr = resolve(r);
    const prev = resolve(existing);
    const currScore = [curr.ctl, curr.atl, curr.tsb].filter((v) => v != null).length;
    const prevScore = [prev.ctl, prev.atl, prev.tsb].filter((v) => v != null).length;
    if (currScore >= prevScore) byDate.set(r.date, r);
  }
  return Array.from(byDate.values());
}

// ── 1. CTL/ATL/TSB Fitness Chart ──
function FitnessChart({
  activities,
  readiness,
}: {
  activities: { date: string; type: string | null; distance_km: number | null; duration_seconds: number | null; avg_hr: number | null }[];
  readiness: { date: string; ctl?: number | null; atl?: number | null; tsb?: number | null; icu_ctl?: number | null; icu_atl?: number | null; icu_tsb?: number | null }[];
}) {
  const chartData = useMemo(() => {
    const filtered = readiness.filter((r) => {
      const { ctl, atl, tsb } = resolveCtlAtlTsb(r);
      return (ctl != null || atl != null || tsb != null) && r.date <= fmt(now);
    });
    const deduped = deduplicateReadiness(filtered, (r) => resolveCtlAtlTsb(r));
    const fromReadiness = deduped
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-112)
      .map((r) => {
        const { ctl, atl, tsb } = resolveCtlAtlTsb(r);
        return { date: r.date, CTL: ctl ?? 0, ATL: atl ?? 0, TSB: tsb ?? 0 };
      });
    const computed = computeFitnessCurves(activities, oldest16w, fmt(now), THRESHOLD_HR);
    if (fromReadiness.length > 0) {
      return fromReadiness;
    }
    return computed;
  }, [activities, readiness]);

  if (!chartData.length) return <EmptyState message="No fitness data yet" sub="Connect intervals.icu in Settings to see CTL/ATL/TSB" />;

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string }[]; label?: string }) => {
    if (!active || !payload?.length || !label) return null;
    const ctl = payload.find((p) => p.name === "CTL")?.value;
    const atl = payload.find((p) => p.name === "ATL")?.value;
    const tsb = payload.find((p) => p.name === "TSB")?.value;
    let zone = "Optimal";
    if (tsb != null && tsb > 5) zone = "Peak form";
    else if (tsb != null && tsb < -10) zone = "Fatigued";
    return (
      <div className="rounded-xl border border-border bg-card px-3 py-2 shadow-lg text-sm">
        <p className="font-medium text-foreground mb-1">{format(new Date(label), "MMM d, yyyy")}</p>
        <p className="text-muted-foreground">CTL: {ctl?.toFixed(1)} · ATL: {atl?.toFixed(1)} · TSB: {tsb?.toFixed(1)}</p>
        <p className="text-xs mt-1 text-primary font-medium">{zone}</p>
      </div>
    );
  };

  const yMin = Math.min(...chartData.map((d) => Math.min(d.CTL, d.ATL, d.TSB)));
  const yMax = Math.max(...chartData.map((d) => Math.max(d.CTL, d.ATL, d.TSB)));
  const yPadding = Math.max(5, (yMax - yMin) * 0.1 || 5);
  const yDomain: [number, number] = [Math.floor(yMin - yPadding), Math.ceil(yMax + yPadding)];

  const hasMeaningfulData = chartData.some((d) => d.CTL > 0 || d.ATL > 0 || Math.abs(d.TSB) > 0.1);
  if (!hasMeaningfulData) return <EmptyState message="No fitness data yet" sub="Sync intervals.icu in Settings to see CTL/ATL/TSB" />;

  return (
    <div className="h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => format(new Date(v), "MMM d")} interval={chartData.length > 60 ? Math.floor(chartData.length / 8) : "preserveStartEnd" } />
          <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => Math.round(v).toString()} domain={yDomain} />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
          <ReferenceLine y={5} stroke="hsl(141 72% 50% / 0.5)" strokeDasharray="2 2" />
          <ReferenceLine y={-10} stroke="hsl(0 84% 60% / 0.5)" strokeDasharray="2 2" />
          <Line type="monotone" dataKey="TSB" stroke="hsl(141 72% 50%)" strokeWidth={1.5} dot={false} connectNulls name="TSB (form)" />
          <Line type="monotone" dataKey="CTL" stroke="hsl(211 100% 52%)" strokeWidth={2} dot={false} connectNulls name="CTL (fitness)" />
          <Line type="monotone" dataKey="ATL" stroke="hsl(36 100% 52%)" strokeWidth={2} dot={false} connectNulls name="ATL (fatigue)" />
          <Legend wrapperStyle={{ fontSize: 11 }} verticalAlign="bottom" height={28} />
        </LineChart>
      </ResponsiveContainer>
      <div className="flex gap-4 mt-3 flex-wrap text-xs text-muted-foreground">
        <span><span className="inline-block w-2 h-2 rounded-full bg-[hsl(141_72%_50%)] mr-1" />Peak (TSB &gt; 5)</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-secondary mr-1" />Optimal (-10 to 5)</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-destructive/60 mr-1" />Fatigued (&lt; -10)</span>
      </div>
    </div>
  );
}

// ── 2. Weekly Mileage (running only, pre-filtered) ──
function WeeklyMileageChartSimple({ activities }: { activities: { date: string; type: string | null; distance_km: number | null }[] }) {
  const chartData = useMemo(() => {
    const weeks: Record<string, number> = {};
    for (const a of activities) {
      if (!a.date || !a.distance_km) continue;
      const d = new Date(a.date);
      const wk = fmt(startOfWeek(d, { weekStartsOn: 1 }));
      weeks[wk] = (weeks[wk] ?? 0) + a.distance_km;
    }
    return Object.entries(weeks)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-16)
      .map(([week, km]) => ({ week: format(new Date(week), "MMM d"), km: Math.round(km * 10) / 10 }));
  }, [activities]);

  if (!chartData.length) return <EmptyState message="No weekly mileage yet" sub="Connect intervals.icu in Settings to sync your runs" />;

  return (
    <div className="h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="week" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
          <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} unit=" km" />
          <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }} />
          <Bar dataKey="km" fill="hsl(211 100% 52%)" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── 3. Pace Progression Scatter (running only) ──
type PaceFilter = "all" | "easy" | "tempo" | "long";
function PaceProgressionChart({ activities }: { activities: { date: string; type: string | null; avg_pace: string | null; distance_km: number | null }[] }) {
  const runningOnly = useMemo(() => activities.filter((a) => isRunningActivity(a.type)), [activities]);
  const [filter, setFilter] = useState<PaceFilter>("all");

  const { points, trendline } = useMemo(() => {
    const pts = runningOnly
      .filter((a) => {
        const pace = parsePaceToMinPerKm(a.avg_pace);
        if (!pace || !a.date || pace < 2 || pace > 25) return false;
        const t = inferRunType(a.type);
        if (filter !== "all" && t !== filter) return false;
        return true;
      })
      .map((a) => ({
        date: a.date,
        pace: parsePaceToMinPerKm(a.avg_pace)!,
        type: inferRunType(a.type),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const win = 4 * 7;
    const trend = pts.map((p, i) => {
      const slice = pts.slice(Math.max(0, i - win + 1), i + 1);
      const avg = slice.length ? slice.reduce((s, x) => s + x.pace, 0) / slice.length : p.pace;
      return { ...p, trend: Math.round(avg * 100) / 100 };
    });

    return { points: pts, trendline: trend };
  }, [runningOnly, filter]);

  if (!points.length) return <EmptyState message="No pace data yet" sub="Connect intervals.icu to sync runs with pace data" />;

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {(["all", "easy", "tempo", "long"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filter === f ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:bg-secondary/80"}`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trendline} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => format(new Date(v), "MMM d")} />
            <YAxis dataKey="pace" type="number" tick={{ fontSize: 11 }} domain={[2, 12]} tickFormatter={formatPaceTick} reversed />
            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12 }} labelFormatter={(v) => format(new Date(v), "MMM d")} formatter={(val: number) => [formatPaceFromMinPerKm(val), "Pace"]} />
            <Line type="monotone" dataKey="pace" stroke="hsl(211 100% 52%)" strokeWidth={1} dot={{ r: 3 }} name="Pace" />
            <Line type="monotone" dataKey="trend" stroke="hsl(var(--foreground))" strokeWidth={2} dot={false} strokeDasharray="4 4" name="4w avg" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── 4. Personal Records Table (running only) ──
function PersonalRecordsTable({ activities }: { activities: { id: string; date: string; type: string | null; distance_km: number | null; duration_seconds: number | null; splits: unknown }[] }) {
  const runningOnly = useMemo(() => activities.filter((a) => isRunningActivity(a.type)), [activities]);
  const prs = useMemo(() => {
    return PR_DISTANCES.map(({ key, km, label }) => {
      const best = findBestForDistance(runningOnly, km);
      if (!best) return { key, label, km, best: null };
      const activityLinkId = best.externalId ? `icu_${best.externalId}` : best.activityId;
      return {
        key,
        label,
        km,
        best: {
          timeSec: best.timeSec,
          pace: best.paceMinPerKm,
          date: best.date,
          activityLinkId,
        },
      };
    });
  }, [runningOnly]);

  const latestDate = prs.reduce((m, p) => (p.best && p.best.date > m ? p.best.date : m), "");

  if (prs.every((p) => !p.best)) return <EmptyState message="No PRs yet" sub="Run race distances to see records" />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 font-medium text-muted-foreground">Distance</th>
            <th className="text-left py-2 font-medium text-muted-foreground">Best Time</th>
            <th className="text-left py-2 font-medium text-muted-foreground">Pace</th>
            <th className="text-left py-2 font-medium text-muted-foreground">Date</th>
          </tr>
        </thead>
        <tbody>
          {prs.map((p) => {
            if (!p.best) return null;
            const timeStr = formatDuration(p.best.timeSec);
            const paceStr = formatPaceFromMinPerKm(p.best.pace);
            const isLatest = p.best.date === latestDate;
            return (
              <tr
                key={p.key}
                className="border-b border-border/50 hover:bg-secondary/30 transition-colors cursor-pointer"
                onClick={() => navigate(`/activities/${p.best!.activityLinkId}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && navigate(`/activities/${p.best!.activityLinkId}`)}
              >
                <td className="py-2 font-medium text-foreground">{p.label}</td>
                <td className="py-2 text-foreground">{timeStr}</td>
                <td className="py-2 text-muted-foreground">{paceStr}</td>
                <td className="py-2 text-muted-foreground flex items-center gap-1">
                  {format(new Date(p.best.date), "MMM d, yyyy")}
                  {isLatest && <span className="text-xs px-1.5 py-0.5 rounded-full bg-accent/20 text-accent">Latest</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── 5. HR Efficiency Trend ──
function HREfficiencyChart({ activities }: { activities: { date: string; avg_hr: number | null; avg_pace: string | null }[] }) {
  const chartData = useMemo(() => {
    return activities
      .filter((a) => {
        const pace = parsePaceToMinPerKm(a.avg_pace);
        return a.avg_hr != null && a.avg_hr >= 140 && a.avg_hr <= 150 && pace != null && pace >= 2 && pace <= 25;
      })
      .map((a) => ({ date: a.date, pace: parsePaceToMinPerKm(a.avg_pace)!, hr: a.avg_hr }))
      .slice(-12 * 7)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [activities]);

  if (!chartData.length) return <EmptyState message="No aerobic HR runs yet" sub="Runs with avg HR 140–150 bpm" />;

  const validPaces = chartData.map((d) => d.pace).filter((p) => p >= 2 && p <= 25);
  const yMin = validPaces.length ? Math.max(2, Math.floor(Math.min(...validPaces) * 10) / 10 - 0.2) : 4;
  const yMax = validPaces.length ? Math.min(25, Math.ceil(Math.max(...validPaces) * 10) / 10 + 0.2) : 8;

  return (
    <div className="h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => format(new Date(v), "MMM d")} />
          <YAxis tick={{ fontSize: 11 }} domain={[yMin, yMax]} tickFormatter={formatPaceTick} reversed />
          <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12 }} labelFormatter={(v) => format(new Date(v), "MMM d")} formatter={(val: number) => [formatPaceFromMinPerKm(val), "Pace"]} />
          <Line type="monotone" dataKey="pace" stroke="hsl(211 100% 52%)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
      <p className="text-xs text-muted-foreground mt-2">Pace at aerobic HR (140–150 bpm). Faster over time = improved aerobic fitness.</p>
    </div>
  );
}

// ── 6. HRV Trend (from daily_readiness) ──
function HRVChart({ readiness }: { readiness: { date: string; hrv: number | null }[] }) {
  const chartData = readiness
    .filter((r) => r.hrv != null)
    .map((r) => ({ date: r.date, hrv: r.hrv }))
    .slice(-120)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!chartData.length) return <EmptyState message="No HRV data yet" sub="Connect intervals.icu to sync wellness data" />;
  return (
    <div className="h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => format(new Date(v), "MMM d")} />
          <YAxis tick={{ fontSize: 11 }} unit=" ms" tickFormatter={(v) => Math.round(v).toString()} />
          <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12 }} labelFormatter={(v) => format(new Date(v), "MMM d")} formatter={(val: number) => [`${Math.round(val)} ms`, "HRV"]} />
          <Line type="monotone" dataKey="hrv" stroke="hsl(280 70% 55%)" strokeWidth={2} dot={{ r: 2 }} name="HRV" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── 7. Readiness Score (from score, or derived from TSB/CTL when available) ──
function ReadinessScoreChart({ readiness }: { readiness: { date: string; score?: number | null; tsb?: number | null; ctl?: number | null; atl?: number | null; icu_ctl?: number | null; icu_atl?: number | null; icu_tsb?: number | null }[] }) {
  const chartData = readiness
    .filter((r) => {
      const { ctl, tsb } = resolveCtlAtlTsb(r);
      return r.score != null || tsb != null || ctl != null;
    })
    .map((r) => {
      const { ctl, tsb } = resolveCtlAtlTsb(r);
      const score = r.score ?? (tsb != null ? Math.round(Math.min(100, Math.max(0, 50 + tsb * 2.5))) : (ctl != null ? Math.round(Math.min(100, Math.max(0, ctl))) : null));
      return { date: r.date, score: score ?? 0 };
    })
    .filter((r) => r.score > 0)
    .slice(-120)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!chartData.length) return <EmptyState message="No readiness score data" sub="Connect intervals.icu in Settings to sync readiness scores" />;
  return (
    <div className="h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => format(new Date(v), "MMM d")} />
          <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} unit="" />
          <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12 }} labelFormatter={(v) => format(new Date(v), "MMM d")} formatter={(val: number) => [`${Math.round(val)}`, "Score"]} />
          <Line type="monotone" dataKey="score" stroke="hsl(211 100% 52%)" strokeWidth={2} dot={{ r: 2 }} name="Score" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── 8. VO2max Trend (from intervals.icu wellness) ──
function VO2maxChart({ readiness }: { readiness: { date: string; vo2max?: number | null }[] }) {
  const chartData = readiness
    .filter((r) => r.vo2max != null)
    .map((r) => ({ date: r.date, vo2max: r.vo2max }))
    .slice(-120)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!chartData.length) return <EmptyState message="No VO2max data yet" sub="Connect intervals.icu to sync estimated VO2max" />;
  return (
    <div className="h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => format(new Date(v), "MMM d")} />
          <YAxis tick={{ fontSize: 11 }} domain={["dataMin - 2", "dataMax + 2"]} unit="" tickFormatter={(v) => `${Number(v).toFixed(1)}`} />
          <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12 }} labelFormatter={(v) => format(new Date(v), "MMM d")} formatter={(val: number) => [`${val?.toFixed(1)} ml/kg/min`, "VO2max"]} />
          <Line type="monotone" dataKey="vo2max" stroke="hsl(160 70% 45%)" strokeWidth={2} dot={{ r: 2 }} name="VO2max" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── 9. Ramp Rate (fitness change rate) ──
function RampRateChart({ readiness }: { readiness: { date: string; ramp_rate?: number | null }[] }) {
  const chartData = readiness
    .filter((r) => r.ramp_rate != null)
    .map((r) => ({ date: r.date, rampRate: r.ramp_rate }))
    .slice(-120)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!chartData.length) return <EmptyState message="No ramp rate data yet" sub="Connect intervals.icu for fitness ramp rate" />;
  return (
    <div className="h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => format(new Date(v), "MMM d")} />
          <YAxis tick={{ fontSize: 11 }} unit="" tickFormatter={(v) => `${Number(v).toFixed(1)}`} />
          <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12 }} labelFormatter={(v) => format(new Date(v), "MMM d")} formatter={(val: number) => [`${val?.toFixed(2)} /week`, "Ramp rate"]} />
          <Line type="monotone" dataKey="rampRate" stroke="hsl(280 70% 55%)" strokeWidth={2} dot={{ r: 2 }} name="Ramp rate" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── 10. Sleep Score (from intervals.icu) ──
function SleepScoreChart({ readiness }: { readiness: { date: string; sleep_score?: number | null }[] }) {
  const chartData = readiness
    .filter((r) => r.sleep_score != null)
    .map((r) => ({ date: r.date, score: r.sleep_score }))
    .slice(-120)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!chartData.length) return <EmptyState message="No sleep score data yet" sub="Connect intervals.icu to sync sleep score data" />;
  return (
    <div className="h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => format(new Date(v), "MMM d")} />
          <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} unit="" />
          <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12 }} labelFormatter={(v) => format(new Date(v), "MMM d")} formatter={(val: number) => [`${Math.round(val)}`, "Sleep score"]} />
          <Line type="monotone" dataKey="score" stroke="hsl(220 70% 55%)" strokeWidth={2} dot={{ r: 2 }} name="Sleep score" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── 11. Sleep & Resting HR (from daily_readiness) ──
function SleepRestingChart({ readiness }: { readiness: { date: string; sleep_hours: number | null; resting_hr: number | null }[] }) {
  const chartData = readiness
    .filter((r) => r.sleep_hours != null || r.resting_hr != null)
    .map((r) => ({ date: r.date, sleep: r.sleep_hours, restingHr: r.resting_hr }))
    .slice(-120)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!chartData.length) return <EmptyState message="No sleep/HR data yet" sub="Connect intervals.icu to sync wellness data" />;
  return (
    <div className="h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => format(new Date(v), "MMM d")} />
          <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(v: number) => { const h = Math.floor(v); const m = Math.round((v - h) * 60); return m > 0 ? `${h}h${m}m` : `${h}h`; }} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v: number) => String(Math.round(v))} unit=" bpm" />
          <Tooltip
            contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12 }}
            labelFormatter={(v) => format(new Date(v), "MMM d")}
            formatter={(val: number, name: string) => {
              if (name === "Sleep (h)") { const h = Math.floor(val); const m = Math.round((val - h) * 60); return [`${h}h ${m}m`, "Sleep"]; }
              if (name === "Resting HR") return [`${Math.round(val)} bpm`, "Resting HR"];
              return [String(val), name];
            }}
          />
          <Line yAxisId="left" type="monotone" dataKey="sleep" stroke="hsl(220 70% 50%)" strokeWidth={2} dot={{ r: 2 }} name="Sleep (h)" />
          <Line yAxisId="right" type="monotone" dataKey="restingHr" stroke="hsl(0 70% 55%)" strokeWidth={2} dot={{ r: 2 }} name="Resting HR" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

type StatsTab = "runs" | "wellness";

function RunningStatsSection({
  activities,
  readiness,
}: {
  activities: { date: string; type: string | null; distance_km: number | null; duration_seconds: number | null; avg_hr: number | null; avg_pace: string | null; id: string; splits: unknown }[];
  readiness: { date: string; ctl: number | null; atl: number | null; tsb: number | null }[];
}) {
  const runningActivities = useMemo(
    () => activities.filter((a) => isRunningActivity(a.type) && (a.distance_km ?? 0) <= 150),
    [activities]
  );
  return (
    <>
      <ChartCard icon={TrendingUp} title="Fitness & Fatigue (CTL / ATL / TSB) — 16 weeks" info="fitness">
        <FitnessChart activities={runningActivities} readiness={readiness} />
      </ChartCard>
      <ChartCard icon={BarChart3} title="Weekly Mileage — 16 weeks (runs only)" info="mileage">
        <WeeklyMileageChartSimple activities={runningActivities} />
      </ChartCard>
      <ChartCard icon={Activity} title="Pace Progression (runs only)" info="pace">
        <PaceProgressionChart activities={runningActivities} />
      </ChartCard>
      <ChartCard icon={Trophy} title="Personal Records (runs only)" info="prs">
        <PersonalRecordsTable activities={runningActivities} />
      </ChartCard>
      <ChartCard icon={Heart} title="HR Efficiency Trend — aerobic pace (140–150 bpm)" info="hrEfficiency">
        <HREfficiencyChart activities={runningActivities} />
      </ChartCard>
    </>
  );
}

// ── Main Page ──
export default function Stats() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<StatsTab>("runs");
  const { isConnected: intervalsConnected, isLoading: intervalsLoading } = useIntervalsIntegration();
  const { data: activities = [], isLoading: activitiesLoading } = useMergedActivities(730);
  const { data: readiness = [], isLoading: readinessLoading } = useMergedReadiness(730);
  useEffect(() => {
    if (readiness.length > 0 && activities.length === 0) setTab("wellness");
  }, [readiness.length, activities.length]);

  const isLoading = intervalsLoading || activitiesLoading || readinessLoading;
  const hasData = activities.length > 0 || readiness.length > 0;

  if (isLoading && !hasData) {
    return (
      <AppLayout>
        <div className="animate-fade-in space-y-6">
          <h1 className="text-2xl font-semibold text-foreground">Stats & Analytics</h1>
          <div className="space-y-5">
            <ChartCard icon={TrendingUp} title="Fitness & Fatigue"><LoadingSkeleton /></ChartCard>
            <ChartCard icon={BarChart3} title="Weekly Mileage"><LoadingSkeleton /></ChartCard>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!hasData) {
    return (
      <AppLayout>
        <div className="animate-fade-in space-y-6">
          <h1 className="text-2xl font-semibold text-foreground">Stats & Analytics</h1>
          <div className="glass-card p-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
              <Link2 className="w-7 h-7 text-primary" />
            </div>
            <h2 className="text-lg font-medium text-foreground mb-2">Connect intervals.icu to see stats</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
              Connect intervals.icu in Settings to sync your activities and wellness data — CTL/ATL/TSB, weekly mileage, pace trends, PRs, HRV, and sleep.
            </p>
            <button onClick={() => navigate("/settings")} className="pill-button bg-primary text-primary-foreground gap-2">
              Go to Settings
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h1 className="text-2xl font-semibold text-foreground">Stats & Analytics</h1>
          <div className="flex rounded-lg bg-muted/60 p-1">
            <button
              onClick={() => setTab("runs")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === "runs" ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
            >
              Runs & Fitness
            </button>
            <button
              onClick={() => setTab("wellness")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === "wellness" ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
            >
              Wellness
            </button>
          </div>
        </div>

        {tab === "runs" && (
          <div className="space-y-5">
            <RunningStatsSection activities={activities} readiness={readiness} />
          </div>
        )}

        {tab === "wellness" && (
          <div className="space-y-4">
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Fitness & fatigue</h2>
              <ChartCard icon={TrendingUp} title="CTL / ATL / TSB" info="fitness">
                <FitnessChart activities={activities.filter((a) => isRunningActivity(a.type))} readiness={readiness} />
              </ChartCard>
            </div>
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Wellness scores</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <ChartCard icon={Activity} title="Readiness Score" info="readiness">
                  <ReadinessScoreChart readiness={readiness} />
                </ChartCard>
                <ChartCard icon={Moon} title="Sleep Score" info="sleep">
                  <SleepScoreChart readiness={readiness} />
                </ChartCard>
              </div>
            </div>
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">HR & recovery</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <ChartCard icon={Zap} title="HRV Trend" info="hrv">
                  <HRVChart readiness={readiness} />
                </ChartCard>
                <ChartCard icon={Heart} title="Sleep & Resting HR" info="sleepResting">
                  <SleepRestingChart readiness={readiness} />
                </ChartCard>
              </div>
            </div>
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Fitness metrics</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <ChartCard icon={Wind} title="VO2max" info="vo2max">
                  <VO2maxChart readiness={readiness} />
                </ChartCard>
                <ChartCard icon={BarChart3} title="Ramp Rate" info="rampRate">
                  <RampRateChart readiness={readiness} />
                </ChartCard>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
