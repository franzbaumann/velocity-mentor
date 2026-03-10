import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/theme";

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

const typeStyles: Record<WorkoutType, { bg: string; text: string }> = {
  easy: { bg: "rgba(34, 197, 94, 0.15)", text: colors.accent },
  tempo: { bg: "rgba(59, 130, 246, 0.15)", text: colors.primary },
  interval: { bg: "rgba(239, 68, 68, 0.15)", text: colors.destructive },
  long: { bg: "rgba(245, 158, 11, 0.15)", text: colors.warning },
  recovery: { bg: colors.secondary, text: colors.mutedForeground },
  rest: { bg: colors.muted, text: colors.mutedForeground },
  race: { bg: "rgba(59, 130, 246, 0.15)", text: colors.primary },
};

export function WorkoutBadge({ type }: { type: WorkoutType }) {
  const { bg, text } = typeStyles[type] ?? typeStyles.easy;
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
