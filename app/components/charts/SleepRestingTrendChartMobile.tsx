import { FC, useMemo, useRef, useState } from "react";
import { LayoutChangeEvent, PanResponder, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { format } from "date-fns";
import { useTheme } from "../../context/ThemeContext";

type Point = { date: string; sleep: number | null; restingHr: number | null };

type Props = {
  data: Point[];
};

type ChartGeometry = {
  sleepPath: string;
  hrPath: string;
  points: { x: number; sleepY: number; hrY: number; sleep: number | null; restingHr: number | null }[];
};

function buildPaths(points: Point[]): ChartGeometry {
  const sleepVals = points.map((p) => p.sleep ?? 0).filter((v) => v > 0);
  const hrVals = points.map((p) => p.restingHr ?? 0).filter((v) => v > 0);
  if (sleepVals.length < 2 || hrVals.length < 2) return { sleepPath: "", hrPath: "", points: [] };

  const sleepMin = Math.min(...sleepVals);
  const sleepMax = Math.max(...sleepVals);
  const sleepRange = sleepMax - sleepMin || 1;

  const hrMin = Math.min(...hrVals);
  const hrMax = Math.max(...hrVals);
  const hrRange = hrMax - hrMin || 1;

  const w = 100;
  const hMargin = 3;
  const vMargin = 3;
  const h = 40 - vMargin * 2;
  const step = (w - hMargin * 2) / (points.length - 1);

  const pts = points.map((pt, i) => {
    const x = hMargin + i * step;
    const sleepV = pt.sleep ?? sleepMin;
    const hrV = pt.restingHr ?? hrMin;
    const sleepY = vMargin + (h - ((sleepV - sleepMin) / sleepRange) * h);
    const hrY = vMargin + (h - ((hrV - hrMin) / hrRange) * h);
    return { x, sleepY, hrY, sleep: pt.sleep, restingHr: pt.restingHr };
  });

  const buildSmooth = (ys: { x: number; y: number }[]): string => {
    if (ys.length < 2) return "";
    if (ys.length === 2) return `M ${ys[0].x},${ys[0].y} L ${ys[1].x},${ys[1].y}`;
    const tension = 0.4;
    let d = `M ${ys[0].x},${ys[0].y}`;
    for (let i = 0; i < ys.length - 1; i++) {
      const p0 = ys[i - 1] ?? ys[i];
      const p1 = ys[i];
      const p2 = ys[i + 1];
      const p3 = ys[i + 2] ?? p2;
      const cp1x = p1.x + ((p2.x - p0.x) / 6) * tension;
      const cp1y = p1.y + ((p2.y - p0.y) / 6) * tension;
      const cp2x = p2.x - ((p3.x - p1.x) / 6) * tension;
      const cp2y = p2.y - ((p3.y - p1.y) / 6) * tension;
      d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }
    return d;
  };

  const sleepPath = buildSmooth(pts.map((p) => ({ x: p.x, y: p.sleepY })));
  const hrPath = buildSmooth(pts.map((p) => ({ x: p.x, y: p.hrY })));

  return { sleepPath, hrPath, points: pts };
}

export const SleepRestingTrendChartMobile: FC<Props> = ({ data }) => {
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

  const sorted = useMemo(
    () => [...data].sort((a, b) => a.date.localeCompare(b.date)),
    [data],
  );

  const { sleepPath, hrPath, points } = useMemo(
    () => buildPaths(sorted),
    [sorted],
  );

  const [sleepTop, sleepBottom] = useMemo(() => {
    const values = sorted.map((p) => p.sleep ?? 0).filter((v) => v > 0);
    if (!values.length) return ["", ""];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const fmt = (h: number) => {
      const hh = Math.floor(h);
      const mm = Math.round((h - hh) * 60);
      return mm > 0 ? `${hh}h${mm.toString().padStart(2, "0")}m` : `${hh}h`;
    };
    return [fmt(max), fmt(min)];
  }, [sorted]);

  const [hrTop, hrBottom] = useMemo(() => {
    const values = sorted.map((p) => p.restingHr ?? 0).filter((v) => v > 0);
    if (!values.length) return ["", ""];
    const min = Math.min(...values);
    const max = Math.max(...values);
    return [`${Math.round(max)} bpm`, `${Math.round(min)} bpm`];
  }, [sorted]);

  const [startDateLabel, endDateLabel] = useMemo(() => {
    if (!sorted.length) return ["", ""];
    const first = sorted[0]?.date;
    const last = sorted[sorted.length - 1]?.date ?? first;
    return [
      first ? format(new Date(first), "MMM d") : "",
      last ? format(new Date(last), "MMM d") : "",
    ];
  }, [sorted]);

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
  const activeDatum = activeIndex != null ? sorted[activeIndex] : null;

  const formatSleep = (hours: number | null) => {
    if (hours == null || !isFinite(hours)) return "--";
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  return (
    <View>
      <View style={styles.row}>
        <View style={styles.yAxisLeft}>
          <Text style={[styles.axisLabel, { color: colors.mutedForeground }]}>{sleepTop}</Text>
          <Text style={[styles.axisLabel, { color: colors.mutedForeground }]}>{sleepBottom}</Text>
        </View>
        <View
          style={styles.chart}
          onLayout={handleLayout}
          {...panResponder.panHandlers}
        >
          <Svg width="100%" height={90} viewBox="0 0 100 40" preserveAspectRatio="none">
            {sleepPath ? (
              <Path
                d={sleepPath}
                fill="none"
                stroke={colors.primary}
                strokeWidth={0.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
            {hrPath ? (
              <Path
                d={hrPath}
                fill="none"
                stroke="#EF4444"
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
                  cy={p.sleepY}
                  r={isActive ? 2 : 1}
                  fill={colors.card}
                  stroke={colors.primary}
                  strokeWidth={isActive ? 1 : 0.7}
                />
              );
            })}
            {points.map((p, idx) => {
              const isActive = idx === activeIndex;
              return (
                <Circle
                  key={`hr-${idx}`}
                  cx={p.x}
                  cy={p.hrY}
                  r={isActive ? 2 : 1}
                  fill={colors.card}
                  stroke="#EF4444"
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
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                },
              ]}
            >
              <Text style={[styles.tooltipLabel, { color: colors.mutedForeground }]}>
                {format(new Date(activeDatum.date), "MMM d")}
              </Text>
              <Text style={[styles.tooltipValue, { color: colors.foreground }]}>
                {`${formatSleep(activeDatum.sleep)} · ${Math.round(activeDatum.restingHr ?? 0)} bpm`}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.yAxisRight}>
          <Text style={[styles.axisLabel, { color: colors.mutedForeground }]}>{hrTop}</Text>
          <Text style={[styles.axisLabel, { color: colors.mutedForeground }]}>{hrBottom}</Text>
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
    height: 90,
  },
  row: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  yAxisLeft: {
    justifyContent: "space-between",
    marginRight: 6,
  },
  yAxisRight: {
    justifyContent: "space-between",
    marginLeft: 6,
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
    transform: [{ translateX: -60 }],
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

