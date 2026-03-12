import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { StyleSheet, Text } from "react-native";
import { useTheme } from "../context/ThemeContext";
import type { AppTheme } from "../theme/themes";

type ReadinessRingProps = {
  score: number;
  size?: number;
  /** When provided, ring and label use TSB-based status (READY/NEUTRAL/FATIGUED) */
  statusLabel?: string;
  statusColor?: string;
};

function getColor(score: number, t: AppTheme) {
  if (score >= 75) return t.positive;
  if (score >= 50) return t.warning;
  return t.negative;
}

const styles = StyleSheet.create({
  wrapper: { position: "relative", alignItems: "center", justifyContent: "center" },
  rotate: { transform: [{ rotate: "-90deg" }] },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  score: { fontWeight: "700", fontVariant: ["tabular-nums"] },
  label: { fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 },
});

export function ReadinessRing({ score, size = 100, statusLabel, statusColor }: ReadinessRingProps) {
  const { theme } = useTheme();
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const strokeDashoffset = circumference - progress;
  const ringColor = statusColor ?? getColor(score, theme);
  const labelText = statusLabel ?? "Ready";

  return (
    <View style={[styles.wrapper, { width: size, height: size }]}>
      <Svg width={size} height={size} style={styles.rotate}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={theme.cardBorder}
          strokeWidth={strokeWidth}
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Text style={[styles.score, { fontSize: size * 0.24, color: theme.textPrimary }]}>{score}</Text>
        <Text style={[styles.label, { color: theme.textMuted }]}>{labelText}</Text>
      </View>
    </View>
  );
}
