import React, { memo, useEffect, useMemo } from "react";
import { View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { StyleSheet, Text } from "react-native";
import type { TextStyle } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { readinessColorForScore, readinessStatusForScore } from "../lib/readinessColors";
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
  strokeWidth?: number;
  trackColor?: string;
  innerTrackColor?: string;
  centerTextStyle?: TextStyle;
  labelTextStyle?: TextStyle;
};

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

export const ReadinessRing = memo(function ReadinessRing({
  score,
  size = 100,
  statusLabel,
  statusColor,
  centerText,
  centerScale,
  strokeWidth = 4,
  trackColor,
  innerTrackColor,
  centerTextStyle,
  labelTextStyle,
}: ReadinessRingProps) {
  const { theme } = useTheme();
  const radius = (size - strokeWidth) / 2;
  const innerTrackRadius = Math.max(1, radius - Math.max(1, strokeWidth * 0.8));
  const circumference = 2 * Math.PI * radius;
  const clampedScore = Math.max(0, Math.min(100, score));
  const ringColor = statusColor ?? readinessColorForScore(clampedScore);
  const labelText = statusLabel ?? readinessStatusForScore(clampedScore);
  const arcFadeId = useMemo(() => {
    const labelSlug = String(labelText ?? "ring")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    return `arcFade_${labelSlug}_${ringColor.replace(/[^a-zA-Z0-9]/g, "")}_${size}`;
  }, [labelText, ringColor, size]);
  const center = size / 2;
  const progressRatio = clampedScore / 100;

  const progress = useSharedValue(clampedScore / 100);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));
  const arcFadeGeometry = useMemo(() => {
    const startAngle = 0;
    const endAngle = 2 * Math.PI * progressRatio;
    return {
      x1: center + radius * Math.cos(startAngle),
      y1: center + radius * Math.sin(startAngle),
      x2: center + radius * Math.cos(endAngle),
      y2: center + radius * Math.sin(endAngle),
    };
  }, [center, progressRatio, radius]);

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
          <LinearGradient
            id={arcFadeId}
            gradientUnits="userSpaceOnUse"
            x1={arcFadeGeometry.x1}
            y1={arcFadeGeometry.y1}
            x2={arcFadeGeometry.x2}
            y2={arcFadeGeometry.y2}
          >
            <Stop offset="0%" stopColor={ringColor} stopOpacity={1} />
            <Stop offset="30%" stopColor={ringColor} stopOpacity={1} />
            <Stop offset="100%" stopColor={ringColor} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {/* Track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor ?? ringColor}
          strokeOpacity={trackColor ? 1 : 0.1}
          strokeWidth={strokeWidth}
          strokeLinecap="butt"
        />
        {innerTrackColor ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={innerTrackRadius}
            fill="none"
            stroke={innerTrackColor}
            strokeWidth={Math.max(1, strokeWidth * 0.6)}
            strokeLinecap="butt"
          />
        ) : null}
        {/* Animated progress arc with rounded caps */}
        <AnimatedCircle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={`url(#${arcFadeId})`}
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeLinecap="round"
          animatedProps={animatedProps}
        />
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Text
          style={[
            styles.score,
            { fontSize: size * (centerScale ?? 0.24), color: theme.textPrimary },
            centerTextStyle,
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {centerText ?? Math.round(clampedScore)}
        </Text>
        <Text
          style={[
            styles.label,
            { color: statusColor ?? ringColor ?? theme.textMuted, fontSize: Math.max(7, size * 0.1) },
            labelTextStyle,
          ]}
        >
          {labelText}
        </Text>
      </View>
    </View>
  );
});
