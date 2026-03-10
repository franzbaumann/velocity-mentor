import { useMemo } from "react";
import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { StyleSheet } from "react-native";
import { colors } from "../theme/theme";

type SparklineProps = { data: number[]; color?: string };

export function Sparkline({ data, color = colors.primary }: SparklineProps) {
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
      return `${x},${y}`;
    });
    return `M ${points.join(" L ")}`;
  }, [data]);

  if (data.length < 2) return <View style={styles.container} />;

  return (
    <View style={styles.container}>
      <Svg width="100%" height={40} viewBox="0 0 100 40" preserveAspectRatio="none">
        <Path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
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
