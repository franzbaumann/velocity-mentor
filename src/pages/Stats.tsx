import { AppLayout } from "@/components/AppLayout";
import { useIntervalsIntegration, useIntervalsData } from "@/hooks/useIntervalsIntegration";
import { BarChart3, Link2, ArrowRight, Activity, Heart, Moon, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format, subDays, subWeeks, startOfWeek, endOfWeek } from "date-fns";
import { useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";

const fmt = (d: Date) => format(d, "yyyy-MM-dd");
const now = new Date();
const oldest16w = fmt(subWeeks(now, 16));
const oldest30d = fmt(subDays(now, 30));
const newest = fmt(now);

function ChartCard({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div className="glass-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-card/60 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">{title}</span>
        </div>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function LoadingChart() {
  return <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">Loading…</div>;
}

function ErrorChart({ message }: { message: string }) {
  return <div className="h-[260px] flex items-center justify-center text-sm text-destructive">{message}</div>;
}

// ── Fitness Chart (CTL / ATL / TSB) ──
function FitnessChart() {
  const { data: raw, isLoading, error } = useIntervalsData("wellness", oldest16w, newest);

  const chartData = useMemo(() => {
    if (!raw || !Array.isArray(raw)) return [];
    return raw
      .filter((d: any) => d.ctl != null || d.atl != null || d.tsb != null)
      .map((d: any) => ({
        date: d.id ?? d.date,
        CTL: d.ctl ?? null,
        ATL: d.atl ?? null,
        TSB: d.tsb ?? null,
      }));
  }, [raw]);

  if (isLoading) return <LoadingChart />;
  if (error) return <ErrorChart message="Failed to load fitness data" />;
  if (!chartData.length) return <ErrorChart message="No fitness data available" />;

  return (
    <div className="h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => format(new Date(v), "MMM d")} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
          <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }} />
          <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
          <Area type="monotone" dataKey="TSB" stroke="hsl(141 72% 50%)" fill="hsl(141 72% 50% / 0.15)" strokeWidth={1.5} />
          <Line type="monotone" dataKey="CTL" stroke="hsl(211 100% 52%)" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="ATL" stroke="hsl(36 100% 52%)" strokeWidth={2} dot={false} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Weekly Mileage ──
function WeeklyMileageChart() {
  const { data: raw, isLoading, error } = useIntervalsData("activities", oldest16w, newest);

  const chartData = useMemo(() => {
    if (!raw || !Array.isArray(raw)) return [];
    const weeks: Record<string, number> = {};
    for (const a of raw) {
      if (!a.start_date_local && !a.date) continue;
      const d = new Date(a.start_date_local ?? a.date);
      const wk = fmt(startOfWeek(d, { weekStartsOn: 1 }));
      const dist = a.distance != null ? a.distance / 1000 : (a.moving_time ? 0 : 0);
      weeks[wk] = (weeks[wk] ?? 0) + dist;
    }
    return Object.entries(weeks)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, km]) => ({ week: format(new Date(week), "MMM d"), km: Math.round(km * 10) / 10 }));
  }, [raw]);

  if (isLoading) return <LoadingChart />;
  if (error) return <ErrorChart message="Failed to load activity data" />;
  if (!chartData.length) return <ErrorChart message="No activity data available" />;

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

// ── HRV Trend ──
function HrvChart() {
  const { data: raw, isLoading, error } = useIntervalsData("wellness", oldest30d, newest);

  const chartData = useMemo(() => {
    if (!raw || !Array.isArray(raw)) return [];
    const points = raw
      .filter((d: any) => d.hrv != null)
      .map((d: any) => ({ date: d.id ?? d.date, HRV: d.hrv }));
    // 7-day rolling avg
    return points.map((p: any, i: number) => {
      const slice = points.slice(Math.max(0, i - 6), i + 1);
      const avg = slice.reduce((s: number, x: any) => s + x.HRV, 0) / slice.length;
      return { ...p, Avg7: Math.round(avg) };
    });
  }, [raw]);

  if (isLoading) return <LoadingChart />;
  if (error) return <ErrorChart message="Failed to load HRV data" />;
  if (!chartData.length) return <ErrorChart message="No HRV data available" />;

  return (
    <div className="h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => format(new Date(v), "MMM d")} />
          <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
          <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }} />
          <Line type="monotone" dataKey="HRV" stroke="hsl(var(--muted-foreground))" strokeWidth={1} dot={{ r: 2, fill: "hsl(var(--muted-foreground))" }} />
          <Line type="monotone" dataKey="Avg7" stroke="hsl(141 72% 50%)" strokeWidth={2} dot={false} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Resting HR ──
function RestingHrChart() {
  const { data: raw, isLoading, error } = useIntervalsData("wellness", oldest30d, newest);

  const chartData = useMemo(() => {
    if (!raw || !Array.isArray(raw)) return [];
    return raw
      .filter((d: any) => d.restingHR != null)
      .map((d: any) => ({ date: d.id ?? d.date, RHR: d.restingHR }));
  }, [raw]);

  if (isLoading) return <LoadingChart />;
  if (error) return <ErrorChart message="Failed to load resting HR data" />;
  if (!chartData.length) return <ErrorChart message="No resting HR data available" />;

  return (
    <div className="h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => format(new Date(v), "MMM d")} />
          <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} domain={["dataMin - 2", "dataMax + 2"]} unit=" bpm" />
          <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }} />
          <Line type="monotone" dataKey="RHR" stroke="hsl(0 84% 60%)" strokeWidth={2} dot={{ r: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Sleep Duration ──
function SleepChart() {
  const { data: raw, isLoading, error } = useIntervalsData("wellness", oldest30d, newest);

  const chartData = useMemo(() => {
    if (!raw || !Array.isArray(raw)) return [];
    return raw
      .filter((d: any) => d.sleepSecs != null || d.sleepHours != null)
      .map((d: any) => ({
        date: d.id ?? d.date,
        Hours: d.sleepHours ?? (d.sleepSecs ? Math.round((d.sleepSecs / 3600) * 10) / 10 : 0),
      }));
  }, [raw]);

  if (isLoading) return <LoadingChart />;
  if (error) return <ErrorChart message="Failed to load sleep data" />;
  if (!chartData.length) return <ErrorChart message="No sleep data available" />;

  return (
    <div className="h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => format(new Date(v), "MMM d")} />
          <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} unit="h" />
          <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }} />
          <ReferenceLine y={8} stroke="hsl(141 72% 50% / 0.5)" strokeDasharray="4 4" label={{ value: "8h target", position: "right", fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
          <Bar dataKey="Hours" fill="hsl(211 100% 52% / 0.7)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Main Page ──
export default function Stats() {
  const { isConnected, isLoading } = useIntervalsIntegration();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <AppLayout>
        <div className="animate-fade-in space-y-6">
          <h1 className="text-2xl font-semibold text-foreground">Stats & Progress</h1>
          <LoadingChart />
        </div>
      </AppLayout>
    );
  }

  if (!isConnected) {
    return (
      <AppLayout>
        <div className="animate-fade-in space-y-6">
          <h1 className="text-2xl font-semibold text-foreground">Stats & Progress</h1>
          <div className="glass-card p-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
              <Link2 className="w-7 h-7 text-primary" />
            </div>
            <h2 className="text-lg font-medium text-foreground mb-2">
              Connect intervals.icu
            </h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
              Link your intervals.icu account to see fitness charts, mileage, HRV, and more.
            </p>
            <div className="text-left max-w-sm mx-auto mb-6 space-y-2">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">1.</span> Go to{" "}
                <a href="https://intervals.icu/settings" target="_blank" rel="noopener noreferrer" className="text-primary underline">intervals.icu → Settings</a>
              </p>
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">2.</span> Copy your <span className="font-medium text-foreground">Athlete ID</span> (starts with <code className="text-xs bg-secondary px-1.5 py-0.5 rounded">i</code>)
              </p>
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">3.</span> Under <span className="font-medium text-foreground">API</span>, create an API key
              </p>
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">4.</span> Paste both in{" "}
                <span className="font-medium text-foreground">Settings → intervals.icu</span>
              </p>
            </div>
            <button
              onClick={() => navigate("/settings")}
              className="pill-button bg-primary text-primary-foreground gap-2"
            >
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
        <h1 className="text-2xl font-semibold text-foreground">Stats & Progress</h1>

        <ChartCard icon={TrendingUp} title="Fitness & Fatigue (CTL / ATL / TSB) — 16 weeks">
          <FitnessChart />
        </ChartCard>

        <ChartCard icon={BarChart3} title="Weekly Mileage — 16 weeks">
          <WeeklyMileageChart />
        </ChartCard>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <ChartCard icon={Activity} title="HRV Trend — 30 days">
            <HrvChart />
          </ChartCard>
          <ChartCard icon={Heart} title="Resting HR — 30 days">
            <RestingHrChart />
          </ChartCard>
        </div>

        <ChartCard icon={Moon} title="Sleep Duration — 30 days">
          <SleepChart />
        </ChartCard>
      </div>
    </AppLayout>
  );
}
