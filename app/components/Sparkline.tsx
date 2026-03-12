import { useMemo } from "react";
import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";

type SparklineProps = { data: number[]; color?: string };

export function Sparkline({ data, color: colorProp }: SparklineProps) {
  const { theme } = useTheme();
  const color = colorProp ?? theme.chartLine;
  const path = useMemo(() => {
    if (data.length < 2) return "";
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const w = 100;
    const h = 36;
    const step = w / (data.length - 1);
    const points = data.map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / range) * h;
      return { x, y };
    });

    let d = `M ${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i].x},${points[i].y}`;
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
}

const styles = StyleSheet.create({
  container: {
    height: 40,
    width: "100%",
  },
});
