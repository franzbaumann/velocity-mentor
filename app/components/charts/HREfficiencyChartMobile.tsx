import { FC, useMemo, useRef, useState } from "react";
import { LayoutChangeEvent, PanResponder, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path, Line } from "react-native-svg";
import { useTheme } from "../../context/ThemeContext";
import { format } from "date-fns";
import { formatPaceFromMinPerKm } from "../../lib/format";

type Point = { date: string; pace: number; hr: number };

type Props = {
  data: Point[];
};

type ChartGeometry = {
  path: string;
  points: { x: number; y: number }[];
};

function buildPath(values: number[]): ChartGeometry {
  if (values.length < 2) return { path: "", points: [] };

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const w = 100;
  const hMargin = 3;
  const vMargin = 3;
  const h = 40 - vMargin * 2;
  const step = (w - hMargin * 2) / (values.length - 1);

  const pts = values.map((v, i) => {
    const x = hMargin + i * step;
    const y = vMargin + (h - ((v - min) / range) * h);
    return { x, y };
  });

  if (pts.length === 2) {
    return {
      path: `M ${pts[0].x},${pts[0].y} L ${pts[1].x},${pts[1].y}`,
      points: pts,
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

  return { path: d, points: pts };
}

export const HREfficiencyChartMobile: FC<Props> = ({ data }) => {
  const { colors } = useTheme();

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

  const paceValues = data.map((d) => d.pace);
  const { path, points } = useMemo(
    () => buildPath(paceValues),
    [data],
  );

  const [yMinLabel, yMaxLabel] = useMemo(() => {
    if (!paceValues.length) return ["", ""];
    const min = Math.min(...paceValues);
    const max = Math.max(...paceValues);
    const pad = 0.1;
    return [
      formatPaceFromMinPerKm(max + pad),
      formatPaceFromMinPerKm(min - pad),
    ];
  }, [paceValues]);

  const [startDateLabel, endDateLabel] = useMemo(() => {
    if (!data.length) return ["", ""];
    const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
    const first = sorted[0]?.date;
    const last = sorted[sorted.length - 1]?.date ?? first;
    return [
      first ? format(new Date(first), "MMM d") : "",
      last ? format(new Date(last), "MMM d") : "",
    ];
  }, [data]);

  const handleLayout = (e: LayoutChangeEvent) => {
    setChartWidth(e.nativeEvent.layout.width);
  };

  const handleTouch = (x: number) => {
    if (!chartWidth || !points.length) return;
    const ratio = Math.max(0, Math.min(1, x / chartWidth));
    const idx = Math.round(ratio * (points.length - 1));
    setActiveIndex(idx);
  };

  if (!points.length) return <View style={styles.empty} />;

  const activePoint = activeIndex != null ? points[activeIndex] : null;
  const activeDatum = activeIndex != null ? data[activeIndex] : null;

  return (
    <View>
      <View style={styles.container}>
        <View style={styles.yAxisLabels}>
          <Text style={[styles.axisLabel, styles.axisLabelY, { color: colors.mutedForeground }]}>
            {yMaxLabel}
          </Text>
          <Text style={[styles.axisLabel, styles.axisLabelY, { color: colors.mutedForeground }]}>
            {yMinLabel}
          </Text>
        </View>
        <View
          style={styles.chartArea}
          onLayout={handleLayout}
          {...panResponder.panHandlers}
        >
          <Svg width="100%" height={110} viewBox="0 0 100 40" preserveAspectRatio="none">
            {path ? (
              <Path
                d={path}
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
            {points.map((p, idx) => {
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
  container: {
    flexDirection: "row",
    alignItems: "stretch",
    height: 110,
    width: "100%",
  },
  chartArea: {
    flex: 1,
    position: "relative",
  },
  yAxisLabels: {
    justifyContent: "space-between",
    marginRight: 6,
  },
  xAxisRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  axisLabel: {
    fontSize: 10,
  },
  axisLabelY: {
    textAlign: "right",
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
  empty: {
    height: 110,
  },
});

