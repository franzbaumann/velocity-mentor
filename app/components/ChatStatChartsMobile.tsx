import { FC, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import type { ActivityRow, ReadinessRow } from "../hooks/useDashboardData";
import {
  StatType,
  detectStats,
  buildFitnessData,
  buildHrvData,
  buildMileageData,
  buildSleepData,
  buildRestingHrData,
  buildVO2maxData,
  type ChartDataPoint,
} from "../lib/chatStatDetection";

type Props = {
  content: string;
  readiness: ReadinessRow[];
  activities: ActivityRow[];
};

type Meta = {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  unit: string;
};

const META: Record<StatType, Meta> = {
  fitness: {
    title: "Fitness trend (CTL/ATL/TSB)",
    icon: "trending-up-outline",
    color: "#2563eb",
    unit: "",
  },
  hrv: {
    title: "HRV trend",
    icon: "heart-outline",
    color: "#7c3aed",
    unit: " ms",
  },
  mileage: {
    title: "Weekly mileage",
    icon: "stats-chart-outline",
    color: "#2563eb",
    unit: " km",
  },
  sleep: {
    title: "Sleep / readiness",
    icon: "moon-outline",
    color: "#4f46e5",
    unit: "",
  },
  resting_hr: {
    title: "Resting HR",
    icon: "flash-outline",
    color: "#ef4444",
    unit: " bpm",
  },
  vo2max: {
    title: "VO2max",
    icon: "walk-outline",
    color: "#059669",
    unit: "",
  },
};

function toMiniSeries(stat: StatType, data: ChartDataPoint[]): { date: string; value: number }[] {
  switch (stat) {
    case "fitness":
      return data
        .map((d) => ({
          date: d.date,
          value: typeof d.CTL === "number" ? (d.CTL as number) : 0,
        }))
        .filter((d) => d.value !== 0);
    case "hrv":
      return data
        .map((d) => ({
          date: d.date,
          value: typeof d.HRV === "number" ? (d.HRV as number) : 0,
        }))
        .filter((d) => d.value !== 0);
    case "mileage":
      return data
        .map((d) => ({
          date: d.date,
          value: typeof d.km === "number" ? (d.km as number) : 0,
        }))
        .filter((d) => d.value !== 0);
    case "sleep":
      return data
        .map((d) => ({
          date: d.date,
          value: typeof d.sleep === "number" ? (d.sleep as number) : 0,
        }))
        .filter((d) => d.value !== 0);
    case "resting_hr":
      return data
        .map((d) => ({
          date: d.date,
          value: typeof d.rhr === "number" ? (d.rhr as number) : 0,
        }))
        .filter((d) => d.value !== 0);
    case "vo2max":
      return data
        .map((d) => ({
          date: d.date,
          value: typeof d.vo2max === "number" ? (d.vo2max as number) : 0,
        }))
        .filter((d) => d.value !== 0);
    default:
      return [];
  }
}

function MiniLine({ points, color }: { points: { date: string; value: number }[]; color: string }) {
  if (!points.length) return null;
  const width = 160;
  const height = 60;
  const padX = 6;
  const padY = 6;
  const xs = points.map((_, i) => padX + (i / Math.max(points.length - 1, 1)) * (width - padX * 2));
  const ys = (() => {
    const vals = points.map((p) => p.value);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min || 1;
    return points.map(
      (p) => height - padY - ((p.value - min) / span) * (height - padY * 2),
    );
  })();

  let d = `M ${xs[0]},${ys[0]}`;
  for (let i = 1; i < xs.length; i++) {
    d += ` L ${xs[i]},${ys[i]}`;
  }

  return (
    <Svg width={width} height={height}>
      <Rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill="rgba(148, 163, 184, 0.12)"
        rx={8}
      />
      <Path d={d} stroke={color} strokeWidth={2} fill="none" />
    </Svg>
  );
}

function MiniBars({ points, color }: { points: { date: string; value: number }[]; color: string }) {
  if (!points.length) return null;
  const width = 160;
  const height = 60;
  const padX = 6;
  const padY = 6;
  const maxVal = Math.max(...points.map((p) => p.value)) || 1;
  const barWidth = Math.max(2, (width - padX * 2) / (points.length * 1.5));

  return (
    <Svg width={width} height={height}>
      <Rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill="rgba(148, 163, 184, 0.12)"
        rx={8}
      />
      {points.map((p, idx) => {
        const x = padX + idx * barWidth * 1.5;
        const h = ((p.value ?? 0) / maxVal) * (height - padY * 2);
        const y = height - padY - h;
        return (
          <Rect
            key={p.date + idx}
            x={x}
            y={y}
            width={barWidth}
            height={h}
            fill={color}
            rx={2}
          />
        );
      })}
    </Svg>
  );
}

export const ChatStatChartsMobile: FC<Props> = ({ content, readiness, activities }) => {
  const { colors } = useTheme();

  const statTypes = useMemo(() => detectStats(content), [content]);

  const charts = useMemo(() => {
    return statTypes.map((type) => {
      switch (type) {
        case "fitness":
          return { type, data: buildFitnessData(readiness) };
        case "hrv":
          return { type, data: buildHrvData(readiness) };
        case "mileage":
          return { type, data: buildMileageData(activities) };
        case "sleep":
          return { type, data: buildSleepData(readiness) };
        case "resting_hr":
          return { type, data: buildRestingHrData(readiness) };
        case "vo2max":
          return { type, data: buildVO2maxData(readiness) };
        default:
          return { type, data: [] };
      }
    });
  }, [statTypes, readiness, activities]);

  const rendered = charts
    .map(({ type, data }) => {
      const series = toMiniSeries(type, data);
      if (!series.length) return null;
      const meta = META[type];
      const last = series[series.length - 1];
      let latest: string | null = null;
      switch (type) {
        case "fitness":
          latest = `CTL ${last.value.toFixed(1)}`;
          break;
        case "hrv":
          latest = `${Math.round(last.value)} ms`;
          break;
        case "mileage":
          latest = `${last.value.toFixed(1)} km`;
          break;
        case "sleep":
          latest = `${Math.round(last.value)}/100`;
          break;
        case "resting_hr":
          latest = `${Math.round(last.value)} bpm`;
          break;
        case "vo2max":
          latest = last.value.toFixed(1);
          break;
        default:
          latest = null;
      }

      return { type, meta, series, latest };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);

  if (!rendered.length) return null;

  return (
    <View style={[styles.container, { borderColor: colors.border, backgroundColor: colors.card }]}>
      {rendered.map(({ type, meta, series, latest }) => (
        <View key={type} style={styles.row}>
          <View style={styles.header}>
            <View
              style={[
                styles.iconCircle,
                { backgroundColor: colors.primary + "22" },
              ]}
            >
              <Ionicons name={meta.icon} size={14} color={colors.primary} />
            </View>
            <View style={styles.headerText}>
              <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>
                {meta.title}
              </Text>
              {latest && (
                <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                  Latest: {latest}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.chart}>
            {type === "mileage" ? (
              <MiniBars points={series} color={meta.color} />
            ) : (
              <MiniLine points={series} color={meta.color} />
            )}
          </View>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 6,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 8,
    gap: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    gap: 8,
  },
  iconCircle: {
    width: 24,
    height: 24,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flexShrink: 1,
  },
  title: {
    fontSize: 11,
    fontWeight: "600",
  },
  subtitle: {
    fontSize: 10,
  },
  chart: {
    flexShrink: 0,
  },
});

