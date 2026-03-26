import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSupabaseAuth } from "../../SupabaseProvider";
import { GlassCard } from "../../components/GlassCard";
import { getRecoveryProgramById } from "../../data/recoveryPrograms";
import { useTheme } from "../../context/ThemeContext";
import type { RecoveryStackParamList } from "../../navigation/RootNavigator";
import { supabase } from "../../shared/supabase";
import { spacing } from "../../theme/theme";

type Props = NativeStackScreenProps<RecoveryStackParamList, "RecoveryCompletion">;

export function RecoveryCompletionScreen({ route, navigation }: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useSupabaseAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const program = useMemo(() => getRecoveryProgramById(route.params.programId), [route.params.programId]);

  const onLogSession = async () => {
    if (!program || !user || isSaving || isSaved) return;
    setSaveError(null);
    setIsSaving(true);
    const { error } = await supabase.from("recovery_sessions").insert({
      user_id: user.id,
      program_id: program.id,
      program_title: program.title,
      duration_minutes: program.durationMinutes,
      exercises_completed: program.exercises.length,
    });
    setIsSaving(false);
    if (error) {
      setSaveError(error.message);
      return;
    }
    setIsSaved(true);
  };

  const onDone = () => {
    navigation.getParent()?.goBack();
  };

  if (!program) {
    return (
      <View style={[styles.fallback, { backgroundColor: theme.appBackground }]}>
        <Text style={{ color: theme.textPrimary }}>Program not found.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.appBackground }]}>
      <View style={styles.content}>
        <GlassCard style={styles.card}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>Session Complete! 🎉</Text>
          <Text style={[styles.summary, { color: theme.textSecondary }]}>{program.title}</Text>
          <Text style={[styles.summary, { color: theme.textSecondary }]}>Total time: {program.durationMinutes} minutes</Text>
          <Text style={[styles.summary, { color: theme.textSecondary }]}>
            Exercises completed: {program.exercises.length}
          </Text>
          {saveError ? <Text style={[styles.error, { color: theme.negative }]}>{saveError}</Text> : null}
        </GlassCard>
      </View>

      <View
        style={[
          styles.footer,
          {
            borderTopColor: theme.cardBorder,
            paddingBottom: Math.max(12, insets.bottom),
            backgroundColor: theme.appBackground,
          },
        ]}
      >
        <Pressable
          style={[
            styles.primaryBtn,
            {
              backgroundColor: isSaved ? theme.accentGreen : theme.accentBlue,
              opacity: isSaving ? 0.7 : 1,
            },
          ]}
          onPress={onLogSession}
        >
          <Text style={[styles.primaryText, { color: theme.primaryForeground }]}>
            {isSaved ? "Logged" : isSaving ? "Logging..." : "Log this session"}
          </Text>
        </Pressable>
        <Pressable style={[styles.secondaryBtn, { borderColor: theme.cardBorder }]} onPress={onDone}>
          <Text style={[styles.secondaryText, { color: theme.textPrimary }]}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.screenHorizontal,
  },
  card: {
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
  },
  summary: {
    fontSize: 14,
  },
  error: {
    marginTop: 6,
    fontSize: 12,
  },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: 10,
    gap: 10,
  },
  primaryBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryText: {
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryBtn: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryText: {
    fontSize: 15,
    fontWeight: "700",
  },
  fallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
