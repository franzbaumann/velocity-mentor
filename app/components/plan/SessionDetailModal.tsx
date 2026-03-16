import { FC, useEffect, useMemo, useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../../context/ThemeContext";
import { TrainingPlanSession } from "../../hooks/useTrainingPlan";
import { typography } from "../../theme/theme";
import { supabase, callEdgeFunctionWithRetry } from "../../shared/supabase";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { format, isToday, isTomorrow } from "date-fns";

type Props = {
  visible: boolean;
  session: TrainingPlanSession | null;
  onClose: () => void;
  onToggleDone: (session: TrainingPlanSession) => void;
  onAskKipcoachee?: (session: TrainingPlanSession) => void;
  isMarkingDone?: boolean;
  isNutritionLoading?: boolean;
};

type WorkoutKind =
  | "easy"
  | "tempo"
  | "interval"
  | "long"
  | "recovery"
  | "rest"
  | "race"
  | "other";

function inferWorkoutKind(session: TrainingPlanSession): WorkoutKind {
  const text = `${session.session_type ?? ""} ${session.description ?? ""} ${
    session.key_focus ?? ""
  }`
    .toLowerCase()
    .trim();

  if (text.includes("rest")) return "rest";
  if (text.includes("race") || text.includes("time trial") || text.includes("tt"))
    return "race";
  if (text.includes("recovery")) return "recovery";
  if (text.includes("long")) return "long";
  if (text.includes("tempo") || text.includes("threshold")) return "tempo";
  if (
    text.includes("interval") ||
    text.includes("repeat") ||
    text.includes("fartlek") ||
    /\d+\s*[x×]\s*\d+/.test(text)
  ) {
    return "interval";
  }
  if (text.includes("easy")) return "easy";
  return "other";
}

export const SessionDetailModal: FC<Props> = ({
  visible,
  session,
  onClose,
  onToggleDone,
  onAskKipcoachee,
  isMarkingDone = false,
  isNutritionLoading = false,
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
          maxHeight: "82%",
          borderRadius: 18,
          backgroundColor: theme.cardBackground,
          padding: 16,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.cardBorder,
        },
        scrollArea: {
          flexGrow: 0,
        },
        scrollContent: {
          paddingBottom: 12,
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
        focusWhyLabel: {
          fontSize: 12,
          fontWeight: "500",
          color: theme.textMuted,
          marginTop: 10,
        },
        focusWhyText: {
          fontSize: 12,
          color: theme.textMuted,
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
        intervalCard: {
          marginTop: 12,
        },
        intervalHeader: {
          paddingHorizontal: 10,
          paddingVertical: 6,
          backgroundColor: theme.surfaceElevated,
        },
        intervalHeaderText: {
          fontSize: 11,
          fontWeight: "600",
          color: theme.textMuted,
          letterSpacing: 0.5,
        },
        intervalRow: {
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 12,
          paddingVertical: 10,
        },
        intervalRowAlt: {},
        intervalRowWarmup: {
          backgroundColor: "#F0FFF4",
          borderLeftWidth: 3,
          borderLeftColor: "#22C55E",
          borderRadius: 12,
          marginHorizontal: 16,
          marginBottom: 12,
        },
        intervalRowRecovery: {
          backgroundColor: "#FFF7ED",
          borderLeftWidth: 3,
          borderLeftColor: "#F97316",
          borderRadius: 12,
          marginHorizontal: 16,
          marginBottom: 12,
        },
        intervalRowRep: {
          backgroundColor: "#F0F4FF",
          borderLeftWidth: 3,
          borderLeftColor: "#3B82F6",
          borderRadius: 12,
          marginHorizontal: 16,
          marginBottom: 12,
        },
        intervalRowCooldown: {
          backgroundColor: "#F9FAFB",
          borderLeftWidth: 3,
          borderLeftColor: "#9CA3AF",
          borderRadius: 12,
          marginHorizontal: 16,
          marginBottom: 12,
        },
        intervalCellLabel: {
          fontSize: 12,
          fontWeight: "600",
          color: theme.textMuted,
          marginRight: 8,
        },
        intervalCellValue: {
          flex: 1,
          fontSize: 14,
          color: "#6B7280",
        },
        zonesCard: {
          marginTop: 12,
          borderRadius: 12,
          padding: 10,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.cardBorder,
        },
        zonesTitle: {
          fontSize: 11,
          fontWeight: "600",
          color: theme.textMuted,
          marginBottom: 6,
        },
        zoneRow: {
          marginBottom: 8,
        },
        zoneLabelRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 4,
        },
        zoneLabel: {
          fontSize: 12,
          fontWeight: "500",
          color: theme.textPrimary,
        },
        zoneValue: {
          fontSize: 12,
          color: theme.textMuted,
        },
        zoneBarTrack: {
          height: 8,
          borderRadius: 999,
          backgroundColor: theme.cardBorder + "60",
          overflow: "hidden",
          flexDirection: "row",
        },
        zoneBarSegment: {
          flex: 1,
          height: "100%",
          backgroundColor: "transparent",
        },
        zoneBarSegmentActive: {
          backgroundColor: theme.accentBlue,
        },
        tipsCard: {
          marginTop: 12,
          borderRadius: 12,
          padding: 10,
          backgroundColor: "#fef9c3",
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: "#facc15",
        },
        tipsTitle: {
          fontSize: 12,
          fontWeight: "600",
          color: "#854d0e",
          marginBottom: 4,
        },
        tipItem: {
          fontSize: 12,
          color: "#854d0e",
          marginTop: 2,
        },
        timingRow: {
          marginTop: 10,
        },
        timingText: {
          fontSize: 12,
          color: theme.textMuted,
        },
        similarCard: {
          marginTop: 10,
          borderRadius: 10,
          padding: 8,
          backgroundColor: theme.surfaceElevated,
        },
        similarText: {
          fontSize: 12,
          color: theme.textMuted,
        },
        sectionContainer: {
          marginTop: 12,
        },
        sectionHeaderRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 4,
        },
        sectionHeaderTitle: {
          fontSize: 11,
          fontWeight: "600",
          color: "#6B7280",
          letterSpacing: 1,
          textTransform: "uppercase",
        },
        sectionHeaderChevron: {
          fontSize: 16,
          color: theme.textMuted,
        },
        breakdownHeaderRow: {
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 6,
          paddingHorizontal: 16,
        },
        breakdownLabel: {
          fontSize: 11,
          fontWeight: "600",
          color: "#6B7280",
          letterSpacing: 1,
          textTransform: "uppercase",
          marginRight: 8,
        },
        breakdownDivider: {
          flex: 1,
          height: StyleSheet.hairlineWidth,
          backgroundColor: "#E5E7EB",
        },
        breakdownRegenerate: {
          marginTop: 16,
          textAlign: "center",
          fontSize: 13,
          color: "#9CA3AF",
        },
        actionsRow: {
          flexDirection: "row",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 10,
          marginTop: 10,
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

  const COACH_NOTE_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

  useEffect(() => {
    if (!session) return;
    setCoachNote(session.coach_note ?? null);
    setCoachNoteError(null);
    // DB first (session.coach_note). Only fetch if both DB and cache might be empty.
    if (session.supportsCoachNote !== false && !session.coach_note) {
      void fetchCoachNote(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  const fetchCoachNote = async (regenerate: boolean) => {
    if (!session) return;
    const cacheKey = `coach_note_session_${session.id}`;
    setCoachNoteLoading(true);
    setCoachNoteError(null);
    try {
      if (regenerate) {
        await AsyncStorage.removeItem(cacheKey).catch(() => {});
      } else {
        const raw = await AsyncStorage.getItem(cacheKey);
        if (raw) {
          try {
            const cached = JSON.parse(raw) as { note: string; timestamp: number };
            if (
              cached?.note &&
              cached?.timestamp &&
              Date.now() - cached.timestamp < COACH_NOTE_CACHE_TTL
            ) {
              setCoachNote(cached.note);
              setCoachNoteLoading(false);
              return;
            }
          } catch {
            // ignore parse errors
          }
        }
      }

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
        await AsyncStorage.setItem(
          cacheKey,
          JSON.stringify({ note, timestamp: Date.now() }),
        ).catch(() => {});
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

  const [openStructure, setOpenStructure] = useState(true);
  const [openEffort, setOpenEffort] = useState(true);
  const [openZones, setOpenZones] = useState(true);
  const [openTips, setOpenTips] = useState(true);
  const [openDescription, setOpenDescription] = useState(true);

  useEffect(() => {
    setOpenStructure(true);
    setOpenEffort(true);
    setOpenZones(true);
    setOpenTips(true);
    setOpenDescription(true);
  }, [session?.id]);

  if (!session) return null;

  const workoutKind = inferWorkoutKind(session);

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

  const isInterval = workoutKind === "interval";

  const parsedInterval = (() => {
    if (!isInterval) return null;
    const text = session.description ?? "";
    const m = text.match(/(\d+)\s*[x×]\s*(\d+)(m|km)/i);
    if (!m) return null;
    const reps = Number(m[1]);
    const distance = `${m[2]}${m[3].toLowerCase()}`;
    return { reps: Number.isFinite(reps) && reps > 0 ? reps : 4, distance };
  })();

  const focusLabel = (() => {
    const key = (session.key_focus ?? "").toLowerCase();
    if (key.includes("speed") || key.includes("interval"))
      return { icon: "⚡", label: "Speed", why: "Neuromuscular power & running economy." };
    if (key.includes("tempo") || key.includes("threshold"))
      return {
        icon: "🔥",
        label: "Tempo / Threshold",
        why: "Improves lactate clearance and sustainable race-pace effort.",
      };
    if (key.includes("easy") || key.includes("recovery"))
      return {
        icon: "💤",
        label: "Recovery",
        why: "Supports adaptation while keeping fatigue and injury risk low.",
      };
    return null;
  })();

  const hrZoneRange = (() => {
    if (session.target_hr_zone == null) return null;
    const maxHr = 190;
    const zones = [
      [0.5, 0.6],
      [0.6, 0.7],
      [0.7, 0.8],
      [0.8, 0.9],
      [0.9, 0.95],
    ] as const;
    const idx = Math.min(Math.max(session.target_hr_zone - 1, 0), zones.length - 1);
    const [lo, hi] = zones[idx];
    const loBpm = Math.round(maxHr * lo);
    const hiBpm = Math.round(maxHr * hi);
    return `${loBpm}-${hiBpm} bpm`;
  })();

  const paceRange = (() => {
    if (!session.pace_target) return null;
    const m = session.pace_target.match(/(\d+):(\d+)/);
    if (!m) return session.pace_target;
    const baseSec = Number(m[1]) * 60 + Number(m[2]);
    if (!Number.isFinite(baseSec) || baseSec <= 0) return session.pace_target;
    const fmt = (sec: number) => {
      const s = Math.max(1, Math.round(sec));
      const mm = Math.floor(s / 60);
      const ss = s % 60;
      return `${mm}:${String(ss).padStart(2, "0")}/km`;
    };
    const lo = baseSec - 10;
    const hi = baseSec + 10;
    return `${fmt(lo)} — ${fmt(hi)}`;
  })();

  const scheduledDateLabel = (() => {
    if (!session.scheduled_date) return null;
    try {
      const d = new Date(session.scheduled_date);
      return format(d, "EEEE MMM d");
    } catch {
      return session.scheduled_date;
    }
  })();

  const timingSuggestion = (() => {
    if (!session.scheduled_date) return null;
    try {
      const d = new Date(session.scheduled_date);
      if (isToday(d) || isTomorrow(d)) {
        if (isInterval) return "Morning (best for intervals)";
        return "Any time you can run relaxed";
      }
      return null;
    } catch {
      return null;
    }
  })();

  const similarSummary = (() => {
    if (!session.completed_at) return null;
    try {
      const d = new Date(session.completed_at);
      const label = format(d, "MMM d");
      return `Last time you logged this: ${label} · Completed ✓`;
    } catch {
      return `Last time you logged this: ${session.completed_at} · Completed ✓`;
    }
  })();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
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

            {/* 1. STRUCTURE */}
            <View style={styles.sectionContainer}>
              <View style={styles.breakdownHeaderRow}>
                <Text style={styles.breakdownLabel}>Session breakdown</Text>
                <View style={styles.breakdownDivider} />
              </View>
              <TouchableOpacity
                activeOpacity={0.8}
                style={[styles.sectionHeaderRow, { paddingHorizontal: 16 }]}
                onPress={() => setOpenStructure((v) => !v)}
              >
                <Text style={styles.sectionHeaderTitle}>Structure</Text>
                <Text style={styles.sectionHeaderChevron}>{openStructure ? "⌃" : "⌄"}</Text>
              </TouchableOpacity>
              {openStructure && (
                <>
                  {isInterval && parsedInterval && (
                    <View style={styles.intervalCard}>
                      <View style={[styles.intervalRow, styles.intervalRowRep]}>
                        <Text style={styles.intervalCellLabel}>
                          MAIN SET — {parsedInterval.reps} × {parsedInterval.distance}
                        </Text>
                        <Text style={styles.intervalCellValue}>
                          {session.pace_target ? `${session.pace_target} · HR zone ${session.target_hr_zone ?? 4}` : `HR zone ${session.target_hr_zone ?? 4}`}
                        </Text>
                      </View>
                      {[
                        { label: "Warmup", value: "10–15 min easy", kind: "warmup" },
                        ...Array.from({ length: parsedInterval.reps }).flatMap((_, i) => [
                          {
                            label: `Rep ${i + 1}`,
                            value: `${parsedInterval.distance} @ ${
                              session.pace_target ?? "target pace"
                            }`,
                            kind: "rep",
                          },
                          {
                            label: "Recovery",
                            value: "2–3 min jog",
                            kind: "rec",
                          },
                        ]),
                        { label: "Cooldown", value: "10 min easy", kind: "cooldown" },
                      ].map((row, idx) => {
                        const baseStyle = [
                          styles.intervalRow,
                          row.kind === "warmup" && styles.intervalRowWarmup,
                          row.kind === "cooldown" && styles.intervalRowCooldown,
                          row.kind === "rep" && styles.intervalRowRep,
                          row.kind === "rec" && styles.intervalRowRecovery,
                        ];
                        return (
                          <View key={`${row.label}-${idx}`} style={baseStyle}>
                            <Text style={styles.intervalCellLabel}>{row.label}</Text>
                            <Text style={styles.intervalCellValue}>{row.value}</Text>
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {!isInterval && workoutKind === "easy" && (
                    <View style={styles.intervalCard}>
                      <View style={[styles.intervalRow, styles.intervalRowWarmup]}>
                        <Text style={styles.intervalCellLabel}>WARM-UP</Text>
                        <Text style={styles.intervalCellValue}>5 min walk/jog</Text>
                      </View>
                      <View style={[styles.intervalRow, styles.intervalRowRep]}>
                        <Text style={styles.intervalCellLabel}>MAIN RUN</Text>
                        <Text style={styles.intervalCellValue}>
                          {session.distance_km
                            ? `${Math.round(session.distance_km * 10) / 10} km @ conversational pace`
                            : "Easy conversational pace"}
                        </Text>
                      </View>
                      <View style={[styles.intervalRow, styles.intervalRowCooldown]}>
                        <Text style={styles.intervalCellLabel}>COOL-DOWN</Text>
                        <Text style={styles.intervalCellValue}>5 min walk</Text>
                      </View>
                    </View>
                  )}

                  {!isInterval && workoutKind === "tempo" && (
                    <View style={styles.intervalCard}>
                      <View style={[styles.intervalRow, styles.intervalRowWarmup]}>
                        <Text style={styles.intervalCellLabel}>WARM-UP</Text>
                        <Text style={styles.intervalCellValue}>15 min easy</Text>
                      </View>
                      <View style={[styles.intervalRow, styles.intervalRowRep]}>
                        <Text style={styles.intervalCellLabel}>TEMPO BLOCK</Text>
                        <Text style={styles.intervalCellValue}>
                          {session.distance_km
                            ? `${Math.round(session.distance_km * 10) / 10} km @ goal pace`
                            : "20–40 min @ goal pace"}
                        </Text>
                      </View>
                      <View style={[styles.intervalRow, styles.intervalRowCooldown]}>
                        <Text style={styles.intervalCellLabel}>COOL-DOWN</Text>
                        <Text style={styles.intervalCellValue}>10 min easy</Text>
                      </View>
                    </View>
                  )}

                  {!isInterval && workoutKind === "long" && (
                    <View style={styles.intervalCard}>
                      <View style={[styles.intervalRow, styles.intervalRowWarmup]}>
                        <Text style={styles.intervalCellLabel}>FIRST HALF</Text>
                        <Text style={styles.intervalCellValue}>Easy conversational pace</Text>
                      </View>
                      <View style={[styles.intervalRow, styles.intervalRowRep]}>
                        <Text style={styles.intervalCellLabel}>MIDDLE</Text>
                        <Text style={styles.intervalCellValue}>
                          Steady, slight increase in effort
                        </Text>
                      </View>
                      <View style={[styles.intervalRow, styles.intervalRowCooldown]}>
                        <Text style={styles.intervalCellLabel}>LAST 20%</Text>
                        <Text style={styles.intervalCellValue}>
                          Optional goal pace finish if feeling strong
                        </Text>
                      </View>
                    </View>
                  )}

                  {!isInterval && workoutKind === "recovery" && (
                    <View style={styles.intervalCard}>
                      <View style={[styles.intervalRow, styles.intervalRowWarmup]}>
                        <Text style={styles.intervalCellLabel}>ENTIRE RUN</Text>
                        <Text style={styles.intervalCellValue}>
                          Very easy jog or walk/run as needed
                        </Text>
                      </View>
                    </View>
                  )}

                  {workoutKind === "rest" && (
                    <View style={styles.intervalCard}>
                      <View style={[styles.intervalRow, styles.intervalRowCooldown]}>
                        <Text style={styles.intervalCellValue}>
                          💤 Fitness is built during recovery, not during runs.
                        </Text>
                      </View>
                      <View style={[styles.intervalRow, styles.intervalRowWarmup]}>
                        <Text style={styles.intervalCellValue}>
                          🧘 Light stretching 10–15 min
                        </Text>
                      </View>
                      <View style={[styles.intervalRow, styles.intervalRowWarmup]}>
                        <Text style={styles.intervalCellValue}>
                          🚶 Easy walk 20–30 min
                        </Text>
                      </View>
                      <View style={[styles.intervalRow, styles.intervalRowWarmup]}>
                        <Text style={styles.intervalCellValue}>
                          🏊 Very easy swim or cycle if you enjoy it
                        </Text>
                      </View>
                      <View style={[styles.intervalRow, styles.intervalRowRecovery]}>
                        <Text style={styles.intervalCellValue}>
                          Lay out kit, fuel and shoes so you can start tomorrow&apos;s session
                          calmly.
                        </Text>
                      </View>
                    </View>
                  )}

                  {workoutKind === "race" && (
                    <View style={styles.intervalCard}>
                      <View style={styles.intervalHeader}>
                        <Text style={styles.intervalHeaderText}>RACE STRATEGY</Text>
                      </View>
                      <View style={styles.intervalRow}>
                        <Text style={styles.intervalCellLabel}>📍 First km</Text>
                        <Text style={styles.intervalCellValue}>
                          10–15 sec slower than goal pace — relax and settle.
                        </Text>
                      </View>
                      <View style={[styles.intervalRow, styles.intervalRowAlt]}>
                        <Text style={styles.intervalCellLabel}>📍 Middle</Text>
                        <Text style={styles.intervalCellValue}>
                          Lock into goal pace and stay smooth.
                        </Text>
                      </View>
                      <View style={styles.intervalRow}>
                        <Text style={styles.intervalCellLabel}>📍 Last 20%</Text>
                        <Text style={styles.intervalCellValue}>
                          Empty the tank — use whatever is left.
                        </Text>
                      </View>
                      <View style={styles.intervalHeader}>
                        <Text style={styles.intervalHeaderText}>WARMUP PROTOCOL</Text>
                      </View>
                      <View style={styles.intervalRow}>
                        <Text style={styles.intervalCellValue}>
                          15–20 min easy jog + 4–6 × 20 sec strides at race pace.
                        </Text>
                      </View>
                    </View>
                  )}
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => fetchCoachNote(true)}
                  >
                    <Text style={styles.breakdownRegenerate}>↻ Regenerate breakdown</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            {/* 2. HOW TO KNOW YOU'RE AT THE RIGHT EFFORT */}
            <View style={styles.sectionContainer}>
              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.sectionHeaderRow}
                onPress={() => setOpenEffort((v) => !v)}
              >
                <Text style={styles.sectionHeaderTitle}>How to know you&apos;re at the right effort</Text>
                <Text style={styles.sectionHeaderChevron}>{openEffort ? "⌃" : "⌄"}</Text>
              </TouchableOpacity>
              {openEffort && (
                <>
                  {session.key_focus && (
                    <>
                      <Text style={styles.focusLabel}>
                        {focusLabel ? `${focusLabel.icon} ${focusLabel.label}` : "Key focus"}
                      </Text>
                      <Text style={styles.focusText}>{session.key_focus}</Text>
                      {focusLabel && (
                        <>
                          <Text style={styles.focusWhyLabel}>Why this matters</Text>
                          <Text style={styles.focusWhyText}>{focusLabel.why}</Text>
                        </>
                      )}
                    </>
                  )}
                  {workoutKind === "easy" && (
                    <>
                      <Text style={styles.tipItem}>✅ You can hold a full conversation</Text>
                      <Text style={styles.tipItem}>✅ Breathing feels comfortable</Text>
                      <Text style={styles.tipItem}>
                        ✅ You feel like you could run much longer if needed
                      </Text>
                      <Text style={styles.tipItem}>
                        ❌ If you can&apos;t talk, you&apos;re too fast — slow down
                      </Text>
                    </>
                  )}
                  {workoutKind === "tempo" && (
                    <>
                      <Text style={styles.tipItem}>
                        ✅ Comfortably hard — you can speak 3–4 words at a time
                      </Text>
                      <Text style={styles.tipItem}>
                        ✅ Breathing is controlled but clearly labored
                      </Text>
                      <Text style={styles.tipItem}>✅ Sustainable for 20–40 min</Text>
                      <Text style={styles.tipItem}>
                        ❌ If you can&apos;t speak at all, it&apos;s too fast
                      </Text>
                    </>
                  )}
                  {isInterval && (
                    <>
                      <Text style={styles.tipItem}>
                        ✅ Hard effort — you can only say 1–2 words on the reps
                      </Text>
                      <Text style={styles.tipItem}>
                        ✅ Last rep should feel very hard but still controlled
                      </Text>
                      <Text style={styles.tipItem}>
                        ❌ Stop if pace drops more than ~15 sec/km from target
                      </Text>
                    </>
                  )}
                  {workoutKind === "long" && (
                    <>
                      <Text style={styles.tipItem}>
                        ✅ First half should feel easy and relaxed
                      </Text>
                      <Text style={styles.tipItem}>
                        ✅ You finish tired but not destroyed
                      </Text>
                      <Text style={styles.tipItem}>
                        ❌ If legs feel smashed for days after, you went too fast
                      </Text>
                    </>
                  )}
                  {workoutKind === "recovery" && (
                    <>
                      <Text style={styles.tipItem}>
                        ✅ Pace feels almost embarrassingly slow — that&apos;s correct
                      </Text>
                      <Text style={styles.tipItem}>
                        ✅ Full conversation, no noticeable breathing effort
                      </Text>
                      <Text style={styles.tipItem}>
                        ❌ If HR drifts above Z2, slow down or walk
                      </Text>
                    </>
                  )}
                  {workoutKind === "rest" && (
                    <>
                      <Text style={styles.tipItem}>
                        ✅ You feel more refreshed by the end of the day
                      </Text>
                      <Text style={styles.tipItem}>
                        ❌ If you feel more tired after &quot;cross training&quot;, you did too much
                      </Text>
                    </>
                  )}
                </>
              )}
            </View>

            {/* 3. TARGET ZONES */}
            {(session.target_hr_zone != null || paceRange) && (
              <View style={styles.sectionContainer}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={styles.sectionHeaderRow}
                  onPress={() => setOpenZones((v) => !v)}
                >
                  <Text style={styles.sectionHeaderTitle}>Target zones</Text>
                  <Text style={styles.sectionHeaderChevron}>{openZones ? "⌃" : "⌄"}</Text>
                </TouchableOpacity>
                {openZones && (
                  <View style={styles.zonesCard}>
                    <Text style={styles.zonesTitle}>TARGET ZONES</Text>

                    {session.target_hr_zone != null && (
                      <View style={styles.zoneRow}>
                        <View style={styles.zoneLabelRow}>
                          <Text style={styles.zoneLabel}>HR zone target</Text>
                          <Text style={styles.zoneValue}>
                            Zone {session.target_hr_zone}
                            {hrZoneRange ? ` · ${hrZoneRange}` : ""}
                          </Text>
                        </View>
                        <View style={styles.zoneBarTrack}>
                          {Array.from({ length: 5 }).map((_, i) => (
                            // eslint-disable-next-line react/no-array-index-key
                            <View
                              key={i}
                              style={[
                                styles.zoneBarSegment,
                                i + 1 === session.target_hr_zone && styles.zoneBarSegmentActive,
                              ]}
                            />
                          ))}
                        </View>
                      </View>
                    )}

                    {paceRange && (
                      <View style={styles.zoneRow}>
                        <View style={styles.zoneLabelRow}>
                          <Text style={styles.zoneLabel}>Pace target</Text>
                          <Text style={styles.zoneValue}>{paceRange}</Text>
                        </View>
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}

            {/* 4. TIPS */}
            <View style={styles.sectionContainer}>
              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.sectionHeaderRow}
                onPress={() => setOpenTips((v) => !v)}
              >
                <Text style={styles.sectionHeaderTitle}>Tips</Text>
                <Text style={styles.sectionHeaderChevron}>{openTips ? "⌃" : "⌄"}</Text>
              </TouchableOpacity>
              {openTips && (
                <View style={styles.tipsCard}>
                  <Text style={styles.tipsTitle}>TIPS FOR THIS SESSION</Text>
                  {workoutKind === "easy" && (
                    <>
                      <Text style={styles.tipItem}>
                        💡 Easier than you think — most runners go too fast on easy days.
                      </Text>
                      <Text style={styles.tipItem}>
                        💡 These runs quietly build your aerobic base.
                      </Text>
                      <Text style={styles.tipItem}>
                        💡 If HR creeps up, walk until it drops back down.
                      </Text>
                    </>
                  )}
                  {workoutKind === "tempo" && (
                    <>
                      <Text style={styles.tipItem}>
                        💡 Start slightly slower than goal pace and grow into it.
                      </Text>
                      <Text style={styles.tipItem}>
                        💡 The last 5 min should feel challenging but controlled.
                      </Text>
                      <Text style={styles.tipItem}>
                        💡 Run by feel first; use pace and HR only to confirm.
                      </Text>
                    </>
                  )}
                  {isInterval && (
                    <>
                      <Text style={styles.tipItem}>
                        💡 Start conservatively on the first rep — speed up only if you&apos;re
                        feeling good.
                      </Text>
                      <Text style={styles.tipItem}>
                        💡 Full recovery between reps is key for quality; don&apos;t rush the easy
                        jog.
                      </Text>
                      <Text style={styles.tipItem}>
                        💡 If pace drifts more than ~15 sec/km slower than target, cut the last rep
                        short.
                      </Text>
                    </>
                  )}
                  {workoutKind === "long" && (
                    <>
                      <Text style={styles.tipItem}>
                        💡 Take fuel every 45–60 min (gels, drink mix, or real food).
                      </Text>
                      <Text style={styles.tipItem}>
                        💡 Hydrate before, during and after — small sips often.
                      </Text>
                      <Text style={styles.tipItem}>
                        💡 Slow down on hills, don&apos;t force the pace.
                      </Text>
                    </>
                  )}
                  {workoutKind === "recovery" && (
                    <>
                      <Text style={styles.tipItem}>
                        💡 Purpose is to flush the legs, not to gain fitness.
                      </Text>
                      <Text style={styles.tipItem}>💡 Walking is fine — and encouraged.</Text>
                      <Text style={styles.tipItem}>
                        💡 Shorter is usually better — 20–30 min is enough.
                      </Text>
                    </>
                  )}
                  {workoutKind === "rest" && (
                    <>
                      <Text style={styles.tipItem}>
                        💡 Treat rest days as part of the plan, not a missed workout.
                      </Text>
                      <Text style={styles.tipItem}>
                        💡 Sleep is your best performance enhancer — aim for an extra 30–60 min.
                      </Text>
                    </>
                  )}
                </View>
              )}
            </View>

            {(scheduledDateLabel || timingSuggestion) && (
              <View style={styles.timingRow}>
                {scheduledDateLabel && (
                  <Text style={styles.timingText}>📅 Scheduled: {scheduledDateLabel}</Text>
                )}
                {timingSuggestion && (
                  <Text style={styles.timingText}>⏰ Suggested time: {timingSuggestion}</Text>
                )}
              </View>
            )}

            {similarSummary && (
              <View style={styles.similarCard}>
                <Text style={styles.similarText}>{similarSummary}</Text>
              </View>
            )}

            {/* 6. DESCRIPTION / COACH EXPLANATION */}
            {session.supportsCoachNote !== false && (
              <View style={styles.sectionContainer}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={styles.sectionHeaderRow}
                  onPress={() => setOpenDescription((v) => !v)}
                >
                  <Text style={styles.sectionHeaderTitle}>Why this session for you</Text>
                  <Text style={styles.sectionHeaderChevron}>{openDescription ? "⌃" : "⌄"}</Text>
                </TouchableOpacity>
                {openDescription && (
                  <View style={styles.coachCard}>
                    <Text style={styles.coachTitle}>Why this session for you</Text>
                    {coachNoteLoading ? (
                      <Text style={styles.coachText}>
                        Generating personalized description…
                      </Text>
                    ) : coachNoteError ? (
                      <>
                        <Text style={[styles.coachText, { color: theme.negative }]}>
                          {coachNoteError}
                        </Text>
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
                      <>
                        <Text style={styles.coachText}>{coachNote}</Text>
                        <TouchableOpacity
                          style={{ marginTop: 6 }}
                          onPress={() => fetchCoachNote(true)}
                          activeOpacity={0.7}
                          disabled={coachNoteLoading}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              color: theme.textSecondary ?? "#6b7280",
                            }}
                          >
                            {coachNoteLoading ? "Generating…" : "↻ Regenerate"}
                          </Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <Text style={styles.coachText}>—</Text>
                    )}
                  </View>
                )}
              </View>
            )}
          </ScrollView>

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
              style={[styles.buttonPrimary, (isMarkingDone || isNutritionLoading) && { opacity: 0.7 }]}
              activeOpacity={0.85}
              disabled={isMarkingDone || isNutritionLoading}
              onPress={() => {
                onToggleDone(session);
                onClose();
              }}
            >
              <Text style={styles.buttonPrimaryText}>
                {isMarkingDone
                  ? "Saving…"
                  : isNutritionLoading
                    ? "✓ Complete · Getting nutrition advice..."
                    : session.completed_at
                      ? "Mark incomplete"
                      : "Mark complete"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

