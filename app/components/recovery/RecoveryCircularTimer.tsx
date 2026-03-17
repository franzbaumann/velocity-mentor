import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useTheme } from "../../context/ThemeContext";

type RecoveryCircularTimerProps = {
  totalSeconds: number;
  secondsLeft: number;
  size?: number;
  strokeWidth?: number;
};

export function RecoveryCircularTimer({
  totalSeconds,
  secondsLeft,
  size = 150,
  strokeWidth = 10,
}: RecoveryCircularTimerProps) {
  const { theme } = useTheme();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = useMemo(() => {
    if (totalSeconds <= 0) return 0;
    return Math.max(0, Math.min(1, (totalSeconds - secondsLeft) / totalSeconds));
  }, [secondsLeft, totalSeconds]);

  return (
    <View style={styles.container}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={theme.cardBorder}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={theme.accentBlue}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - progress)}
          strokeLinecap="round"
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={styles.labelWrap}>
        <Text style={[styles.seconds, { color: theme.textPrimary }]}>{secondsLeft}s</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  labelWrap: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  seconds: {
    fontSize: 28,
    fontWeight: "700",
  },
});
