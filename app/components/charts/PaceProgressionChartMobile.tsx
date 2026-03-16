import { FC, useMemo, useRef, useState } from "react";
import { LayoutChangeEvent, PanResponder, StyleSheet, Text, View, TouchableOpacity } from "react-native";
import Svg, { Line, Path } from "react-native-svg";
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

const FILTERS = [
  { key: "all", label: "All" },
  { key: "easy", label: "Easy (Z2)" },
  { key: "lt1", label: "LT1" },
  { key: "lt2", label: "LT2" },
  { key: "long", label: "Long" },
] as const;

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
  const { theme } = useTheme();
  const [filter, setFilter] = useState<"all" | "easy" | "lt1" | "lt2" | "long">("all");

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
      filter === "all"
        ? points
        : points.filter((p) => {
            if (filter === "easy") return p.type === "easy";
            if (filter === "long") return p.type === "long";
            // On web, LT1/LT2 map to harder runs; we only have a tempo run flag,
            // so we map both LT1 and LT2 to tempo-type runs.
            if (filter === "lt1" || filter === "lt2") return p.type === "tempo";
            return true;
          });

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

  const hasData = filtered.length > 0 && paceValues.length > 0;

  return (
    <View>
      <View style={styles.filterRow}>
        {FILTERS.map(({ key, label }) => {
          const selected = filter === key;
          return (
            <TouchableOpacity
              key={key}
              activeOpacity={0.9}
              onPress={() => setFilter(key)}
              style={[
                styles.chip,
                selected
                  ? { backgroundColor: "#1C1C1E" }
                  : { backgroundColor: theme.navBackground, borderWidth: 1, borderColor: theme.cardBorder },
              ]}
            >
              <Text
                style={[
                  styles.chipLabel,
                  selected
                    ? { fontWeight: "700", color: "#FFFFFF" }
                    : { fontWeight: "500", color: theme.textSecondary },
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {hasData ? (
        <>
          <View style={styles.chart}>
            <View style={styles.yAxisLabels}>
              <Text style={[styles.axisLabel, styles.axisLabelY, { color: theme.textMuted }]}>
                {formatPaceFromMinPerKm(Math.min(...paceValues))}
              </Text>
              <Text style={[styles.axisLabel, styles.axisLabelY, { color: theme.textMuted }]}>
                {formatPaceFromMinPerKm(Math.max(...paceValues))}
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
                    stroke={theme.textMuted}
                    strokeWidth={0.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null}
                {pacePath ? (
                  <Path
                    d={pacePath}
                    fill="none"
                    stroke={theme.chartLine}
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
                    stroke={theme.cardBorder}
                    strokeWidth={0.4}
                  />
                ) : null}
              </Svg>
              {activePoint && activeDatum ? (
                <View
                  pointerEvents="none"
                  style={[
                    styles.tooltip,
                    {
                      left: `${(activePoint.x / 100) * 100}%`,
                      borderColor: theme.cardBorder,
                      backgroundColor: theme.cardBackground,
                    },
                  ]}
                >
                  <Text style={[styles.tooltipLabel, { color: theme.textMuted }]}>
                    {format(new Date(activeDatum.date), "MMM d")}
                  </Text>
                  <Text style={[styles.tooltipValue, { color: theme.textPrimary }]}>
                    {formatPaceFromMinPerKm(activeDatum.pace)}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
          <View style={styles.xAxisRow}>
            <Text style={[styles.axisLabel, { color: theme.textMuted }]}>{startDateLabel}</Text>
            <Text style={[styles.axisLabel, { color: theme.textMuted }]}>{endDateLabel}</Text>
          </View>
        </>
      ) : (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: theme.textMuted }]}>
            No data for this run type
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  empty: {
    height: 110,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 12,
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
  chipLabel: {
    fontSize: 13,
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

