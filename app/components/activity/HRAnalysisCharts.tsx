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

type Props = {
  heartrate: number[];
  time: number[];
  maxHr: number;
};

const ZONE_LEGEND = [
  ["Z2", "#2196F3"],
  ["Z3", "#4CAF50"],
  ["Z4", "#FF9800"],
  ["Z5", "#e91e63"],
] as const;

// ---- HR Distribution (bar chart) ----

const DIST_VW = 120;
const DIST_VH = 60;

const HRDistributionChart: FC<{ bins: HRBin[] }> = ({ bins }) => {
  if (bins.length === 0) return <Text style={s.noData}>No HR data</Text>;
  const maxTime = Math.max(...bins.map((b) => b.time), 0.1);
  const barW = DIST_VW / bins.length;
  return (
    <View style={s.miniCard}>
      <View style={s.miniTitleRow}>
        <Text style={s.heart}>♥</Text>
        <Text style={s.miniTitle}>HR Distribution</Text>
      </View>
      <Svg width="100%" height={130} viewBox={`0 0 ${DIST_VW} ${DIST_VH}`} preserveAspectRatio="none">
        {bins.map((b, i) => {
          const h = (b.time / maxTime) * (DIST_VH - 4);
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
      <View style={s.xLabels}>
        {bins
          .filter((_, i) => i % Math.max(1, Math.floor(bins.length / 5)) === 0)
          .map((b, i) => (
            <Text key={i} style={s.xLabel}>
              {b.bpm}
            </Text>
          ))}
      </View>
    </View>
  );
};

// ---- Cumulative Time (area chart) ----

const CUM_VW = 120;
const CUM_VH = 60;

const CumulativeTimeChart: FC<{ points: CumulativePoint[] }> = ({ points }) => {
  const { linePath, areaPath } = useMemo(() => {
    if (points.length < 2) return { linePath: "", areaPath: "" };
    const times = points.map((p) => p.time);
    const pts = normalizeToViewBox(times, CUM_VW, CUM_VH);
    return {
      linePath: buildSmoothPath(pts),
      areaPath: buildAreaPath(pts, CUM_VH),
    };
  }, [points]);

  if (points.length < 2) return <Text style={s.noData}>No HR data</Text>;

  return (
    <View style={s.miniCard}>
      <View style={s.miniTitleRow}>
        <Text style={s.heart}>♥</Text>
        <Text style={s.miniTitle}>Cumulative Time</Text>
      </View>
      <Svg width="100%" height={130} viewBox={`0 0 ${CUM_VW} ${CUM_VH}`} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#f87171" stopOpacity={0.4} />
            <Stop offset="100%" stopColor="#fecaca" stopOpacity={0.05} />
          </LinearGradient>
        </Defs>
        <Path d={areaPath} fill="url(#cumGrad)" />
        <Path d={linePath} fill="none" stroke="#ef4444" strokeWidth={1} strokeLinecap="round" />
      </Svg>
      <View style={s.zoneLegend}>
        {ZONE_LEGEND.map(([z, c]) => (
          <View key={z} style={s.zoneItem}>
            <View style={[s.zoneDot, { backgroundColor: c }]} />
            <Text style={s.zoneText}>{z}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

// ---- Mean Maximal HR Curve ----

const MM_VW = 200;
const MM_VH = 60;

const MeanMaximalChart: FC<{ points: MeanMaxPoint[] }> = ({ points }) => {
  const { linePath, areaPath } = useMemo(() => {
    if (points.length < 2) return { linePath: "", areaPath: "" };
    const hrs = points.map((p) => p.hr);
    const pts = normalizeToViewBox(hrs, MM_VW, MM_VH);
    return {
      linePath: buildSmoothPath(pts),
      areaPath: buildAreaPath(pts, MM_VH),
    };
  }, [points]);

  if (points.length < 2) return null;

  const yLabels = [
    String(Math.max(...points.map((p) => p.hr))),
    String(Math.round((Math.max(...points.map((p) => p.hr)) + Math.min(...points.map((p) => p.hr))) / 2)),
    String(Math.min(...points.map((p) => p.hr))),
  ];

  return (
    <View style={s.fullCard}>
      <View style={s.miniTitleRow}>
        <Text style={s.heart}>♥</Text>
        <Text style={[s.miniTitle, { fontSize: 13 }]}>HR Curve (Mean Maximal)</Text>
      </View>
      <View style={s.mmRow}>
        <View style={s.mmYAxis}>
          {yLabels.map((l, i) => (
            <Text key={i} style={s.mmYText}>
              {l}
            </Text>
          ))}
        </View>
        <View style={{ flex: 1 }}>
          <Svg width="100%" height={160} viewBox={`0 0 ${MM_VW} ${MM_VH}`} preserveAspectRatio="none">
            <Defs>
              <LinearGradient id="mmGrad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor="#f87171" stopOpacity={0.35} />
                <Stop offset="100%" stopColor="#fecaca" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Path d={areaPath} fill="url(#mmGrad)" />
            <Path d={linePath} fill="none" stroke="#ef4444" strokeWidth={1} strokeLinecap="round" />
          </Svg>
        </View>
      </View>
      <View style={s.mmXLabels}>
        {points.map((p, i) => (
          <Text key={i} style={s.mmXText}>
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
    marginBottom: 10,
  },
  heart: { color: "#e91e63", fontSize: 13 },
  miniTitle: { fontSize: 12, fontWeight: "700", color: "#111" },
  xLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  xLabel: { fontSize: 8, color: "#bbb" },
  zoneLegend: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 6 },
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
  mmRow: { flexDirection: "row" },
  mmYAxis: {
    minWidth: 30,
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingRight: 4,
    paddingVertical: 4,
  },
  mmYText: { fontSize: 10, color: "#999" },
  mmXLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
    paddingLeft: 34,
  },
  mmXText: { fontSize: 9, color: "#bbb" },
});
