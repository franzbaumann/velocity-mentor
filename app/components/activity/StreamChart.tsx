import { FC, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Stop, Path } from "react-native-svg";
import { buildSmoothPath, buildAreaPath, normalizeToViewBox } from "./SvgHelpers";

type Props = {
  label: string;
  labelColor: string;
  yLabels: string[];
  height: number;
  data: number[];
  strokeColor: string;
  gradientColors?: [string, string];
  reversed?: boolean;
  gradientId?: string;
  /** Altitude section uses marginBottom 12 */
  lastInSequence?: boolean;
};

const VW = 200;
const VH = 60;

export const StreamChart: FC<Props> = ({
  label,
  labelColor,
  yLabels,
  height,
  data,
  strokeColor,
  gradientColors,
  reversed,
  gradientId,
  lastInSequence,
}) => {
  const { linePath, areaPath } = useMemo(() => {
    if (data.length < 2) return { linePath: "", areaPath: "" };
    const pts = normalizeToViewBox(data, VW, VH, { reversed });
    return {
      linePath: buildSmoothPath(pts),
      areaPath: gradientColors ? buildAreaPath(pts, VH) : "",
    };
  }, [data, reversed, gradientColors]);

  if (data.length < 2) {
    return (
      <View style={[styles.section, lastInSequence && styles.sectionLast, { minHeight: height }]}>
        <Text style={[styles.sectionLabel, { color: labelColor }]}>{label}</Text>
        <Text style={styles.noData}>No data</Text>
      </View>
    );
  }

  const gid = gradientId ?? `grad_${label}`;

  return (
    <View style={[styles.section, lastInSequence && styles.sectionLast]}>
      <Text style={[styles.sectionLabel, { color: labelColor }]}>{label}</Text>
      <View style={styles.row}>
        <View style={styles.yAxis}>
          {yLabels.map((l, i) => (
            <Text key={i} style={styles.yText}>
              {l}
            </Text>
          ))}
        </View>
        <View style={styles.chartWrap}>
          <Svg width="100%" height={height} viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none">
            {gradientColors && (
              <Defs>
                <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor={gradientColors[0]} stopOpacity={0.5} />
                  <Stop offset="100%" stopColor={gradientColors[1]} stopOpacity={0.05} />
                </LinearGradient>
              </Defs>
            )}
            {areaPath ? (
              <Path d={areaPath} fill={`url(#${gid})`} />
            ) : null}
            <Path
              d={linePath}
              fill="none"
              stroke={strokeColor}
              strokeWidth={1}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    backgroundColor: "#fff",
    marginBottom: 1,
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  sectionLast: { marginBottom: 12 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: 4,
    marginTop: 14,
  },
  row: { flexDirection: "row" },
  yAxis: {
    minWidth: 36,
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingRight: 4,
    paddingVertical: 4,
  },
  yText: { fontSize: 10, color: "#999", textAlign: "right" },
  chartWrap: { flex: 1 },
  noData: { fontSize: 12, color: "#bbb", marginTop: 8 },
});
