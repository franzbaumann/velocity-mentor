import { FC, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Stop, Path, Rect } from "react-native-svg";
import { buildSmoothPath, buildAreaPath, normalizeToViewBox } from "./SvgHelpers";
import {
  computeHRDistribution,
  computeCumulativeTime,
  computeMeanMaximalHR,
  type HRBin,
  type CumulativePoint,
  type MeanMaxPoint,
} from "../../lib/streamAnalytics";
import { useChartTouch } from "../../hooks/useChartTouch";
import { useTheme } from "../../context/ThemeContext";

type Props = {
  heartrate: number[];
  time: number[];
  maxHr: number;
};

const ZONE_LEGEND = [
  ["Z2", "#3b82f6"],
  ["Z3", "#22c55e"],
  ["Z4", "#f97316"],
  ["Z5", "#ef4444"],
] as const;

const ZONE_NAMES: Record<string, string> = {
  z2: "Z2 Aerobic",
  z3: "Z3 Tempo",
  z4: "Z4 Threshold",
  z5: "Z5 VO2max",
};

// ---- tooltip helper ----

const TIP_W = 100;

function clampLeft(x: number, containerW: number, tipW: number): number {
  let left = x - tipW / 2;
  if (left < 0) left = 0;
  if (containerW > 0 && left + tipW > containerW) left = containerW - tipW;
  return left;
}

// ---- HR Distribution (bar chart) ----

const DIST_VW = 200;
const DIST_VH = 80;

const HRDistributionChart: FC<{ bins: HRBin[] }> = ({ bins }) => {
  const { themeName, theme } = useTheme();
  const isDarkPro = themeName === "darkPro";

  const { touch, panHandlers, onLayout, widthRef } = useChartTouch(bins.length);

  if (bins.length === 0)
    return (
      <Text
        style={[
          s.noData,
          isDarkPro && { color: theme.textSecondary },
        ]}
      >
        No HR data
      </Text>
    );
  const maxTime = Math.max(...bins.map((b) => b.time), 0.1);
  const barW = DIST_VW / bins.length;

  const yMax = maxTime;
  const yLabels = [
    `${Math.round(yMax)}m`,
    `${Math.round(yMax / 2)}m`,
    "0",
  ];

  const bin = touch.active ? bins[touch.index] : null;
  const tipLeft = clampLeft(touch.x, widthRef.current, TIP_W);

  return (
    <View
      style={[
        s.miniCard,
        isDarkPro && {
          backgroundColor: theme.cardBackground,
          borderRadius: theme.cardRadius,
          borderWidth: theme.cardBorderWidth,
          borderColor: theme.cardBorder,
        },
      ]}
    >
      <View style={s.miniTitleRow}>
        <Text style={s.heart}>♥</Text>
        <Text
          style={[
            s.miniTitle,
            isDarkPro && { color: theme.textPrimary },
          ]}
        >
          HR Distribution
        </Text>
      </View>
      <View style={s.chartRow}>
        <View style={s.miniYAxis}>
          {yLabels.map((l, i) => (
            <Text
              key={i}
              style={[
                s.miniYText,
                isDarkPro && { color: theme.textSecondary },
              ]}
            >
              {l}
            </Text>
          ))}
        </View>
        <View style={s.miniChartWrap} onLayout={onLayout} {...panHandlers}>
          <Svg width="100%" height={140} viewBox={`0 0 ${DIST_VW} ${DIST_VH}`} preserveAspectRatio="none">
            {bins.map((b, i) => {
              const h = Math.max(1, (b.time / maxTime) * (DIST_VH - 4));
              return (
                <Rect
                  key={i}
                  x={i * barW + barW * 0.1}
                  y={DIST_VH - h}
                  width={barW * 0.8}
                  height={h}
                  rx={1}
                  ry={1}
                  fill={b.color}
                />
              );
            })}
          </Svg>
          {touch.active && (
            <View
              pointerEvents="none"
              style={[s.crosshair, { left: touch.x, backgroundColor: "#e91e63" }]}
            />
          )}
          {touch.active && bin && (
            <View pointerEvents="none" style={[s.tooltip, { left: tipLeft, width: TIP_W }]}>
              <View style={s.tipRow}>
                <Text style={s.tipLabel}>{ZONE_NAMES[bin.zone] ?? bin.zone}</Text>
              </View>
              <View style={s.tipRow}>
                <Text style={s.tipLabel}>HR</Text>
                <Text style={s.tipValue}>{bin.bpm} bpm</Text>
              </View>
              <View style={s.tipRow}>
                <Text style={s.tipLabel}>Time</Text>
                <Text style={s.tipValue}>{bin.time.toFixed(1)} min</Text>
              </View>
            </View>
          )}
        </View>
      </View>
      <View style={s.xLabels}>
        {bins
          .filter((_, i) => i % Math.max(1, Math.floor(bins.length / 6)) === 0)
          .map((b, i) => (
            <Text
              key={i}
              style={[
                s.xLabel,
                isDarkPro && { color: theme.textSecondary },
              ]}
            >
              {b.bpm}
            </Text>
          ))}
      </View>
    </View>
  );
};

// ---- Cumulative Time (area chart) ----

const CUM_VW = 200;
const CUM_VH = 80;

const CumulativeTimeChart: FC<{ points: CumulativePoint[] }> = ({ points }) => {
  const { themeName, theme } = useTheme();
  const isDarkPro = themeName === "darkPro";

  const { linePath, areaPath } = useMemo(() => {
    if (points.length < 2) return { linePath: "", areaPath: "" };
    const times = points.map((p) => p.time);
    const pts = normalizeToViewBox(times, CUM_VW, CUM_VH);
    return {
      linePath: buildSmoothPath(pts),
      areaPath: buildAreaPath(pts, CUM_VH),
    };
  }, [points]);

  const { touch, panHandlers, onLayout, widthRef } = useChartTouch(points.length);

  if (points.length < 2)
    return (
      <Text
        style={[
          s.noData,
          isDarkPro && { color: theme.textSecondary },
        ]}
      >
        No HR data
      </Text>
    );

  const maxT = Math.max(...points.map((p) => p.time));
  const yLabels = [
    `${Math.round(maxT)}m`,
    `${Math.round(maxT / 2)}m`,
    "0",
  ];

  const pt = touch.active ? points[touch.index] : null;
  const tipLeft = clampLeft(touch.x, widthRef.current, TIP_W);

  const startOpacity = isDarkPro ? 0.22 : 0.4;
  const endOpacity = isDarkPro ? 0.06 : 0.05;

  return (
    <View
      style={[
        s.miniCard,
        isDarkPro && {
          backgroundColor: theme.cardBackground,
          borderRadius: theme.cardRadius,
          borderWidth: theme.cardBorderWidth,
          borderColor: theme.cardBorder,
        },
      ]}
    >
      <View style={s.miniTitleRow}>
        <Text style={s.heart}>♥</Text>
        <Text
          style={[
            s.miniTitle,
            isDarkPro && { color: theme.textPrimary },
          ]}
        >
          Cumulative Time
        </Text>
      </View>
      <View style={s.chartRow}>
        <View style={s.miniYAxis}>
          {yLabels.map((l, i) => (
            <Text
              key={i}
              style={[
                s.miniYText,
                isDarkPro && { color: theme.textSecondary },
              ]}
            >
              {l}
            </Text>
          ))}
        </View>
        <View style={s.miniChartWrap} onLayout={onLayout} {...panHandlers}>
          <Svg width="100%" height={140} viewBox={`0 0 ${CUM_VW} ${CUM_VH}`} preserveAspectRatio="none">
            <Defs>
              <LinearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor="#f87171" stopOpacity={startOpacity} />
                <Stop offset="100%" stopColor="#fecaca" stopOpacity={endOpacity} />
              </LinearGradient>
            </Defs>
            <Path d={areaPath} fill="url(#cumGrad)" />
            <Path d={linePath} fill="none" stroke="#ef4444" strokeWidth={1.5} strokeLinecap="round" />
          </Svg>
          {touch.active && (
            <View
              pointerEvents="none"
              style={[s.crosshair, { left: touch.x, backgroundColor: "#ef4444" }]}
            />
          )}
          {touch.active && pt && (
            <View pointerEvents="none" style={[s.tooltip, { left: tipLeft, width: TIP_W }]}>
              <View style={s.tipRow}>
                <Text style={s.tipLabel}>HR</Text>
                <Text style={s.tipValue}>{pt.bpm} bpm</Text>
              </View>
              <View style={s.tipRow}>
                <Text style={s.tipLabel}>Time</Text>
                <Text style={s.tipValue}>{pt.time.toFixed(1)} min</Text>
              </View>
            </View>
          )}
        </View>
      </View>
      <View style={s.xLabels}>
        {points
          .filter((_, i) => i % Math.max(1, Math.floor(points.length / 6)) === 0)
          .map((p, i) => (
            <Text
              key={i}
              style={[
                s.xLabel,
                isDarkPro && { color: theme.textSecondary },
              ]}
            >
              {p.bpm}
            </Text>
          ))}
      </View>
      <View style={s.zoneLegend}>
        {ZONE_LEGEND.map(([z, c]) => (
          <View key={z} style={s.zoneItem}>
            <View style={[s.zoneDot, { backgroundColor: c }]} />
            <Text
              style={[
                s.zoneText,
                isDarkPro && { color: theme.textSecondary },
              ]}
            >
              {z}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
};

// ---- Mean Maximal HR Curve ----

const MM_VW = 300;
const MM_VH = 80;
const MM_TIP_W = 120;

const MeanMaximalChart: FC<{ points: MeanMaxPoint[] }> = ({ points }) => {
  const { themeName, theme } = useTheme();
  const isDarkPro = themeName === "darkPro";

  const { linePath, areaPath } = useMemo(() => {
    if (points.length < 2) return { linePath: "", areaPath: "" };
    const hrs = points.map((p) => p.hr);
    const pts = normalizeToViewBox(hrs, MM_VW, MM_VH);
    return {
      linePath: buildSmoothPath(pts),
      areaPath: buildAreaPath(pts, MM_VH),
    };
  }, [points]);

  const { touch, panHandlers, onLayout, widthRef } = useChartTouch(points.length);

  if (points.length < 2) return null;

  const maxHr = Math.max(...points.map((p) => p.hr));
  const minHr = Math.min(...points.map((p) => p.hr));
  const yLabels = [
    String(maxHr),
    String(Math.round((maxHr + minHr) / 2)),
    String(minHr),
  ];

  const pt = touch.active ? points[touch.index] : null;
  const tipLeft = clampLeft(touch.x, widthRef.current, MM_TIP_W);

  const startOpacity = isDarkPro ? 0.22 : 0.35;
  const endOpacity = isDarkPro ? 0.04 : 0;

  return (
    <View
      style={[
        s.fullCard,
        isDarkPro && {
          backgroundColor: theme.cardBackground,
          borderRadius: theme.cardRadius,
          borderWidth: theme.cardBorderWidth,
          borderColor: theme.cardBorder,
        },
      ]}
    >
      <View style={s.miniTitleRow}>
        <Text style={s.heart}>♥</Text>
        <Text
          style={[
            s.miniTitle,
            { fontSize: 13 },
            isDarkPro && { color: theme.textPrimary },
          ]}
        >
          HR Curve (Mean Maximal)
        </Text>
      </View>
      <View style={s.mmRow}>
        <View style={s.mmYAxis}>
          {yLabels.map((l, i) => (
            <Text key={i} style={s.mmYText}>{l}</Text>
          ))}
        </View>
        <View style={s.mmChartWrap} onLayout={onLayout} {...panHandlers}>
          <Svg width="100%" height={180} viewBox={`0 0 ${MM_VW} ${MM_VH}`} preserveAspectRatio="none">
            <Defs>
              <LinearGradient id="mmGrad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor="#f87171" stopOpacity={startOpacity} />
                <Stop offset="100%" stopColor="#fecaca" stopOpacity={endOpacity} />
              </LinearGradient>
            </Defs>
            <Path d={areaPath} fill="url(#mmGrad)" />
            <Path d={linePath} fill="none" stroke="#ef4444" strokeWidth={1.5} strokeLinecap="round" />
          </Svg>
          {touch.active && (
            <View
              pointerEvents="none"
              style={[s.crosshair, { left: touch.x, backgroundColor: "#ef4444" }]}
            />
          )}
          {touch.active && pt && (
            <View pointerEvents="none" style={[s.tooltip, { left: tipLeft, width: MM_TIP_W }]}>
              <View style={s.tipRow}>
                <Text style={s.tipLabel}>Duration</Text>
                <Text style={s.tipValue}>{pt.label}</Text>
              </View>
              <View style={s.tipRow}>
                <Text style={s.tipLabel}>Max HR</Text>
                <Text style={s.tipValue}>{pt.hr} bpm</Text>
              </View>
            </View>
          )}
        </View>
      </View>
      <View style={s.mmXLabels}>
        {points.map((p, i) => (
          <Text
            key={i}
            style={[
              s.mmXText,
              isDarkPro && { color: theme.textSecondary },
            ]}
          >
            {p.label}
          </Text>
        ))}
      </View>
    </View>
  );
};

// ---- Combined Export ----

export const HRAnalysisCharts: FC<Props> = ({ heartrate, time, maxHr }) => {
  const bins = useMemo(() => computeHRDistribution(heartrate, time, maxHr), [heartrate, time, maxHr]);
  const cumulative = useMemo(() => computeCumulativeTime(heartrate, time), [heartrate, time]);
  const meanMax = useMemo(() => computeMeanMaximalHR(heartrate, time), [heartrate, time]);

  if (heartrate.length < 10) return null;

  return (
    <>
      <View style={s.twoCol}>
        <HRDistributionChart bins={bins} />
        <CumulativeTimeChart points={cumulative} />
      </View>
      <MeanMaximalChart points={meanMax} />
    </>
  );
};

const s = StyleSheet.create({
  noData: { fontSize: 12, color: "#bbb", padding: 16 },
  twoCol: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    marginTop: 12,
    marginBottom: 12,
  },
  miniCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingTop: 12,
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  miniTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 6,
  },
  heart: { color: "#e91e63", fontSize: 13 },
  miniTitle: { fontSize: 12, fontWeight: "700", color: "#111" },
  chartRow: { flexDirection: "row", overflow: "visible" },
  miniYAxis: {
    minWidth: 26,
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingRight: 4,
    paddingVertical: 2,
  },
  miniYText: { fontSize: 8, color: "#999" },
  miniChartWrap: { flex: 1, overflow: "visible" },
  xLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
    paddingLeft: 30,
  },
  xLabel: { fontSize: 8, color: "#bbb" },
  zoneLegend: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  zoneItem: { flexDirection: "row", alignItems: "center", gap: 3 },
  zoneDot: { width: 7, height: 7, borderRadius: 4 },
  zoneText: { fontSize: 9, color: "#666" },
  fullCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    marginHorizontal: 12,
    paddingTop: 14,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  mmRow: { flexDirection: "row", overflow: "visible" },
  mmYAxis: {
    minWidth: 30,
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingRight: 4,
    paddingVertical: 4,
  },
  mmYText: { fontSize: 10, color: "#999" },
  mmChartWrap: { flex: 1, overflow: "visible" },
  mmXLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
    paddingLeft: 34,
  },
  mmXText: { fontSize: 9, color: "#bbb" },
  crosshair: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    opacity: 0.45,
  },
  tooltip: {
    position: "absolute",
    top: 2,
    backgroundColor: "#111827",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  tipRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 6,
  },
  tipLabel: {
    fontSize: 9,
    color: "#9ca3af",
  },
  tipValue: {
    fontSize: 9,
    fontWeight: "600",
    color: "#ffffff",
  },
});
