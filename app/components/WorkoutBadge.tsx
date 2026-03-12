import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../context/ThemeContext";
import type { AppTheme } from "../theme/themes";

export type WorkoutType = "easy" | "tempo" | "interval" | "long" | "recovery" | "rest" | "race";

const labels: Record<WorkoutType, string> = {
  easy: "Easy",
  tempo: "Tempo",
  interval: "Interval",
  long: "Long",
  recovery: "Recovery",
  rest: "Rest",
  race: "Race",
};

function typeStyles(t: AppTheme): Record<WorkoutType, { bg: string; text: string }> {
  return {
    easy: { bg: t.chartFill, text: t.accentGreen },
    tempo: { bg: t.chartFill, text: t.accentBlue },
    interval: { bg: t.negative + "26", text: t.negative },
    long: { bg: t.warning + "26", text: t.warning },
    recovery: { bg: t.cardBorder, text: t.textMuted },
    rest: { bg: t.cardBorder, text: t.textMuted },
    race: { bg: t.chartFill, text: t.accentBlue },
  };
}

export function WorkoutBadge({ type }: { type: WorkoutType }) {
  const { theme } = useTheme();
  const stylesMap = useMemo(() => typeStyles(theme), [theme]);
  const { bg, text } = stylesMap[type] ?? stylesMap.easy;
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: text }]}>{labels[type]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: 12,
    fontWeight: "500",
  },
});
