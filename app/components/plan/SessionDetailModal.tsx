import { FC, useEffect, useMemo, useState } from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useTheme } from "../../context/ThemeContext";
import { TrainingPlanSession } from "../../hooks/useTrainingPlan";
import { typography } from "../../theme/theme";
import { supabase, callEdgeFunctionWithRetry } from "../../shared/supabase";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";

type Props = {
  visible: boolean;
  session: TrainingPlanSession | null;
  onClose: () => void;
  onToggleDone: (session: TrainingPlanSession) => void;
  onAskKipcoachee?: (session: TrainingPlanSession) => void;
};

export const SessionDetailModal: FC<Props> = ({
  visible,
  session,
  onClose,
  onToggleDone,
  onAskKipcoachee,
}) => {
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const [coachNote, setCoachNote] = useState<string | null>(session?.coach_note ?? null);
  const [coachNoteLoading, setCoachNoteLoading] = useState(false);
  const [coachNoteError, setCoachNoteError] = useState<string | null>(null);
  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          flex: 1,
          backgroundColor: theme.overlayBackdrop,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 16,
        },
        card: {
          width: "100%",
          borderRadius: 18,
          backgroundColor: theme.cardBackground,
          padding: 16,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.cardBorder,
        },
        typeRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        },
        typeText: {
          fontSize: 13,
          fontWeight: "600",
          color: theme.textMuted,
          textTransform: "uppercase",
        },
        dateText: {
          fontSize: 12,
          color: theme.textMuted,
        },
        title: {
          fontSize: 16,
          fontWeight: "600",
          color: theme.textPrimary,
          marginBottom: 6,
        },
        metaRow: {
          flexDirection: "row",
          flexWrap: "wrap",
          marginBottom: 8,
        },
        metaText: {
          fontSize: 12,
          color: theme.textMuted,
        },
        focusLabel: {
          fontSize: 12,
          fontWeight: "500",
          color: theme.textMuted,
          marginTop: 4,
        },
        focusText: {
          fontSize: 13,
          color: theme.textPrimary,
          marginTop: 2,
        },
        coachCard: {
          marginTop: 10,
          borderRadius: 12,
          padding: 10,
          backgroundColor: theme.accentBlue + "10",
        },
        coachTitle: {
          fontSize: 12,
          fontWeight: "600",
          color: theme.accentBlue,
          marginBottom: 4,
        },
        coachText: {
          fontSize: 13,
          color: theme.textPrimary,
        },
        actionsRow: {
          flexDirection: "row",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 10,
          marginTop: 14,
        },
        buttonPrimary: {
          paddingHorizontal: 16,
          paddingVertical: 8,
          borderRadius: 999,
          backgroundColor: theme.accentBlue,
        },
        buttonPrimaryText: {
          fontSize: 13,
          fontWeight: "600",
          color: theme.primaryForeground,
        },
        buttonGhost: {
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 999,
        },
        buttonGhostText: {
          fontSize: 13,
          color: theme.textMuted,
        },
      }),
    [theme],
  );

  useEffect(() => {
    if (!session) return;
    setCoachNote(session.coach_note ?? null);
    setCoachNoteError(null);
    if (session.supportsCoachNote !== false && !session.coach_note) {
      void fetchCoachNote(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  const fetchCoachNote = async (regenerate: boolean) => {
    if (!session) return;
    setCoachNoteLoading(true);
    setCoachNoteError(null);
    try {
      const { data, error } = await callEdgeFunctionWithRetry({
        functionName: "intervals-proxy",
        body: { action: "workout_coach_note", workoutId: session.id, regenerate },
        timeoutMs: 20000,
        maxRetries: 3,
        logContext: "SessionDetailModal:workout_coach_note",
      });
      if (error) throw error;
      const res = data as { note?: string; error?: string };
      if (res?.error) {
        setCoachNoteError(res.error);
        return;
      }
      const note = res?.note;
      if (note) {
        setCoachNote(note);
        queryClient.invalidateQueries({ queryKey: ["training-plan"] });
      }
    } catch (e) {
      let msg = (e as Error).message ?? "Failed to generate description";
      if (e instanceof FunctionsHttpError && e.context) {
        const ctx = e.context as { error?: string };
        if (ctx.error) msg = ctx.error;
      }
      setCoachNoteError(msg);
    } finally {
      setCoachNoteLoading(false);
    }
  };

  if (!session) return null;

  const km =
    session.distance_km != null
      ? `${Math.round(session.distance_km * 10) / 10} km`
      : null;
  const min =
    session.duration_min != null ? `${Math.round(session.duration_min)} min` : null;
  const pace = session.pace_target ? `@ ${session.pace_target}` : null;
  const hrZone =
    session.target_hr_zone != null ? `HR zone ${session.target_hr_zone}` : null;

  const metaParts = [km, min, pace, hrZone].filter(Boolean);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.typeRow}>
            <Text style={styles.typeText}>{session.session_type}</Text>
            <Text style={styles.dateText}>{session.scheduled_date ?? ""}</Text>
          </View>
          <Text style={styles.title}>{session.description}</Text>
          <View style={styles.metaRow}>
            {metaParts.map((m, i) => (
              <Text key={i} style={styles.metaText}>
                {i > 0 ? " · " : ""}
                {m}
              </Text>
            ))}
          </View>
          {session.key_focus && (
            <>
              <Text style={styles.focusLabel}>Key focus</Text>
              <Text style={styles.focusText}>{session.key_focus}</Text>
            </>
          )}
          {session.supportsCoachNote !== false && (
            <View style={styles.coachCard}>
              <Text style={styles.coachTitle}>Why this session for you</Text>
              {coachNoteLoading ? (
                <Text style={styles.coachText}>Generating personalized description…</Text>
              ) : coachNoteError ? (
                <>
                  <Text style={[styles.coachText, { color: theme.negative }]}>{coachNoteError}</Text>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => fetchCoachNote(true)}
                    style={{ marginTop: 6 }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        color: theme.accentBlue,
                        textDecorationLine: "underline",
                      }}
                    >
                      Try again
                    </Text>
                  </TouchableOpacity>
                </>
              ) : coachNote ? (
                <Text style={styles.coachText}>{coachNote}</Text>
              ) : (
                <Text style={styles.coachText}>—</Text>
              )}
            </View>
          )}
          <View style={styles.actionsRow}>
            {onAskKipcoachee && (
              <TouchableOpacity
                style={styles.buttonGhost}
                activeOpacity={0.85}
                onPress={() => onAskKipcoachee(session)}
              >
                <Text style={styles.buttonGhostText}>Ask Kipcoachee</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.buttonGhost}
              activeOpacity={0.85}
              onPress={onClose}
            >
              <Text style={styles.buttonGhostText}>Close</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.buttonPrimary}
              activeOpacity={0.85}
              onPress={() => {
                onToggleDone(session);
                onClose();
              }}
            >
              <Text style={styles.buttonPrimaryText}>
                {session.completed_at ? "Mark incomplete" : "Mark complete"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

