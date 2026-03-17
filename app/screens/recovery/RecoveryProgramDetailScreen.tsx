import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassCard } from "../../components/GlassCard";
import { RecoveryExerciseListItem, RecoveryExerciseModal } from "../../components/recovery";
import { Exercise, getRecoveryProgramById } from "../../data/recoveryPrograms";
import { useTheme } from "../../context/ThemeContext";
import type { RecoveryStackParamList } from "../../navigation/RootNavigator";
import { spacing } from "../../theme/theme";

type Props = NativeStackScreenProps<RecoveryStackParamList, "RecoveryProgramDetail">;

function pretty(value: string): string {
  return value.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function RecoveryProgramDetailScreen({ route, navigation }: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const program = useMemo(() => getRecoveryProgramById(route.params.programId), [route.params.programId]);

  if (!program) {
    return (
      <View style={[styles.fallback, { backgroundColor: theme.appBackground }]}>
        <Text style={{ color: theme.textPrimary }}>Program not found.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.appBackground }]}>
      <FlatList
        data={program.exercises}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: 110 + insets.bottom,
          },
        ]}
        ListHeaderComponent={
          <GlassCard style={styles.headerCard}>
            <Text style={[styles.title, { color: theme.textPrimary }]}>{program.title}</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{program.subtitle}</Text>
            <View style={styles.tagsRow}>
              <View style={[styles.durationBadge, { backgroundColor: theme.cardBorder }]}>
                <Text style={[styles.durationText, { color: theme.textPrimary }]}>{program.durationMinutes} min</Text>
              </View>
              {program.categories.map((category) => (
                <View key={category} style={[styles.tag, { backgroundColor: theme.cardBorder }]}>
                  <Text style={[styles.tagText, { color: theme.textSecondary }]}>{pretty(category)}</Text>
                </View>
              ))}
              {program.bodyParts.map((bodyPart) => (
                <View key={bodyPart} style={[styles.tag, { backgroundColor: `${theme.accentBlue}22` }]}>
                  <Text style={[styles.tagText, { color: theme.accentBlue }]}>{pretty(bodyPart)}</Text>
                </View>
              ))}
            </View>
          </GlassCard>
        }
        renderItem={({ item }) => (
          <RecoveryExerciseListItem exercise={item} onPress={() => setSelectedExercise(item)} />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      <View
        style={[
          styles.ctaWrap,
          {
            paddingBottom: Math.max(12, insets.bottom),
            backgroundColor: theme.appBackground,
            borderTopColor: theme.cardBorder,
          },
        ]}
      >
        <Pressable
          style={[styles.cta, { backgroundColor: theme.accentBlue }]}
          onPress={() => navigation.navigate("RecoverySession", { programId: program.id, startIndex: 0 })}
        >
          <Text style={[styles.ctaText, { color: theme.primaryForeground }]}>Start Program</Text>
        </Pressable>
      </View>

      <RecoveryExerciseModal
        visible={selectedExercise != null}
        exercise={selectedExercise}
        onClose={() => setSelectedExercise(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingTop: 16,
    paddingHorizontal: spacing.screenHorizontal,
  },
  headerCard: {
    gap: 8,
    marginBottom: 14,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 13,
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  durationBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  durationText: {
    fontSize: 12,
    fontWeight: "700",
  },
  tag: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  tagText: {
    fontSize: 11,
    fontWeight: "600",
  },
  separator: {
    height: 10,
  },
  ctaWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: 10,
  },
  cta: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  ctaText: {
    fontSize: 15,
    fontWeight: "700",
  },
  fallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
