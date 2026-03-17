import { Modal, Pressable, ScrollView, StyleSheet, Text, View, Image } from "react-native";
import { Exercise } from "../../data/recoveryPrograms";
import { useTheme } from "../../context/ThemeContext";

type RecoveryExerciseModalProps = {
  visible: boolean;
  exercise: Exercise | null;
  onClose: () => void;
};

export function RecoveryExerciseModal({ visible, exercise, onClose }: RecoveryExerciseModalProps) {
  const { theme } = useTheme();

  if (!exercise) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, { backgroundColor: theme.overlayBackdrop }]} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder }]}
          onPress={(event) => event.stopPropagation()}
        >
          <ScrollView contentContainerStyle={styles.content}>
            <Image source={{ uri: exercise.gifUrl }} style={styles.image} />
            <Text style={[styles.title, { color: theme.textPrimary }]}>{exercise.name}</Text>
            <Text style={[styles.description, { color: theme.textSecondary }]}>{exercise.description}</Text>
            <Text style={[styles.cuesTitle, { color: theme.textPrimary }]}>Coaching cues</Text>
            {exercise.cues.map((cue) => (
              <Text key={cue} style={[styles.cue, { color: theme.textSecondary }]}>
                - {cue}
              </Text>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  sheet: {
    borderRadius: 16,
    borderWidth: 1,
    maxHeight: "80%",
  },
  content: {
    padding: 16,
    gap: 10,
  },
  image: {
    width: "100%",
    height: 200,
    borderRadius: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
  cuesTitle: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "700",
  },
  cue: {
    fontSize: 13,
    lineHeight: 18,
  },
});
