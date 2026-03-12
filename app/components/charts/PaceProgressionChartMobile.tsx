import { FC, useMemo, useRef, useState } from "react";
import { LayoutChangeEvent, PanResponder, StyleSheet, Text, View, TouchableOpacity } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { format } from "date-fns";
import { useTheme } from "../../context/ThemeContext";
import { formatPaceFromMinPerKm } from "../../lib/format";

type PaceType = "easy" | "tempo" | "long" | "other";

type PacePoint = { date: string; pace: number; type: PaceType };
type TrendPoint = PacePoint & { trend: number };

type Props = {
  points: PacePoint[];
  trendline: TrendPoint[];
};

const FILTERS = ["All", "Easy", "Tempo", "Long"] as const;

type Geometry = { path: string; pts: { x: number; y: number }[] };

function buildSmoothPath(values: number[]): Geometry {
  if (values.length < 2) return { path: "", pts: [] };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 100;
  const vMargin = 3;
  const hMargin = 3;
  const h = 40 - vMargin * 2;
  const step = (w - hMargin * 2) / (values.length - 1);

  const pts = values.map((v, i) => ({
    x: hMargin + i * step,
    y: vMargin + (h - ((v - min) / range) * h),
  }));

  if (pts.length === 2) {
    return {
      path: `M ${pts[0].x},${pts[0].y} L ${pts[1].x},${pts[1].y}`,
      pts,
    };
  }
  const tension = 0.4;
  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const cp1x = p1.x + ((p2.x - p0.x) / 6) * tension;
    const cp1y = p1.y + ((p2.y - p0.y) / 6) * tension;
    const cp2x = p2.x - ((p3.x - p1.x) / 6) * tension;
    const cp2y = p2.y - ((p3.y - p1.y) / 6) * tension;
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  return { path: d, pts };
}

export const PaceProgressionChartMobile: FC<Props> = ({ points, trendline }) => {
  const { colors } = useTheme();
  const [filter, setFilter] = useState<"all" | "easy" | "tempo" | "long">("all");

  const [chartWidth, setChartWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        handleTouch(evt.nativeEvent.locationX);
      },
      onPanResponderMove: (evt) => {
        handleTouch(evt.nativeEvent.locationX);
      },
      onPanResponderRelease: () => setActiveIndex(null),
      onPanResponderTerminate: () => setActiveIndex(null),
    }),
  ).current;

  const { filtered, trendForFilter } = useMemo(() => {
    const filteredPoints =
      filter === "all" ? points : points.filter((p) => p.type === filter);

    const win = 4 * 7;
    const trend: TrendPoint[] = filteredPoints.map((p, i) => {
      const slice = filteredPoints.slice(Math.max(0, i - win + 1), i + 1);
      const avg = slice.length
        ? slice.reduce((s, x) => s + x.pace, 0) / slice.length
        : p.pace;
      return { ...p, trend: Math.round(avg * 100) / 100 };
    });

    return { filtered: filteredPoints, trendForFilter: trend };
  }, [points, filter]);

  const paceValues = filtered.map((p) => p.pace);
  const { path: pacePath, pts: pacePts } = useMemo(
    () => buildSmoothPath(paceValues),
    [paceValues],
  );
  const { path: trendPath } = useMemo(
    () => buildSmoothPath(trendForFilter.map((p) => p.trend)),
    [trendForFilter],
  );

  const handleLayout = (e: LayoutChangeEvent) => {
    setChartWidth(e.nativeEvent.layout.width);
  };

  const handleTouch = (x: number) => {
    if (!chartWidth || !pacePts.length) return;
    const ratio = Math.max(0, Math.min(1, x / chartWidth));
    const idx = Math.round(ratio * (pacePts.length - 1));
    setActiveIndex(idx);
  };

  if (!filtered.length) return <View style={styles.empty} />;

  const activePoint = activeIndex != null ? pacePts[activeIndex] : null;
  const activeDatum = activeIndex != null ? filtered[activeIndex] : null;

  const [startDateLabel, endDateLabel] = useMemo(() => {
    if (!filtered.length) return ["", ""];
    const sorted = [...filtered].sort((a, b) => a.date.localeCompare(b.date));
    const first = sorted[0]?.date;
    const last = sorted[sorted.length - 1]?.date ?? first;
    return [
      first ? format(new Date(first), "MMM d") : "",
      last ? format(new Date(last), "MMM d") : "",
    ];
  }, [filtered]);

  return (
    <View>
      <View style={styles.filterRow}>
        {FILTERS.map((label) => {
          const key = label.toLowerCase() as "all" | "easy" | "tempo" | "long";
          const selected = filter === key;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => setFilter(key)}
              style={[styles.chip, selected ? styles.chipSelected : styles.chipUnselected]}
            >
              <Text style={[styles.chipLabel, selected ? styles.chipLabelSelected : styles.chipLabelUnselected]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.chart}>
        <View style={styles.yAxisLabels}>
          <Text style={[styles.axisLabel, styles.axisLabelY, { color: colors.mutedForeground }]}>
            {/* faster (lägre min/km) upptill */}
            {paceValues.length ? formatPaceFromMinPerKm(Math.min(...paceValues)) : ""}
          </Text>
          <Text style={[styles.axisLabel, styles.axisLabelY, { color: colors.mutedForeground }]}>
            {paceValues.length ? formatPaceFromMinPerKm(Math.max(...paceValues)) : ""}
          </Text>
        </View>
        <View
          style={styles.chartInner}
          onLayout={handleLayout}
          {...panResponder.panHandlers}
        >
          <Svg width="100%" height={110} viewBox="0 0 100 40" preserveAspectRatio="none">
            {trendPath ? (
              <Path
                d={trendPath}
                fill="none"
                stroke={colors.mutedForeground}
                strokeWidth={0.6}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
            {pacePath ? (
              <Path
                d={pacePath}
                fill="none"
                stroke={colors.primary}
                strokeWidth={0.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
            {activePoint ? (
              <Line
                x1={activePoint.x}
                y1={3}
                x2={activePoint.x}
                y2={37}
                stroke={colors.border}
                strokeWidth={0.4}
              />
            ) : null}
            {pacePts.map((p, idx) => {
              const isActive = idx === activeIndex;
              return (
                <Circle
                  key={idx}
                  cx={p.x}
                  cy={p.y}
                  r={isActive ? 2 : 1}
                  fill={colors.card}
                  stroke={colors.primary}
                  strokeWidth={isActive ? 1 : 0.7}
                />
              );
            })}
          </Svg>
          {activePoint && activeDatum ? (
            <View
              pointerEvents="none"
              style={[
                styles.tooltip,
                {
                  left: `${(activePoint.x / 100) * 100}%`,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                },
              ]}
            >
              <Text style={[styles.tooltipLabel, { color: colors.mutedForeground }]}>
                {format(new Date(activeDatum.date), "MMM d")}
              </Text>
              <Text style={[styles.tooltipValue, { color: colors.foreground }]}>
                {formatPaceFromMinPerKm(activeDatum.pace)}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.xAxisRow}>
        <Text style={[styles.axisLabel, { color: colors.mutedForeground }]}>{startDateLabel}</Text>
        <Text style={[styles.axisLabel, { color: colors.mutedForeground }]}>{endDateLabel}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  empty: {
    height: 110,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  chip: {
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  chipSelected: {
    backgroundColor: "#2196F3",
  },
  chipUnselected: {
    backgroundColor: "#f0f0f0",
  },
  chipLabel: {
    fontSize: 13,
  },
  chipLabelSelected: {
    fontWeight: "700",
    color: "#fff",
  },
  chipLabelUnselected: {
    fontWeight: "500",
    color: "#444",
  },
  chart: {
    flexDirection: "row",
    alignItems: "stretch",
    height: 110,
    width: "100%",
  },
  chartInner: {
    flex: 1,
    position: "relative",
  },
  yAxisLabels: {
    justifyContent: "space-between",
    marginRight: 6,
  },
  axisLabel: {
    fontSize: 10,
  },
  axisLabelY: {
    textAlign: "right",
  },
  xAxisRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  tooltip: {
    position: "absolute",
    top: 4,
    transform: [{ translateX: -40 }],
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tooltipLabel: {
    fontSize: 10,
  },
  tooltipValue: {
    fontSize: 12,
    fontWeight: "600",
  },
});

