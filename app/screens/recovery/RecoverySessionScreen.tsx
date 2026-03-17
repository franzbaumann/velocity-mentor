import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getRecoveryProgramById } from "../../data/recoveryPrograms";
import { useTheme } from "../../context/ThemeContext";
import type { RecoveryStackParamList } from "../../navigation/RootNavigator";
import { RecoveryCircularTimer, RecoverySessionProgressBar } from "../../components/recovery";
import { spacing } from "../../theme/theme";

type Props = NativeStackScreenProps<RecoveryStackParamList, "RecoverySession">;

const REST_SECONDS = 15;

type SessionMode = "exercise" | "rest";

export function RecoverySessionScreen({ route, navigation }: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const program = useMemo(() => getRecoveryProgramById(route.params.programId), [route.params.programId]);
  const [exerciseIndex, setExerciseIndex] = useState(route.params.startIndex ?? 0);
  const [mode, setMode] = useState<SessionMode>("exercise");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [repCounter, setRepCounter] = useState(0);

  const exercise = program?.exercises[exerciseIndex];
  const totalExercises = program?.exercises.length ?? 0;
  const isTimedExercise = exercise?.durationSeconds != null;

  useEffect(() => {
    if (!exercise) return;
    setRepCounter(exercise.reps ?? 0);
    if (mode === "exercise" && exercise.durationSeconds != null) {
      setSecondsLeft(exercise.durationSeconds);
    }
  }, [exercise, mode]);

  useEffect(() => {
    if (mode !== "rest" && !isTimedExercise) return;
    if (secondsLeft <= 0) return;
    const timer = setInterval(() => setSecondsLeft((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [isTimedExercise, mode, secondsLeft]);

  useEffect(() => {
    if (!exercise) return;
    if (mode === "exercise" && isTimedExercise && secondsLeft <= 0) {
      onExerciseCompleted();
    }
  }, [exercise, isTimedExercise, mode, secondsLeft]);

  useEffect(() => {
    if (mode === "rest" && secondsLeft <= 0) {
      goToNextExercise();
    }
  }, [mode, secondsLeft]);

  if (!program || !exercise) {
    return (
      <View style={[styles.fallback, { backgroundColor: theme.appBackground }]}>
        <Text style={{ color: theme.textPrimary }}>Session data unavailable.</Text>
      </View>
    );
  }

  const onExerciseCompleted = () => {
    const isLast = exerciseIndex >= totalExercises - 1;
    if (isLast) {
      navigation.replace("RecoveryCompletion", { programId: program.id });
      return;
    }
    setMode("rest");
    setSecondsLeft(REST_SECONDS);
  };

  const goToNextExercise = () => {
    setMode("exercise");
    setExerciseIndex((prev) => prev + 1);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.appBackground }]}>
      <View style={styles.content}>
        <RecoverySessionProgressBar current={exerciseIndex + 1} total={totalExercises} />

        <View style={styles.imageWrap}>
          <Image source={{ uri: exercise.gifUrl }} style={styles.image} />
        </View>

        {mode === "rest" ? (
          <View style={styles.center}>
            <Text style={[styles.restLabel, { color: theme.textPrimary }]}>Rest</Text>
            <RecoveryCircularTimer totalSeconds={REST_SECONDS} secondsLeft={secondsLeft} size={170} />
            <Pressable style={[styles.secondaryBtn, { borderColor: theme.cardBorder }]} onPress={goToNextExercise}>
              <Text style={[styles.secondaryBtnText, { color: theme.textPrimary }]}>Skip Rest</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.exerciseBlock}>
            <Text style={[styles.name, { color: theme.textPrimary }]}>{exercise.name}</Text>
            <View style={styles.cues}>
              {exercise.cues.slice(0, 3).map((cue) => (
                <Text key={cue} style={[styles.cue, { color: theme.textSecondary }]}>
                  - {cue}
                </Text>
              ))}
            </View>

            {isTimedExercise ? (
              <RecoveryCircularTimer totalSeconds={exercise.durationSeconds ?? 0} secondsLeft={secondsLeft} />
            ) : (
              <View style={styles.repCard}>
                <Text style={[styles.repTarget, { color: theme.textPrimary }]}>
                  {exercise.sets ?? 1} sets x {exercise.reps ?? 0} reps
                </Text>
                <View style={styles.repControls}>
                  <Pressable
                    style={[styles.counterBtn, { borderColor: theme.cardBorder }]}
                    onPress={() => setRepCounter((prev) => Math.max(0, prev - 1))}
                  >
                    <Text style={[styles.counterBtnText, { color: theme.textPrimary }]}>-</Text>
                  </Pressable>
                  <Text style={[styles.repCount, { color: theme.textPrimary }]}>{repCounter}</Text>
                  <Pressable
                    style={[styles.counterBtn, { borderColor: theme.cardBorder }]}
                    onPress={() => setRepCounter((prev) => prev + 1)}
                  >
                    <Text style={[styles.counterBtnText, { color: theme.textPrimary }]}>+</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        )}
      </View>

      {mode === "exercise" && (
        <View
          style={[
            styles.footer,
            {
              paddingBottom: Math.max(12, insets.bottom),
              borderTopColor: theme.cardBorder,
              backgroundColor: theme.appBackground,
            },
          ]}
        >
          <Pressable style={[styles.nextBtn, { backgroundColor: theme.accentBlue }]} onPress={onExerciseCompleted}>
            <Text style={[styles.nextBtnText, { color: theme.primaryForeground }]}>Next Exercise</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: 16,
    gap: 16,
  },
  imageWrap: {
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: 220,
  },
  exerciseBlock: {
    gap: 14,
    alignItems: "center",
  },
  name: {
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  cues: {
    gap: 6,
    alignSelf: "stretch",
  },
  cue: {
    fontSize: 14,
  },
  repCard: {
    width: "100%",
    alignItems: "center",
    gap: 14,
  },
  repTarget: {
    fontSize: 18,
    fontWeight: "600",
  },
  repControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
  },
  counterBtn: {
    width: 48,
    height: 48,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  counterBtnText: {
    fontSize: 24,
    fontWeight: "600",
    lineHeight: 24,
  },
  repCount: {
    fontSize: 30,
    fontWeight: "700",
    minWidth: 50,
    textAlign: "center",
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
    flex: 1,
  },
  restLabel: {
    fontSize: 26,
    fontWeight: "700",
  },
  secondaryBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: 10,
  },
  nextBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  nextBtnText: {
    fontSize: 15,
    fontWeight: "700",
  },
  fallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
