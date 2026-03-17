import React, { memo, useEffect, useMemo } from "react";
import { View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { StyleSheet, Text } from "react-native";
import { useTheme } from "../context/ThemeContext";
import type { AppTheme } from "../theme/themes";
import Animated, {
  Easing as ReEasing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

type ReadinessRingProps = {
  score: number;
  size?: number;
  /** When provided, ring and label use TSB-based status (READY/NEUTRAL/FATIGUED) */
  statusLabel?: string;
  statusColor?: string;
  /** Override the center number display (e.g. "48ms", "6h 48m") */
  centerText?: string;
  /** Optional scale factor for center text size (default 0.24 * size) */
  centerScale?: number;
};

function getColor(score: number, t: AppTheme) {
  if (score >= 75) return t.positive;
  if (score >= 50) return t.warning;
  return t.negative;
}

function getStatusLabel(score: number) {
  if (score >= 75) return "Ready";
  if (score >= 50) return "Neutral";
  return "Fatigued";
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

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

export const ReadinessRing = memo(function ReadinessRing({ score, size = 100, statusLabel, statusColor, centerText, centerScale }: ReadinessRingProps) {
  const { theme } = useTheme();
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedScore = Math.max(0, Math.min(100, score));
  const ringColor = statusColor ?? getColor(clampedScore, theme);
  const labelText = statusLabel ?? getStatusLabel(clampedScore);
  const gradientId = useMemo(
    () => `readiness-ring-${ringColor.replace(/[^a-zA-Z0-9]/g, "")}-${size}`,
    [ringColor, size],
  );

  const progress = useSharedValue(clampedScore / 100);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  // animate whenever score changes
  useEffect(() => {
    progress.value = withTiming(clampedScore / 100, {
      duration: 1200,
      easing: ReEasing.out(ReEasing.cubic),
    });
  }, [clampedScore, progress]);

  return (
    <View style={[styles.wrapper, { width: size, height: size }]}>
      <Svg width={size} height={size} style={styles.rotate}>
        <Defs>
          <LinearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={ringColor} stopOpacity={0.7} />
            <Stop offset="100%" stopColor={ringColor} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        {/* Track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={theme.surfaceOverlay ?? theme.cardBorder}
          strokeWidth={strokeWidth}
        />
        {/* Animated progress arc with subtle shade */}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeLinecap="round"
          animatedProps={animatedProps}
        />
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Text
          style={[styles.score, { fontSize: size * (centerScale ?? 0.24), color: theme.textPrimary }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {centerText ?? Math.round(clampedScore)}
        </Text>
        <Text style={[styles.label, { color: statusColor ?? ringColor ?? theme.textMuted, fontSize: Math.max(7, size * 0.1) }]}>{labelText}</Text>
      </View>
    </View>
  );
});
