import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View, Pressable } from "react-native";
import Svg, { Defs, Path, Pattern, Rect } from "react-native-svg";
import { useTheme } from "../context/ThemeContext";

type PeriodKey = "Last 3 months" | "Last 30 days" | "Last 7 days";

type PeriodData = {
  dates: string[];
  mobile: number[];
  desktop: number[];
  peak: number;
  average: number;
  growth: string;
};

type MetricsConfig = {
  label: string;
  value: number | string;
  color: string;
};

const WIDTH = 800;
const HEIGHT = 340;
const PADDING = 40;

function generateSmoothPath(values: number[], maxValue: number, height = HEIGHT, isArea = false) {
  if (!values.length) return "";
  const chartWidth = WIDTH - PADDING * 2;
  const chartHeight = height - PADDING * 2;

  const points = values.map((value, index) => ({
    x: PADDING + (index / Math.max(values.length - 1, 1)) * chartWidth,
    y: PADDING + (1 - value / maxValue) * chartHeight,
  }));

  if (points.length < 2) return "";

  let path = `M ${points[0].x},${points[0].y}`;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    const cp1x = prev.x + (curr.x - prev.x) * 0.5;
    const cp1y = prev.y;
    const cp2x = curr.x - (next ? (next.x - curr.x) * 0.3 : 0);
    const cp2y = curr.y;

    path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${curr.x},${curr.y}`;
  }

  if (isArea) {
    const last = points[points.length - 1];
    path += ` L ${last.x},${height - PADDING} L ${points[0].x},${height - PADDING} Z`;
  }

  return path;
}

export const LineGraphStatistics: React.FC = () => {
  const { colors } = useTheme();
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>("Last 30 days");
  const [animationPhase, setAnimationPhase] = useState(0);
  const [chartVisible, setChartVisible] = useState(false);

  const data: Record<PeriodKey, PeriodData> = useMemo(
    () => ({
      "Last 3 months": {
        dates: ["Jun 1", "Jun 3", "Jun 5", "Jun 7", "Jun 9", "Jun 12", "Jun 15", "Jun 18", "Jun 21", "Jun 24", "Jun 27", "Jun 30"],
        mobile: [290, 270, 310, 280, 260, 350, 320, 340, 400, 370, 420, 480],
        desktop: [200, 180, 220, 255, 230, 280, 260, 270, 300, 285, 310, 320],
        peak: 480,
        average: 315,
        growth: "+15%",
      },
      "Last 30 days": {
        dates: ["Jun 1", "Jun 3", "Jun 5", "Jun 7", "Jun 9", "Jun 12", "Jun 15", "Jun 18", "Jun 21", "Jun 24", "Jun 27", "Jun 30"],
        mobile: [290, 270, 310, 280, 260, 350, 320, 340, 400, 370, 420, 480],
        desktop: [200, 180, 220, 255, 230, 280, 260, 270, 300, 285, 310, 320],
        peak: 480,
        average: 315,
        growth: "+12%",
      },
      "Last 7 days": {
        dates: ["Jun 24", "Jun 25", "Jun 26", "Jun 27", "Jun 28", "Jun 29", "Jun 30"],
        mobile: [370, 420, 380, 450, 480, 520, 550],
        desktop: [285, 310, 295, 340, 320, 365, 380],
        peak: 550,
        average: 458,
        growth: "+18%",
      },
    }),
    [],
  );

  const currentData = data[selectedPeriod];
  const maxValue =
    Math.max(...currentData.mobile, ...currentData.desktop) > 0
      ? Math.max(...currentData.mobile, ...currentData.desktop) * 1.1
      : 1;

  useEffect(() => {
    setChartVisible(false);
    setAnimationPhase(0);
    const timers = [
      setTimeout(() => setAnimationPhase(1), 100),
      setTimeout(() => setAnimationPhase(2), 400),
      setTimeout(() => setAnimationPhase(3), 800),
      setTimeout(() => setChartVisible(true), 1200),
    ];
    return () => {
      timers.forEach(clearTimeout);
    };
  }, [selectedPeriod]);

  const periods: { label: PeriodKey; color: string }[] = [
    { label: "Last 3 months", color: "#22c55e" },
    { label: "Last 30 days", color: "#3b82f6" },
    { label: "Last 7 days", color: "#f97316" },
  ];

  const metrics: MetricsConfig[] = [
    { label: "Peak", value: currentData.peak, color: "#3b82f6" },
    { label: "Average", value: currentData.average, color: "#f97316" },
    { label: "Growth", value: currentData.growth, color: "#22c55e" },
  ];

  const mobileArea = generateSmoothPath(currentData.mobile, maxValue, HEIGHT, true);
  const desktopArea = generateSmoothPath(currentData.desktop, maxValue, HEIGHT, true);
  const mobileLine = generateSmoothPath(currentData.mobile, maxValue, HEIGHT, false);
  const desktopLine = generateSmoothPath(currentData.desktop, maxValue, HEIGHT, false);

  return (
    <View style={[styles.root, { backgroundColor: colors.card }]}>
      <View style={styles.header}>
        <Text
          style={[
            styles.title,
            { color: colors.foreground },
            animationPhase >= 1 ? styles.fadeInUp : styles.fadeHidden,
          ]}
        >
          Total Visitors
        </Text>
        <Text
          style={[
            styles.subtitle,
            { color: colors.mutedForeground },
            animationPhase >= 1 ? styles.fadeInUp : styles.fadeHidden,
          ]}
        >
          Total for the last 3 months
        </Text>
      </View>

      <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.background }]}>
        <View style={styles.legendRow}>
          <View
            style={[
              styles.legendItem,
              animationPhase >= 2 ? styles.fadeInLeft : styles.fadeHiddenLeft,
            ]}
          >
            <View style={[styles.legendDot, { borderColor: "#3b82f6", backgroundColor: "#dbeafe" }]} />
            <Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>Mobile</Text>
            <Text style={[styles.legendValue, { color: colors.foreground }]}>
              {currentData.mobile[currentData.mobile.length - 1]}
            </Text>
          </View>
          <View
            style={[
              styles.legendItem,
              animationPhase >= 2 ? styles.fadeInLeft : styles.fadeHiddenLeft,
            ]}
          >
            <View style={[styles.legendDot, { borderColor: "#374151", backgroundColor: "#f9fafb" }]} />
            <Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>Desktop</Text>
            <Text style={[styles.legendValue, { color: colors.foreground }]}>
              {currentData.desktop[currentData.desktop.length - 1]}
            </Text>
          </View>
        </View>

        <View style={styles.periodColumn}>
          {periods.map((p, index) => (
            <Pressable
              key={p.label}
              onPress={() => setSelectedPeriod(p.label)}
              style={[
                styles.periodButton,
                {
                  backgroundColor:
                    selectedPeriod === p.label ? colors.foreground : colors.background,
                  borderColor: colors.border,
                },
                animationPhase >= 2 ? styles.fadeInRight : styles.fadeHiddenRight,
                { transform: [{ translateX: animationPhase >= 2 ? 0 : 16 }] },
              ]}
            >
              <View style={styles.periodTopRow}>
                <View style={[styles.periodDot, { backgroundColor: p.color }]} />
                <Text
                  style={[
                    styles.periodSize,
                    {
                      color:
                        selectedPeriod === p.label ? colors.background : colors.mutedForeground,
                    },
                  ]}
                >
                  {p.label}
                </Text>
              </View>
              <Text
                style={[
                  styles.periodLabel,
                  {
                    color:
                      selectedPeriod === p.label ? colors.background : colors.mutedForeground,
                  },
                ]}
              >
                {p.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.chartWrapper}>
          <Svg width="100%" height="100%" viewBox={`0 0 ${WIDTH} 400`}>
            <Defs>
              <Pattern
                id="gridPattern"
                width="40"
                height="30"
                patternUnits="userSpaceOnUse"
              >
                <Path
                  d="M 40 0 L 0 0 0 30"
                  fill="none"
                  stroke={colors.border}
                  strokeWidth={0.5}
                  opacity={0.1}
                />
              </Pattern>
            </Defs>
            <Rect width={WIDTH} height={400} fill="url(#gridPattern)" />

            {desktopArea ? (
              <Path
                d={desktopArea}
                fill="rgba(107,114,128,0.08)"
                opacity={chartVisible ? 1 : 0}
              />
            ) : null}
            {mobileArea ? (
              <Path
                d={mobileArea}
                fill="rgba(59,130,246,0.08)"
                opacity={chartVisible ? 1 : 0}
              />
            ) : null}

            {desktopLine ? (
              <Path
                d={desktopLine}
                fill="none"
                stroke="#374151"
                strokeWidth={1}
                strokeLinecap="round"
                opacity={chartVisible ? 1 : 0}
              />
            ) : null}
            {mobileLine ? (
              <Path
                d={mobileLine}
                fill="none"
                stroke="#3b82f6"
                strokeWidth={1}
                strokeLinecap="round"
                opacity={chartVisible ? 1 : 0}
              />
            ) : null}
          </Svg>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricsLeft}>
            {metrics.map((m) => (
              <View
                key={m.label}
                style={[
                  styles.metricCard,
                  { borderColor: m.color },
                  animationPhase >= 3 ? styles.fadeInUp : styles.fadeHidden,
                ]}
              >
                <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>
                  {m.label}
                </Text>
                <Text style={[styles.metricValue, { color: colors.foreground }]}>{m.value}</Text>
              </View>
            ))}
          </View>
          <View
            style={[
              styles.bundleCard,
              { backgroundColor: colors.foreground },
              animationPhase >= 3 ? styles.fadeInUp : styles.fadeHidden,
            ]}
          >
            <Text style={styles.bundleLabel}>Bundle size</Text>
            <Text style={styles.bundleValue}>
              {currentData.peak + currentData.average} visitors
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    borderRadius: 16,
    padding: 16,
  },
  header: {
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: "300",
  },
  subtitle: {
    fontSize: 13,
    marginTop: 4,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingTop: 16,
    paddingBottom: 12,
    paddingHorizontal: 12,
  },
  legendRow: {
    position: "absolute",
    top: 22,
    left: 24,
    flexDirection: "row",
    gap: 16,
    zIndex: 2,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
  },
  legendLabel: {
    fontSize: 11,
  },
  legendValue: {
    fontSize: 12,
    fontWeight: "600",
  },
  periodColumn: {
    position: "absolute",
    top: 16,
    right: 12,
    zIndex: 2,
    gap: 6,
  },
  periodButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 130,
  },
  periodTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  periodDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  periodSize: {
    fontSize: 11,
  },
  periodLabel: {
    fontSize: 11,
  },
  chartWrapper: {
    height: 220,
    marginTop: 40,
    marginBottom: 8,
  },
  metricsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 12,
    marginTop: 4,
  },
  metricsLeft: {
    flexDirection: "row",
    gap: 8,
  },
  metricCard: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  metricLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: "600",
  },
  bundleCard: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bundleLabel: {
    fontSize: 11,
    color: "#e5e7eb",
  },
  bundleValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#f9fafb",
    marginTop: 2,
  },
  fadeInUp: {
    opacity: 1,
    transform: [{ translateY: 0 }],
  },
  fadeHidden: {
    opacity: 0,
    transform: [{ translateY: 8 }],
  },
  fadeInLeft: {
    opacity: 1,
    transform: [{ translateX: 0 }],
  },
  fadeHiddenLeft: {
    opacity: 0,
    transform: [{ translateX: -8 }],
  },
  fadeInRight: {
    opacity: 1,
  },
  fadeHiddenRight: {
    opacity: 0,
  },
});

export default LineGraphStatistics;

