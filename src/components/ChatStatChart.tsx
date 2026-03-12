import { useMemo } from "react";
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

interface ChatStatChartProps {
  statType: StatType;
  readiness: ReadinessRow[];
  activities: ActivityRow[];
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
          domain={[Math.floor(yMin - pad), Math.ceil(yMax + pad)]}
        />
        <Tooltip content={<MiniTooltip unit="" />} />
        <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" opacity={0.4} />
        <Line type="natural" dataKey="CTL" stroke="hsl(211 100% 52%)" strokeWidth={2} dot={false} name="CTL" connectNulls animationDuration={800} animationEasing="ease-out" />
        <Line type="natural" dataKey="ATL" stroke="hsl(36 100% 52%)" strokeWidth={2} dot={false} name="ATL" connectNulls animationDuration={900} animationEasing="ease-out" />
        <Line type="natural" dataKey="TSB" stroke="hsl(141 72% 50%)" strokeWidth={1.5} dot={false} name="TSB" connectNulls animationDuration={1000} animationEasing="ease-out" />
      </LineChart>
    </ResponsiveContainer>
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
    <ResponsiveContainer width="100%" height={180}>
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

export function ChatStatChart({ statType, readiness, activities }: ChatStatChartProps) {
  const meta = CHART_META[statType];
  const Icon = meta.icon;

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

  if (!chartData.length) return null;

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
}

export function ChatStatCharts({ content, readiness, activities }: ChatStatChartsProps) {
  const stats = useMemo(() => detectStatsFromText(content), [content]);

  if (stats.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      {stats.slice(0, 2).map((stat) => (
        <ChatStatChart
          key={stat}
          statType={stat}
          readiness={readiness}
          activities={activities}
        />
      ))}
    </div>
  );
}
