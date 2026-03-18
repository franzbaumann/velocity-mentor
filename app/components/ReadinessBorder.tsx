import { useEffect, useState } from "react";
import { LayoutChangeEvent, StyleSheet, View, ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useTheme } from "../context/ThemeContext";
import { readinessColorForScore } from "../lib/readinessColors";

const AnimatedPath = Animated.createAnimatedComponent(Path);

type ReadinessBorderProps = {
  readiness: number;
  radius?: number;
  strokeWidth?: number;
  color?: string;
  duration?: number;
  haptic?: boolean;
  style?: ViewStyle;
  children?: React.ReactNode;
};

function createPath(w: number, h: number, r: number): string {
  return `M ${w / 2} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 H ${w / 2}`;
}

function perimeter(w: number, h: number, r: number): number {
  return 2 * (w + h - 2 * r) + 2 * Math.PI * r;
}

const HIGHLIGHT_LEN = 40;

export function ReadinessBorder({
  readiness,
  radius = 16,
  strokeWidth = 3,
  color,
  duration = 1200,
  haptic = true,
  style,
  children,
}: ReadinessBorderProps) {
  const { theme } = useTheme();
  const [dims, setDims] = useState({ w: 0, h: 0 });

  const p = useSharedValue(0);
  const glow = useSharedValue(0);

  const resolvedColor = color ?? readinessColorForScore(readiness);
  const clamped = Math.max(0, Math.min(1, readiness / 100));

  const w = dims.w || 1;
  const h = dims.h || 1;
  const len = perimeter(w, h, radius);
  const d = createPath(w, h, radius);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width: lw, height: lh } = e.nativeEvent.layout;
    setDims((prev) => (prev.w === lw && prev.h === lh ? prev : { w: lw, h: lh }));
  };

  useEffect(() => {
    p.value = 0;
    p.value = withTiming(clamped, {
      duration,
      easing: Easing.out(Easing.cubic),
    });

    glow.value = 0;
    glow.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.linear }),
      -1,
      true,
    );

    if (haptic && clamped > 0) {
      const t = setTimeout(() => {
        Haptics.impactAsync(
          clamped >= 0.75
            ? Haptics.ImpactFeedbackStyle.Medium
            : Haptics.ImpactFeedbackStyle.Light,
        );
      }, duration);
      return () => clearTimeout(t);
    }
  }, [clamped, duration, haptic, p, glow]);

  // Progress stroke — single continuous line drawn from top center
  const progressProps = useAnimatedProps(() => ({
    strokeDashoffset: len * (1 - p.value),
  }));

  // Leading-edge highlight — 40px glow that sits at the tip of progress
  const highlightProps = useAnimatedProps(() => {
    const edge = p.value * len;
    return {
      strokeDashoffset: len - edge + HIGHLIGHT_LEN / 2,
      strokeOpacity: 0.15 + glow.value * 0.25,
    };
  });

  return (
    <View style={[styles.container, style]} onLayout={onLayout}>
      {children}
      {dims.w > 0 && (
        <Svg
          width={dims.w}
          height={dims.h}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        >
          <Defs>
            <LinearGradient id="edgeGlow" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor="white" stopOpacity="0" />
              <Stop offset="50%" stopColor="white" stopOpacity="0.6" />
              <Stop offset="100%" stopColor="white" stopOpacity="0" />
            </LinearGradient>
          </Defs>

          {/* Track */}
          <Path
            d={d}
            stroke={theme.cardBorder}
            strokeWidth={strokeWidth}
            fill="none"
          />

          {/* Progress stroke */}
          <AnimatedPath
            d={d}
            stroke={resolvedColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${len} ${len}`}
            animatedProps={progressProps}
          />

          {/* Leading-edge micro-glow */}
          <AnimatedPath
            d={d}
            stroke="url(#edgeGlow)"
            strokeWidth={strokeWidth + 1}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${HIGHLIGHT_LEN} ${len}`}
            animatedProps={highlightProps}
          />
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
  },
});
