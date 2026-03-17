import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../context/ThemeContext";

type RecoverySessionProgressBarProps = {
  current: number;
  total: number;
};

export function RecoverySessionProgressBar({ current, total }: RecoverySessionProgressBarProps) {
  const { theme } = useTheme();
  const normalizedTotal = Math.max(1, total);
  const clampedCurrent = Math.min(Math.max(current, 1), normalizedTotal);
  const progressPct = (clampedCurrent / normalizedTotal) * 100;

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>
        Exercise {clampedCurrent} of {normalizedTotal}
      </Text>
      <View style={[styles.track, { backgroundColor: theme.cardBorder }]}>
        <View style={[styles.fill, { width: `${progressPct}%`, backgroundColor: theme.accentBlue }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
  },
  track: {
    height: 8,
    borderRadius: 999,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 999,
  },
});
