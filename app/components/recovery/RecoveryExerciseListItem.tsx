import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Exercise } from "../../data/recoveryPrograms";
import { useTheme } from "../../context/ThemeContext";

type RecoveryExerciseListItemProps = {
  exercise: Exercise;
  onPress: () => void;
};

function formatExerciseMeta(exercise: Exercise): string {
  if (exercise.durationSeconds != null) {
    return `${exercise.durationSeconds}s`;
  }
  if (exercise.sets != null && exercise.reps != null) {
    return `${exercise.sets} sets x ${exercise.reps} reps`;
  }
  if (exercise.reps != null) {
    return `${exercise.reps} reps`;
  }
  if (exercise.sets != null) {
    return `${exercise.sets} sets`;
  }
  return "No target";
}

export function RecoveryExerciseListItem({ exercise, onPress }: RecoveryExerciseListItemProps) {
  const { theme } = useTheme();

  return (
    <Pressable onPress={onPress} style={[styles.container, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder }]}>
      <Image source={{ uri: exercise.gifUrl }} style={styles.thumbnail} />
      <View style={styles.content}>
        <Text style={[styles.name, { color: theme.textPrimary }]}>{exercise.name}</Text>
        <Text style={[styles.meta, { color: theme.textSecondary }]}>{formatExerciseMeta(exercise)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  thumbnail: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: "#111111",
  },
  content: {
    flex: 1,
    gap: 4,
  },
  name: {
    fontSize: 14,
    fontWeight: "600",
  },
  meta: {
    fontSize: 12,
  },
});
