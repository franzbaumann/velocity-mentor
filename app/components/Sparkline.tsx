import React, { memo, useMemo } from "react";
import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";

type SparklineProps = { data: number[]; color?: string };

export const Sparkline = memo(function Sparkline({ data, color: colorProp }: SparklineProps) {
  const { theme } = useTheme();
  const color = colorProp ?? theme.chartLine;
  const path = useMemo(() => {
    if (data.length < 2) return "";
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const w = 100;
    const h = 36;
    const pad = 2;
    const step = w / (data.length - 1);
    const points = data.map((v, i) => {
      const x = i * step;
      const y = pad + (h - 2 * pad) - ((v - min) / range) * (h - 2 * pad);
      return { x, y };
    });

    if (points.length === 2) {
      return `M ${points[0].x},${points[0].y} L ${points[1].x},${points[1].y}`;
    }

    let d = `M ${points[0].x},${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }
    return d;
  }, [data]);

  if (data.length < 2) return <View style={styles.container} />;

  return (
    <View style={styles.container}>
      <Svg width="100%" height={40} viewBox="0 0 100 40" preserveAspectRatio="none">
        <Path d={path} fill="none" stroke={color} strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    height: 40,
    width: "100%",
  },
});
