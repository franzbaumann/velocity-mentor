import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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
} from "recharts";
import { format } from "date-fns";
import { TrendingUp, Heart, Activity, Moon, Zap, Wind } from "lucide-react";
import type { StatType, ChartDataPoint } from "@/lib/stat-detection";
import {
  detectStats as detectStatsFromText,
  buildFitnessData,
  buildHrvData,
  buildMileageData,
  buildSleepData,
  buildRestingHrData,
  buildVO2maxData,
} from "@/lib/stat-detection";
import type { ReadinessRow } from "@/hooks/useReadiness";
import type { ActivityRow } from "@/hooks/useActivities";
import { supabase } from "@/integrations/supabase/client";

interface ChatStatChartProps {
  statType: StatType;
  readiness: ReadinessRow[];
  activities: ActivityRow[];
  lastRunId?: string;
  lastRunName?: string;
}

const CHART_META: Record<
  StatType,
  {
    title: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    unit: string;
  }
> = {
  fitness: { title: "Fitness Trend", icon: TrendingUp, color: "hsl(211 100% 52%)", unit: "" },
  hrv: { title: "HRV Trend", icon: Heart, color: "hsl(280 70% 55%)", unit: " ms" },
  mileage: { title: "Weekly Mileage", icon: Activity, color: "hsl(211 100% 52%)", unit: " km" },
  sleep: { title: "Sleep Score", icon: Moon, color: "hsl(262 70% 55%)", unit: "" },
  resting_hr: { title: "Resting Heart Rate", icon: Zap, color: "hsl(0 84% 60%)", unit: " bpm" },
  vo2max: { title: "VO2max Trend", icon: Wind, color: "hsl(160 70% 45%)", unit: "" },
  last_activity: { title: "Run", icon: Activity, color: "hsl(211 100% 52%)", unit: "" },
};

function MiniTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: { value: number; name: string; color: string }[];
  label?: string;
  unit: string;
}) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="rounded-lg border border-border bg-card/95 backdrop-blur-sm px-2.5 py-1.5 shadow-lg text-xs">
      <p className="font-medium text-foreground mb-0.5">
        {format(new Date(label), "MMM d")}
      </p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {typeof p.value === "number" ? p.value.toFixed(1) : p.value}
          {unit}
        </p>
      ))}
    </div>
  );
}

function FitnessMiniChart({ data }: { data: ChartDataPoint[] }) {
  const yValues = data.flatMap((d) =>
    [d.CTL, d.ATL, d.TSB].filter((v): v is number => v != null)
  );
  if (!yValues.length) return null;
  const yMin = Math.min(...yValues);
  const yMax = Math.max(...yValues);
  const pad = Math.max(3, (yMax - yMin) * 0.15);

  const tickInterval = data.length > 60 ? Math.floor(data.length / 6) : "preserveStartEnd";

  return (
    <div className="w-full h-[180px] min-h-[180px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickFormatter={(v) => format(new Date(v), "MMM d")}
            interval={tickInterval}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickFormatter={(v) => Math.round(v).toString()}
            domain={[Math.floor(yMin - pad), Math.ceil(yMax + pad)]}
          />
          <Tooltip content={<MiniTooltip unit="" />} />
          <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" opacity={0.4} />
          <Line type="natural" dataKey="CTL" stroke="hsl(211 100% 52%)" strokeWidth={2} dot={false} name="CTL" connectNulls animationDuration={800} animationEasing="ease-out" />
          <Line type="natural" dataKey="ATL" stroke="hsl(36 100% 52%)" strokeWidth={2} dot={false} name="ATL" connectNulls animationDuration={900} animationEasing="ease-out" />
          <Line type="natural" dataKey="TSB" stroke="hsl(141 72% 50%)" strokeWidth={1.5} dot={false} name="TSB" connectNulls animationDuration={1000} animationEasing="ease-out" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function SimpleMiniLine({
  data,
  dataKey,
  color,
  unit,
}: {
  data: ChartDataPoint[];
  dataKey: string;
  color: string;
  unit: string;
}) {
  const tickInterval = data.length > 60 ? Math.floor(data.length / 6) : "preserveStartEnd";

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickFormatter={(v) => format(new Date(v), "MMM d")}
          interval={tickInterval}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickFormatter={(v) => Math.round(v).toString()}
          unit={unit}
        />
        <Tooltip content={<MiniTooltip unit={unit} />} />
        <Line
          type="natural"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2}
          dot={false}
          connectNulls
          animationDuration={800}
          animationEasing="ease-out"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function MileageMiniBar({ data }: { data: ChartDataPoint[] }) {
  return (
    <div className="w-full h-[180px] min-h-[180px]">
      <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickFormatter={(v) => format(new Date(v), "MMM d")}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          unit=" km"
        />
        <Tooltip content={<MiniTooltip unit=" km" />} />
        <Bar
          dataKey="km"
          fill="hsl(211 100% 52%)"
          radius={[4, 4, 0, 0]}
          animationDuration={800}
          animationEasing="ease-out"
        />
      </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface ActivityStreamPoint {
  t: number;
  pace: number | null;
  hr: number | null;
}

function downsample<T>(arr: T[], target: number): T[] {
  if (arr.length <= target) return arr;
  const step = arr.length / target;
  return Array.from({ length: target }, (_, i) => arr[Math.round(i * step)]);
}

function ActivityPaceHrChart({ activityId, activityName }: { activityId: string; activityName?: string }) {
  const { data: streams, isLoading } = useQuery({
    queryKey: ["activity-streams-chat", activityId],
    queryFn: async () => {
      const { data } = await supabase
        .from("activity_streams")
        .select("time, heartrate, pace")
        .eq("activity_id", activityId)
        .maybeSingle();
      return data as { time: number[] | null; heartrate: number[] | null; pace: number[] | null } | null;
    },
    staleTime: 5 * 60 * 1000,
  });

  const chartData = useMemo((): ActivityStreamPoint[] => {
    if (!streams) return [];
    const time = streams.time ?? [];
    const hr = streams.heartrate ?? [];
    const pace = streams.pace ?? [];
    const len = Math.max(time.length, hr.length, pace.length);
    if (len === 0) return [];
    const raw: ActivityStreamPoint[] = Array.from({ length: len }, (_, i) => ({
      t: time[i] != null ? Math.round(time[i] / 60) : i,
      pace: pace[i] != null && pace[i] > 0 && pace[i] < 20 ? Math.round(pace[i] * 100) / 100 : null,
      hr: hr[i] != null && hr[i] > 40 && hr[i] < 220 ? hr[i] : null,
    }));
    return downsample(raw, 120);
  }, [streams]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[200px] text-muted-foreground text-xs">
        Loading chart…
      </div>
    );
  }

  if (!chartData.length) {
    return (
      <div className="flex items-center justify-center h-[200px] text-muted-foreground text-xs">
        No stream data for this activity
      </div>
    );
  }

  const hasPace = chartData.some((d) => d.pace != null);
  const hasHr = chartData.some((d) => d.hr != null);

  const paceVals = chartData.map((d) => d.pace).filter((v): v is number => v != null);
  const hrVals = chartData.map((d) => d.hr).filter((v): v is number => v != null);
  const paceMin = Math.max(2, Math.min(...paceVals) - 0.5);
  const paceMax = Math.min(15, Math.max(...paceVals) + 0.5);
  const hrMin = Math.max(40, Math.min(...hrVals) - 10);
  const hrMax = Math.min(220, Math.max(...hrVals) + 10);

  const paceFormatter = (v: number) => {
    const min = Math.floor(v);
    const sec = Math.round((v - min) * 60);
    return `${min}:${String(sec).padStart(2, "0")}`;
  };

  return (
    <div className="w-full h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
          <XAxis
            dataKey="t"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickFormatter={(v) => `${v}m`}
            interval="preserveStartEnd"
          />
          {hasPace && (
            <YAxis
              yAxisId="pace"
              orientation="left"
              domain={[paceMin, paceMax]}
              reversed
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={paceFormatter}
            />
          )}
          {hasHr && (
            <YAxis
              yAxisId="hr"
              orientation="right"
              domain={[hrMin, hrMax]}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={(v) => `${v}`}
            />
          )}
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="rounded-lg border border-border bg-card/95 backdrop-blur-sm px-2.5 py-1.5 shadow-lg text-xs">
                  <p className="font-medium text-foreground mb-0.5">{label}m</p>
                  {payload.map((p) => (
                    <p key={p.name} style={{ color: p.color as string }}>
                      {p.name === "pace"
                        ? `Pace: ${paceFormatter(p.value as number)}/km`
                        : `HR: ${p.value} bpm`}
                    </p>
                  ))}
                </div>
              );
            }}
          />
          {hasPace && (
            <Line
              yAxisId="pace"
              type="monotone"
              dataKey="pace"
              stroke="hsl(211 100% 52%)"
              strokeWidth={1.5}
              dot={false}
              connectNulls
              name="pace"
              animationDuration={600}
            />
          )}
          {hasHr && (
            <Line
              yAxisId="hr"
              type="monotone"
              dataKey="hr"
              stroke="hsl(36 100% 52%)"
              strokeWidth={1.5}
              dot={false}
              connectNulls
              name="hr"
              animationDuration={700}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ChartRenderer({ statType, data, meta }: { statType: StatType; data: ChartDataPoint[]; meta: typeof CHART_META[StatType] }) {
  switch (statType) {
    case "fitness":
      return <FitnessMiniChart data={data} />;
    case "mileage":
      return <MileageMiniBar data={data} />;
    case "hrv":
      return <SimpleMiniLine data={data} dataKey="HRV" color={meta.color} unit={meta.unit} />;
    case "sleep":
      return <SimpleMiniLine data={data} dataKey="sleep" color={meta.color} unit="" />;
    case "resting_hr":
      return <SimpleMiniLine data={data} dataKey="rhr" color={meta.color} unit={meta.unit} />;
    case "vo2max":
      return <SimpleMiniLine data={data} dataKey="vo2max" color={meta.color} unit="" />;
    default:
      return null;
  }
}

export function ChatStatChart({ statType, readiness, activities, lastRunId, lastRunName }: ChatStatChartProps) {
  const meta = CHART_META[statType];
  const Icon = meta.icon;

  // Activity chart: handled separately — no chartData needed
  if (statType === "last_activity") {
    if (!lastRunId) return null;
    const title = lastRunName ?? "Last Run";
    return (
      <div className="animate-chart-in rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm overflow-hidden">
        <div className="flex items-center justify-between px-3.5 py-2 border-b border-border/40">
          <div className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-foreground">{title}</span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span style={{ display: "inline-block", width: 8, height: 2, background: "hsl(211 100% 52%)", borderRadius: 1 }} />
              Pace
            </span>
            <span className="flex items-center gap-1">
              <span style={{ display: "inline-block", width: 8, height: 2, background: "hsl(36 100% 52%)", borderRadius: 1 }} />
              HR
            </span>
          </div>
        </div>
        <div className="px-2 py-2">
          <ActivityPaceHrChart activityId={lastRunId} activityName={lastRunName} />
        </div>
      </div>
    );
  }

  const chartData = useMemo(() => {
    switch (statType) {
      case "fitness":
        return buildFitnessData(readiness);
      case "hrv":
        return buildHrvData(readiness);
      case "mileage":
        return buildMileageData(activities);
      case "sleep":
        return buildSleepData(readiness);
      case "resting_hr":
        return buildRestingHrData(readiness);
      case "vo2max":
        return buildVO2maxData(readiness);
      default:
        return [];
    }
  }, [statType, readiness, activities]);

  if (!chartData.length) {
    return (
      <div className="animate-chart-in rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm overflow-hidden">
        <div className="flex items-center justify-between px-3.5 py-2 border-b border-border/40">
          <div className="flex items-center gap-1.5">
            <Icon className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-foreground">{meta.title}</span>
          </div>
        </div>
        <div className="flex items-center justify-center h-[180px] min-h-[180px] text-muted-foreground text-sm">
          No data available yet
        </div>
      </div>
    );
  }

  const latestValue = (() => {
    const last = chartData[chartData.length - 1];
    if (!last) return null;
    switch (statType) {
      case "fitness": {
        const ctl = last.CTL as number | null;
        const tsb = last.TSB as number | null;
        if (ctl != null) return `CTL ${ctl.toFixed(1)} · TSB ${tsb?.toFixed(1) ?? "—"}`;
        return null;
      }
      case "hrv":
        return last.HRV != null ? `${Math.round(last.HRV as number)} ms` : null;
      case "mileage":
        return last.km != null ? `${last.km} km` : null;
      case "sleep":
        return last.sleep != null ? `Score: ${Math.round(last.sleep as number)}` : null;
      case "resting_hr":
        return last.rhr != null ? `${Math.round(last.rhr as number)} bpm` : null;
      case "vo2max":
        return last.vo2max != null ? `${(last.vo2max as number).toFixed(1)} ml/kg/min` : null;
      default:
        return null;
    }
  })();

  return (
    <div className="animate-chart-in rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-border/40">
        <div className="flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold text-foreground">{meta.title}</span>
        </div>
        {latestValue && (
          <span className="text-[11px] font-medium text-muted-foreground">
            Latest: {latestValue}
          </span>
        )}
      </div>
      <div className="px-2 py-2">
        <ChartRenderer statType={statType} data={chartData} meta={meta} />
      </div>
    </div>
  );
}

interface ChatStatChartsProps {
  content: string;
  readiness: ReadinessRow[];
  activities: ActivityRow[];
  lastRunId?: string;
  lastRunName?: string;
}

export function ChatStatCharts({ content, readiness, activities, lastRunId, lastRunName }: ChatStatChartsProps) {
  const stats = useMemo(() => detectStatsFromText(content), [content]);

  if (stats.length === 0) return null;

  // Show activity chart first, then up to 1 additional stat chart
  const activityFirst = stats.includes("last_activity")
    ? ["last_activity", ...stats.filter((s) => s !== "last_activity")]
    : stats;
  const toShow = activityFirst.slice(0, activityFirst[0] === "last_activity" ? 2 : 2);

  return (
    <div className="mt-3 space-y-2">
      {toShow.map((stat) => (
        <ChatStatChart
          key={stat}
          statType={stat}
          readiness={readiness}
          activities={activities}
          lastRunId={lastRunId}
          lastRunName={lastRunName}
        />
      ))}
    </div>
  );
}
