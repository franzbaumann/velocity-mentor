import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../context/ThemeContext";
import type { ColorPalette } from "../theme/theme";

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

function typeStyles(c: ColorPalette): Record<WorkoutType, { bg: string; text: string }> {
  return {
    easy: { bg: "rgba(34, 197, 94, 0.15)", text: c.accent },
    tempo: { bg: "rgba(59, 130, 246, 0.15)", text: c.primary },
    interval: { bg: "rgba(239, 68, 68, 0.15)", text: c.destructive },
    long: { bg: "rgba(245, 158, 11, 0.15)", text: c.warning },
    recovery: { bg: c.secondary, text: c.mutedForeground },
    rest: { bg: c.muted, text: c.mutedForeground },
    race: { bg: "rgba(59, 130, 246, 0.15)", text: c.primary },
  };
}

export function WorkoutBadge({ type }: { type: WorkoutType }) {
  const { colors } = useTheme();
  const stylesMap = useMemo(() => typeStyles(colors), [colors]);
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
