import { FC, useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../../context/ThemeContext";
import { TrainingPlanSession } from "../../hooks/useTrainingPlan";
import { getWorkoutTypeBaseColor, getWorkoutTypeTintGradientColors } from "../../lib/workoutTypeTint";

type Props = {
  session: TrainingPlanSession;
  onToggleDone: (session: TrainingPlanSession) => void;
  onPress?: (session: TrainingPlanSession) => void;
  onAskKipcoachee?: (session: TrainingPlanSession) => void;
  isDragHandle?: boolean;
};

export const SessionCard: FC<Props> = ({
  session,
  onToggleDone,
  onPress,
  onAskKipcoachee,
  isDragHandle = false,
}) => {
  const { colors } = useTheme();
  const completed = !!session.completed_at;
  const sessionType = String(session.session_type ?? "").toLowerCase();
  const borderColor = getWorkoutTypeBaseColor(session.session_type, colors);
  const tintGradientColors = getWorkoutTypeTintGradientColors(session.session_type, colors);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: {
          flexDirection: "row",
          alignItems: "flex-start",
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderRadius: 14,
          backgroundColor: colors.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          marginBottom: 8,
          overflow: "hidden",
          position: "relative",
        },
        checkbox: {
          width: 22,
          height: 22,
          borderRadius: 999,
          borderWidth: 2,
          borderColor: completed ? colors.primary : colors.mutedForeground,
          backgroundColor: completed ? colors.primary : "transparent",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 6,
          marginRight: 12,
        },
        checkboxInner: {
          width: 10,
          height: 10,
          borderRadius: 999,
          backgroundColor: colors.primaryForeground,
        },
        main: { flex: 1 },
        headerRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        },
        dateText: {
          fontSize: 11,
          color: colors.mutedForeground,
        },
        title: {
          fontSize: 15,
          fontWeight: "600",
          color: completed ? colors.mutedForeground : colors.foreground,
          marginTop: 6,
          textDecorationLine: completed ? "line-through" : "none",
        },
        titleRow: {
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          marginTop: 6,
        },
        intervalDot: { width: 7, height: 7, borderRadius: 999, backgroundColor: "#ef4444" },
        metaRow: {
          flexDirection: "row",
          flexWrap: "wrap",
          marginTop: 4,
        },
        meta: { fontSize: 11, color: colors.mutedForeground },
        dim: { opacity: completed ? 0.65 : 1 },
        badgeRow: {
          flexDirection: "row",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 6,
        },
        difficultyPill: {
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 999,
          backgroundColor: "#dcfce7",
        },
        difficultyText: {
          fontSize: 11,
          fontWeight: "600",
          textTransform: "capitalize",
          color: "#16a34a",
        },
        dragHandle: {
          paddingHorizontal: 6,
          paddingVertical: 6,
          justifyContent: "center",
          alignItems: "center",
        },
        dragDot: {
          width: 3,
          height: 3,
          borderRadius: 999,
          backgroundColor: colors.mutedForeground,
        },
        askRow: {
          marginTop: 10,
          flexDirection: "row",
          alignItems: "center",
          gap: 18,
        },
        linkTextPrimary: {
          fontSize: 11,
          fontWeight: "500",
          color: colors.primary,
        },
      }),
    [borderColor, colors, session.completed_at],
  );

  const handlePress = () => {
    onPress?.(session);
  };

  const isRest = sessionType.includes("rest") || sessionType.includes("off");
  const km = !isRest && session.distance_km != null && session.distance_km > 0 ? `${Math.round(session.distance_km * 10) / 10} km` : null;
  const min = !isRest && session.duration_min != null && session.duration_min > 0 ? `${Math.round(session.duration_min)} min` : null;
  const pace = !isRest && session.pace_target ? `@ ${session.pace_target}` : null;

  const dateLabel = session.scheduled_date ?? "";
  const difficultyLabel =
    session.session_type && typeof session.session_type === "string"
      ? session.session_type.toLowerCase()
      : "";

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={[styles.root, styles.dim]}
      onPress={handlePress}
    >
      <LinearGradient
        colors={tintGradientColors}
        locations={[0, 0.35, 0.7]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFillObject}
      />
      <TouchableOpacity
        activeOpacity={0.8}
        style={styles.checkbox}
        onPress={() => onToggleDone(session)}
      >
        {session.completed_at && <View style={styles.checkboxInner} />}
      </TouchableOpacity>
      <View style={styles.main}>
        <View style={styles.headerRow}>
          <View style={styles.badgeRow}>
            {!!difficultyLabel && !isRest && (
              <View style={styles.difficultyPill}>
                <Text style={styles.difficultyText}>{difficultyLabel}</Text>
              </View>
            )}
            {!!dateLabel && <Text style={styles.dateText}>{dateLabel}</Text>}
          </View>
          {isDragHandle && (
            <View style={styles.dragHandle}>
              <View style={{ flexDirection: "row", gap: 3 }}>
                <View style={{ gap: 3 }}>
                  <View style={styles.dragDot} />
                  <View style={styles.dragDot} />
                  <View style={styles.dragDot} />
                </View>
                <View style={{ gap: 3 }}>
                  <View style={styles.dragDot} />
                  <View style={styles.dragDot} />
                  <View style={styles.dragDot} />
                </View>
              </View>
            </View>
          )}
        </View>
        <View style={styles.titleRow}>
          {sessionType.includes("interval") && <View style={styles.intervalDot} />}
          <Text style={styles.title} numberOfLines={2}>
            {session.description}
          </Text>
        </View>
        <View style={styles.metaRow}>
          {isRest ? (
            <Text style={styles.meta}>Rest and recovery</Text>
          ) : (
            [km, min, pace].filter(Boolean).map((m, i) => (
              <Text key={i} style={styles.meta}>
                {i > 0 ? " · " : ""}
                {m}
              </Text>
            ))
          )}
        </View>
        <View style={styles.askRow}>
          {onAskKipcoachee && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => onAskKipcoachee(session)}
              style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
            >
              <Ionicons name="chatbubble-outline" size={13} color={colors.primary} />
              <Text style={styles.linkTextPrimary}>Ask Coach Cade</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};
