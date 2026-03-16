import { FC, useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";
import { WorkoutBadge } from "../WorkoutBadge";
import { TrainingPlanSession } from "../../hooks/useTrainingPlan";

type Props = {
  session: TrainingPlanSession;
  onToggleDone: (session: TrainingPlanSession) => void;
  onPress?: (session: TrainingPlanSession) => void;
  onAskKipcoachee?: (session: TrainingPlanSession) => void;
};

export const SessionCard: FC<Props> = ({ session, onToggleDone, onPress, onAskKipcoachee }) => {
  const { colors } = useTheme();
  const sessionType = String(session.session_type ?? "").toLowerCase();
  const borderColor = sessionType.includes("interval")
    ? "#ef4444"
    : sessionType.includes("tempo") || sessionType.includes("threshold")
    ? "#3b82f6"
    : sessionType.includes("easy") || sessionType.includes("recovery")
    ? "#22c55e"
    : sessionType.includes("long")
    ? "#f97316"
    : colors.primary;
  const estimatedMin =
    session.duration_min != null && isFinite(session.duration_min)
      ? Math.round(session.duration_min)
      : session.distance_km != null && isFinite(session.distance_km)
      ? Math.round(session.distance_km * 6)
      : null;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: {
          flexDirection: "row",
          alignItems: "flex-start",
          padding: 12,
          borderRadius: 12,
          backgroundColor: colors.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          borderLeftWidth: 3,
          borderLeftColor: borderColor,
          marginBottom: 8,
        },
        checkbox: {
          width: 22,
          height: 22,
          borderRadius: 6,
          borderWidth: 2,
          borderColor: session.completed_at ? colors.primary : colors.mutedForeground,
          backgroundColor: session.completed_at ? colors.primary : "transparent",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 2,
          marginRight: 10,
        },
        checkboxInner: {
          width: 10,
          height: 10,
          borderRadius: 4,
          backgroundColor: colors.primaryForeground,
        },
        main: { flex: 1 },
        headerRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 2,
        },
        dateText: { fontSize: 11, color: colors.mutedForeground },
        title: {
          fontSize: 14,
          fontWeight: "500",
          color: colors.foreground,
          marginTop: 4,
        },
        titleRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
        intervalDot: { width: 7, height: 7, borderRadius: 999, backgroundColor: "#ef4444" },
        metaRow: {
          flexDirection: "row",
          flexWrap: "wrap",
          marginTop: 4,
        },
        meta: { fontSize: 11, color: colors.mutedForeground },
        dim: { opacity: session.completed_at ? 0.65 : 1 },
        askIconBtn: {
          width: 28,
          height: 28,
          borderRadius: 999,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.primary + "20",
        },
      }),
    [borderColor, colors, session.completed_at],
  );

  const handlePress = () => {
    onPress?.(session);
  };

  const km = session.distance_km != null ? `${Math.round(session.distance_km * 10) / 10} km` : null;
  const min = session.duration_min != null ? `${Math.round(session.duration_min)} min` : null;
  const pace = session.pace_target ? `@ ${session.pace_target}` : null;
  const est = estimatedMin != null ? `~${estimatedMin} min` : null;

  const dateLabel = session.scheduled_date ?? "";

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={[styles.root, styles.dim]}
      onPress={handlePress}
    >
      <TouchableOpacity
        activeOpacity={0.8}
        style={styles.checkbox}
        onPress={() => onToggleDone(session)}
      >
        {session.completed_at && <View style={styles.checkboxInner} />}
      </TouchableOpacity>
      <View style={styles.main}>
        <View style={styles.headerRow}>
          <WorkoutBadge type={session.session_type as any} />
          <Text style={styles.dateText}>{dateLabel}</Text>
        </View>
        <View style={styles.titleRow}>
          {sessionType.includes("interval") && <View style={styles.intervalDot} />}
          <Text style={styles.title} numberOfLines={2}>
            {session.description}
          </Text>
        </View>
        <View style={styles.metaRow}>
          {[km, min, est, pace].filter(Boolean).map((m, i) => (
            <Text key={i} style={styles.meta}>
              {i > 0 ? " · " : ""}
              {m}
            </Text>
          ))}
        </View>
        {onAskKipcoachee && (
          <View style={{ marginTop: 8, flexDirection: "row", justifyContent: "flex-end" }}>
            <TouchableOpacity style={styles.askIconBtn} onPress={() => onAskKipcoachee(session)} activeOpacity={0.85}>
              <Ionicons name="chatbubble-ellipses" size={14} color={colors.primary} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

