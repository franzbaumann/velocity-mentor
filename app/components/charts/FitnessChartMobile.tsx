import { FC, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
type Point = { date: string; CTL: number; ATL: number; TSB: number };

type Props = {
  data: Point[];
};

type XY = { x: number; y: number };

function buildSmoothPath(points: XY[]): string {
  if (points.length < 2) return "";
  if (points.length === 2) {
    return `M ${points[0].x},${points[0].y} L ${points[1].x},${points[1].y}`;
  }
  const tension = 0.4;
  let d = `M ${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + ((p2.x - p0.x) / 6) * tension;
    const cp1y = p1.y + ((p2.y - p0.y) / 6) * tension;
    const cp2x = p2.x - ((p3.x - p1.x) / 6) * tension;
    const cp2y = p2.y - ((p3.y - p1.y) / 6) * tension;
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  return d;
}

export const FitnessChartMobile: FC<Props> = ({ data }) => {
  const { ctlPath, atlPath, tsbPath, last } = useMemo(() => {
    if (!data.length) {
      return { ctlPath: "", atlPath: "", tsbPath: "", last: null as Point | null };
    }
    const values = data.flatMap((d) => [d.CTL, d.ATL, d.TSB]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const w = 100;
    const hMargin = 3;
    const h = 36;
    const step = (w - hMargin * 2) / (data.length - 1 || 1);

    const makeSeries = (accessor: (d: Point) => number): XY[] =>
      data.map((d, i) => {
        const v = accessor(d);
        const x = hMargin + i * step;
        const y = h - ((v - min) / range) * h;
        return { x, y };
      });

    const ctlPoints = makeSeries((d) => d.CTL);
    const atlPoints = makeSeries((d) => d.ATL);
    const tsbPoints = makeSeries((d) => d.TSB);

    return {
      ctlPath: buildSmoothPath(ctlPoints),
      atlPath: buildSmoothPath(atlPoints),
      tsbPath: buildSmoothPath(tsbPoints),
      last: data[data.length - 1],
    };
  }, [data]);

  if (!last) {
    return <View style={styles.empty} />;
  }

  const stroke = 0.6;
  return (
    <View>
      <View style={styles.chart}>
        <Svg width="100%" height={90} viewBox="0 0 100 40" preserveAspectRatio="none">
          {tsbPath ? (
            <Path
              d={tsbPath}
              fill="none"
              stroke="#22c55e"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
          {ctlPath ? (
            <Path
              d={ctlPath}
              fill="none"
              stroke="#555"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
          {atlPath ? (
            <Path
              d={atlPath}
              fill="none"
              stroke="#2196F3"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
        </Svg>
      </View>
      <View style={styles.legendRow}>
        <Text style={styles.legendText}>
          <Text style={[styles.legendLabel, { color: "#555" }]}>CTL </Text>
          <Text style={styles.legendValue}>{Math.round(last.CTL)}</Text>
        </Text>
        <Text style={styles.legendText}>
          <Text style={[styles.legendLabel, { color: "#2196F3" }]}>ATL </Text>
          <Text style={styles.legendValue}>{Math.round(last.ATL)}</Text>
        </Text>
        <Text style={styles.legendText}>
          <Text style={[styles.legendLabel, { color: "#22c55e" }]}>TSB </Text>
          <Text style={styles.legendValue}>{last.TSB.toFixed(1)}</Text>
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  empty: {
    height: 90,
  },
  chart: {
    height: 90,
    width: "100%",
  },
  legendRow: {
    flexDirection: "row",
    gap: 20,
    marginTop: 8,
  },
  legendText: {
    fontSize: 13,
    color: "#444",
  },
  legendLabel: {
    fontWeight: "600",
  },
  legendValue: {
    color: "#444",
  },
});


