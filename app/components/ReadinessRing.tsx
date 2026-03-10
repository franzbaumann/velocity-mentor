import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { StyleSheet, Text } from "react-native";
import { colors, typography } from "../theme/theme";

type ReadinessRingProps = { score: number; size?: number };

function getColor(score: number) {
  if (score >= 75) return colors.accent;
  if (score >= 50) return colors.warning;
  return colors.destructive;
}

export function ReadinessRing({ score, size = 100 }: ReadinessRingProps) {
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const strokeDashoffset = circumference - progress;

  return (
    <View style={[styles.wrapper, { width: size, height: size }]}>
      <Svg width={size} height={size} style={styles.rotate}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colors.muted}
          strokeWidth={strokeWidth}
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={getColor(score)}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Text style={[styles.score, { fontSize: size * 0.24 }]}>{score}</Text>
        <Text style={styles.label}>Ready</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: "relative", alignItems: "center", justifyContent: "center" },
  rotate: { transform: [{ rotate: "-90deg" }] },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  score: {
    fontWeight: "700",
    color: colors.foreground,
    fontVariant: ["tabular-nums"],
  },
  label: {
    fontSize: 10,
    color: colors.mutedForeground,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 2,
  },
});
