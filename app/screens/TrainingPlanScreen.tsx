import { FC, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ScreenContainer } from "../components/ScreenContainer";
import { GlassCard } from "../components/GlassCard";
import { WorkoutBadge } from "../components/WorkoutBadge";
import { useTheme } from "../context/ThemeContext";
import { typography } from "../theme/theme";

const MOCK_SESSIONS = [
  { id: "1", date: "Mon 16 Feb", type: "easy" as const, description: "Easy Run", distance: 10, duration: 50, pace: "5:10–5:30/km" },
  { id: "2", date: "Wed 18 Feb", type: "interval" as const, description: "VO2max Intervals 5×1000m", distance: 13, duration: 45, pace: "3:45/km" },
  { id: "3", date: "Fri 20 Feb", type: "tempo" as const, description: "Tempo 8km @ threshold", distance: 14, duration: 35, pace: "4:10/km" },
  { id: "4", date: "Sat 21 Feb", type: "long" as const, description: "Long Run progressive", distance: 28, duration: 140, pace: "5:20→4:40/km" },
];

export const TrainingPlanScreen: FC = () => {
  const { colors } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        content: { gap: 16 },
        title: { fontSize: 22, fontWeight: "600", color: colors.foreground },
        sectionHeader: {},
        sessionCard: {
          padding: 12,
          borderRadius: 12,
          backgroundColor: colors.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          marginBottom: 8,
        },
        sessionLeft: { flex: 1 },
        sessionRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
        sessionDate: { fontSize: 12, color: colors.mutedForeground },
        sessionDesc: { fontSize: 14, fontWeight: "500", color: colors.foreground },
        sessionMeta: { fontSize: 12, color: colors.mutedForeground, marginTop: 4 },
        body: { fontSize: 14, color: colors.mutedForeground, lineHeight: 20 },
      }),
    [colors]
  );
  return (
    <ScreenContainer contentContainerStyle={styles.content}>
      <Text style={styles.title}>Training plan</Text>

      <GlassCard>
        <Text style={[styles.sectionHeader, typography.sectionHeader]}>This week</Text>
        {MOCK_SESSIONS.map((s) => (
          <View key={s.id} style={styles.sessionCard}>
            <View style={styles.sessionLeft}>
              <View style={styles.sessionRow}>
                <WorkoutBadge type={s.type} />
                <Text style={styles.sessionDate}>{s.date}</Text>
              </View>
              <Text style={styles.sessionDesc}>{s.description}</Text>
              <Text style={styles.sessionMeta}>
                {s.distance} km · {s.duration} min{s.pace ? ` · @ ${s.pace}` : ""}
              </Text>
            </View>
          </View>
        ))}
      </GlassCard>

      <GlassCard>
        <Text style={[styles.sectionHeader, typography.sectionHeader]}>Calendar</Text>
        <Text style={styles.body}>
          Week-by-week calendar view and move session will appear here, matching the web Training Plan.
        </Text>
      </GlassCard>
    </ScreenContainer>
  );
};
