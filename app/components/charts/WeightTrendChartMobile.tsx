import { FC, useMemo, useRef, useState } from "react";
import { LayoutChangeEvent, PanResponder, StyleSheet, Text, View } from "react-native";
import Svg, { Line, Path } from "react-native-svg";
import { format } from "date-fns";
import { useTheme } from "../../context/ThemeContext";

type Point = { date: string; weight: number };

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

export const WeightTrendChartMobile: FC<Props> = ({ data }) => {
  const { theme } = useTheme();
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

  const values = data.map((d) => d.weight);
  const { path, points } = useMemo(
    () => buildPath(values),
    [values],
  );

  const [topLabel, bottomLabel] = useMemo(() => {
    if (!values.length) return ["", ""];
    const min = Math.min(...values);
    const max = Math.max(...values);
    return [`${max.toFixed(1)} kg`, `${min.toFixed(1)} kg`];
  }, [values]);

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
      <View style={styles.row}>
        <View style={styles.yAxis}>
          <Text style={[styles.axisLabel, { color: theme.textMuted }]}>{topLabel}</Text>
          <Text style={[styles.axisLabel, { color: theme.textMuted }]}>{bottomLabel}</Text>
        </View>
        <View
          style={styles.chart}
          onLayout={handleLayout}
          {...panResponder.panHandlers}
        >
          <Svg width="100%" height={90} viewBox="0 0 100 40" preserveAspectRatio="none">
            {path ? (
              <Path
                d={path}
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
                  borderColor: theme.cardBorder,
                  backgroundColor: theme.cardBackground,
                },
              ]}
            >
              <Text style={[styles.tooltipLabel, { color: theme.textMuted }]}>
                {format(new Date(activeDatum.date), "MMM d")}
              </Text>
              <Text style={[styles.tooltipValue, { color: theme.textPrimary }]}>
                {activeDatum.weight.toFixed(1)} kg
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.xAxisRow}>
        <Text style={[styles.axisLabel, { color: theme.textMuted }]}>{startDateLabel}</Text>
        <Text style={[styles.axisLabel, { color: theme.textMuted }]}>{endDateLabel}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  empty: {
    height: 90,
  },
  row: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  yAxis: {
    justifyContent: "space-between",
    marginRight: 6,
  },
  chart: {
    height: 90,
    flex: 1,
  },
  xAxisRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  axisLabel: {
    fontSize: 10,
  },
  tooltip: {
    position: "absolute",
    top: 4,
    left: "50%",
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

