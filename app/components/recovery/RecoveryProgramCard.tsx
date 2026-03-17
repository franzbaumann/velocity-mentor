import { Pressable, StyleSheet, Text, View } from "react-native";
import { RecoveryProgram } from "../../data/recoveryPrograms";
import { useTheme } from "../../context/ThemeContext";
import { GlassCard } from "../GlassCard";

type RecoveryProgramCardProps = {
  program: RecoveryProgram;
  onPress: () => void;
};

function toChipLabel(value: string): string {
  return value.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function RecoveryProgramCard({ program, onPress }: RecoveryProgramCardProps) {
  const { theme } = useTheme();

  return (
    <Pressable onPress={onPress}>
      <GlassCard style={styles.card}>
        <View style={styles.topRow}>
          <View style={styles.titleCol}>
            <Text style={[styles.title, { color: theme.textPrimary }]}>{program.title}</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{program.subtitle}</Text>
          </View>
          <View style={[styles.durationBadge, { backgroundColor: theme.cardBorder }]}>
            <Text style={[styles.durationText, { color: theme.textPrimary }]}>{program.durationMinutes} min</Text>
          </View>
        </View>

        <View style={styles.tagsRow}>
          {program.categories.map((category) => (
            <View key={category} style={[styles.tag, { backgroundColor: theme.cardBorder }]}>
              <Text style={[styles.tagText, { color: theme.textSecondary }]}>{toChipLabel(category)}</Text>
            </View>
          ))}
          {program.bodyParts.map((bodyPart) => (
            <View key={bodyPart} style={[styles.tag, { backgroundColor: `${theme.accentBlue}22` }]}>
              <Text style={[styles.tagText, { color: theme.accentBlue }]}>{toChipLabel(bodyPart)}</Text>
            </View>
          ))}
        </View>

        <Text style={[styles.meta, { color: theme.textMuted }]}>{program.exercises.length} exercises</Text>
      </GlassCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
  },
  topRow: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  titleCol: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 12,
  },
  durationBadge: {
    borderRadius: 999,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  durationText: {
    fontSize: 12,
    fontWeight: "700",
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  tag: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tagText: {
    fontSize: 11,
    fontWeight: "600",
  },
  meta: {
    fontSize: 11,
  },
});
