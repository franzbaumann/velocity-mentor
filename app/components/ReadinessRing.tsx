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
  const clampedScore = Math.max(0, Math.min(100, score));
  const progress = (clampedScore / 100) * circumference;
  const ringColor = statusColor ?? getColor(score, theme);
  const labelText = statusLabel ?? "Ready";
  const gapLen = 1.8;
  const zones = [
    { start: 0, end: 40, color: "#ef4444" },
    { start: 40, end: 60, color: "#f97316" },
    { start: 60, end: 80, color: "#facc15" },
    { start: 80, end: 100, color: "#22c55e" },
  ];
  const remaining = Math.max(circumference - progress, 0);

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
        {zones.map((zone) => {
          const startLen = (zone.start / 100) * circumference;
          const zoneLen = Math.max(((zone.end - zone.start) / 100) * circumference - gapLen, 0);
          return (
            <Circle
              key={`${zone.start}-${zone.end}`}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={zone.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${zoneLen} ${circumference}`}
              strokeDashoffset={-startLen}
              strokeLinecap="round"
            />
          );
        })}
        {remaining > 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={theme.cardBorder}
            strokeWidth={strokeWidth}
            strokeDasharray={`${remaining} ${circumference}`}
            strokeDashoffset={-progress}
            strokeLinecap="round"
          />
        )}
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Text style={[styles.score, { fontSize: size * 0.24, color: theme.textPrimary }]}>{score}</Text>
        <Text style={[styles.label, { color: statusColor ?? ringColor ?? theme.textMuted }]}>{labelText}</Text>
      </View>
    </View>
  );
}
