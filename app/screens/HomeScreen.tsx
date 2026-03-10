import { FC } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { ScreenContainer } from "../components/ScreenContainer";
import { GlassCard } from "../components/GlassCard";
import { ReadinessRing } from "../components/ReadinessRing";
import { WorkoutBadge } from "../components/WorkoutBadge";
import { Sparkline } from "../components/Sparkline";
import { useGreeting } from "../hooks/useGreeting";
import { useDashboardData } from "../hooks/useDashboardData";
import { formatSleepHours } from "../lib/format";
import { colors, spacing, typography } from "../theme/theme";

export const HomeScreen: FC = () => {
  const greeting = useGreeting();
  const navigation = useNavigation();
  const dashboard = useDashboardData();
  const {
    athlete,
    readiness,
    todaysWorkout,
    weekStats,
    lastActivity,
    recoveryMetrics,
    weekPlan,
    isRefetching,
    refetch,
  } = dashboard;

  if (!readiness || !weekStats) {
    return (
      <ScreenContainer contentContainerStyle={styles.content}>
        <Text style={styles.title}>Loading…</Text>
      </ScreenContainer>
    );
  }

  const progressPct = Math.round((weekStats.actualKm / weekStats.plannedKm) * 100);

  return (
    <ScreenContainer
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={!!isRefetching} onRefresh={() => refetch()} tintColor={colors.primary} />
      }
    >
      {/* Garmin banner – matches web (tap → Settings) */}
      <TouchableOpacity
        style={styles.garminBanner}
        onPress={() => navigation.navigate("Settings")}
        activeOpacity={0.8}
      >
        <Text style={styles.garminBannerText}>Import your Garmin data to unlock real stats</Text>
        <Text style={styles.garminBannerLink}>Settings</Text>
      </TouchableOpacity>

      {/* Page header – matches web */}
      <View style={styles.header}>
        <Text style={styles.title}>{greeting}</Text>
        <Text style={styles.subtitle}>
          Week 6 of 14 · {athlete.currentPhase} Phase · {athlete.goalRace.type} in {athlete.goalRace.weeksRemaining} weeks
        </Text>
      </View>

      {/* Readiness Card – same layout as web */}
      <GlassCard style={styles.readinessCard}>
        <View style={styles.readinessRow}>
          <ReadinessRing score={readiness.score} size={96} />
          <View style={styles.readinessBody}>
            <View style={styles.readinessTitleRow}>
              <Text style={styles.readinessTitle}>Today's Readiness</Text>
              <WorkoutBadge type={todaysWorkout.type} />
            </View>
            <Text style={styles.readinessSummary}>{readiness.aiSummary}</Text>
            <View style={styles.readinessMeta}>
              <Text style={styles.metaText}>HRV {readiness.hrv}ms</Text>
              <Text style={styles.metaText}>{formatSleepHours(readiness.sleepHours)} sleep</Text>
              <Text style={[styles.metaText, typography.mono]}>
                TSB {readiness.tsb != null ? Number(readiness.tsb).toFixed(1) : "—"}
              </Text>
            </View>
          </View>
        </View>
      </GlassCard>

      {/* This Week – matches web card */}
      <GlassCard>
        <Text style={[styles.sectionHeader, typography.sectionHeader]}>This Week</Text>
        <View style={styles.weekRow}>
          <Text style={styles.weekKm}>
            {weekStats.actualKm} / {weekStats.plannedKm} km
          </Text>
          <Text style={[styles.weekPct, typography.mono]}>{progressPct}%</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
        </View>
        <View style={styles.qualityRow}>
          <Text style={styles.metaText}>Quality sessions</Text>
          <View style={styles.dotsRow}>
            {Array.from({ length: weekStats.qualityPlanned }).map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i < weekStats.qualityDone ? styles.dotDone : styles.dotPlanned]}
              />
            ))}
          </View>
        </View>
        <View style={styles.sparklineBlock}>
          <Text style={styles.sparklineLabel}>Load trend</Text>
          <Sparkline data={weekStats.tssData} />
        </View>
      </GlassCard>

      {/* Last Activity – matches web */}
      <GlassCard>
        <Text style={[styles.sectionHeader, typography.sectionHeader]}>Last Activity</Text>
        <View style={styles.lastActivityHeader}>
          <Text style={styles.lastActivityType}>{lastActivity.type}</Text>
          <Text style={styles.metaText}>{lastActivity.date}</Text>
        </View>
        <View style={styles.metricsGrid}>
          <View style={styles.metricCell}>
            <Text style={styles.metricLabel}>Distance</Text>
            <Text style={[styles.metricValue, typography.mono]}>{lastActivity.distance}</Text>
          </View>
          <View style={styles.metricCell}>
            <Text style={styles.metricLabel}>Avg Pace</Text>
            <Text style={[styles.metricValue, typography.mono]}>{lastActivity.avgPace}</Text>
          </View>
          <View style={styles.metricCell}>
            <Text style={styles.metricLabel}>Avg HR</Text>
            <Text style={[styles.metricValue, typography.mono]}>{lastActivity.avgHr} bpm</Text>
          </View>
          <View style={styles.metricCell}>
            <Text style={styles.metricLabel}>Duration</Text>
            <Text style={[styles.metricValue, typography.mono]}>{lastActivity.duration}</Text>
          </View>
        </View>
        <View style={styles.hrZonesBlock}>
          <Text style={styles.sparklineLabel}>HR Zones</Text>
          <View style={styles.hrZonesBar}>
            <View style={[styles.hrZone, { width: `${lastActivity.hrZones.z1}%`, backgroundColor: colors.secondary }]} />
            <View style={[styles.hrZone, { width: `${lastActivity.hrZones.z2}%`, backgroundColor: "rgba(34,197,94,0.6)" }]} />
            <View style={[styles.hrZone, { width: `${lastActivity.hrZones.z3}%`, backgroundColor: "rgba(59,130,246,0.6)" }]} />
            <View style={[styles.hrZone, { width: `${lastActivity.hrZones.z4}%`, backgroundColor: "rgba(245,158,11,0.8)" }]} />
            <View style={[styles.hrZone, { width: `${lastActivity.hrZones.z5}%`, backgroundColor: "rgba(239,68,68,0.7)" }]} />
          </View>
          <View style={styles.hrZonesLabels}>
            <Text style={styles.hrZoneLabel}>Z1</Text>
            <Text style={styles.hrZoneLabel}>Z2</Text>
            <Text style={styles.hrZoneLabel}>Z3</Text>
            <Text style={styles.hrZoneLabel}>Z4</Text>
            <Text style={styles.hrZoneLabel}>Z5</Text>
          </View>
        </View>
      </GlassCard>

      {/* Recovery – matches web */}
      <GlassCard>
        <Text style={[styles.sectionHeader, typography.sectionHeader]}>Recovery</Text>
        <View style={styles.recoveryRow}>
          <View>
            <Text style={styles.metricLabel}>HRV</Text>
            <View style={styles.recoveryValueRow}>
              <Text style={[styles.recoveryValue, typography.mono]}>{recoveryMetrics.hrv}</Text>
              <Text style={styles.metaText}>/ {recoveryMetrics.hrv7dayAvg} avg</Text>
            </View>
          </View>
          <View>
            <Text style={styles.metricLabel}>Sleep</Text>
            <View style={styles.recoveryValueRow}>
              <Text style={[styles.recoveryValue, typography.mono]}>{formatSleepHours(recoveryMetrics.sleepHours)}</Text>
              <Text style={styles.metaText}>{recoveryMetrics.sleepQuality}/10</Text>
            </View>
          </View>
        </View>
        <View style={styles.sparklineBlock}>
          <Text style={styles.sparklineLabel}>HRV (7 days)</Text>
          <Sparkline data={recoveryMetrics.hrvTrend} color={colors.accent} />
        </View>
        <View style={styles.sparklineBlock}>
          <Text style={styles.sparklineLabel}>Resting HR (7 days)</Text>
          <Sparkline data={recoveryMetrics.restingHrTrend} color={colors.destructive} />
        </View>
      </GlassCard>

      {/* Race Prediction – same layout as web */}
      <GlassCard>
        <View style={styles.raceHeader}>
          <View style={styles.raceIcon}>
            <Text style={styles.raceEmoji}>🏁</Text>
          </View>
          <View>
            <Text style={styles.raceTitle}>Race Prediction</Text>
            <Text style={styles.raceSubtitle}>Half Marathon</Text>
          </View>
        </View>
        <Text style={[styles.raceTime, typography.mono]}>1:32:45</Text>
        <View style={styles.racePaces}>
          <Text style={styles.metaText}>Z2 pace: 5:20/km</Text>
          <Text style={styles.metaText}>Threshold: 4:25/km</Text>
          <Text style={styles.metaText}>VO2max: 4:00/km</Text>
        </View>
        <Text style={styles.raceFootnote}>Based on best effort · CTL {Math.round(readiness.ctl)}</Text>
      </GlassCard>

      {/* Next 7 Days – matches web */}
      <Text style={[styles.sectionHeader, typography.sectionHeader]}>Next 7 Days</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.daysRow}
      >
        {weekPlan.map((day) => (
          <View
            key={day.day}
            style={[styles.dayCard, day.isToday && styles.dayCardToday]}
          >
            <View style={styles.dayCardHeader}>
              <Text style={[styles.dayCardLabel, day.isToday && styles.dayCardLabelToday]}>
                {day.isToday ? "Today" : day.day}
              </Text>
              <Text style={styles.dayCardDate}>{day.date}</Text>
            </View>
            <WorkoutBadge type={day.type} />
            <Text style={styles.dayCardTitle}>{day.title}</Text>
            {day.distance > 0 && (
              <Text style={[styles.dayCardDistance, typography.mono]}>{day.distance} km</Text>
            )}
            <Text style={styles.dayCardDetail}>{day.detail}</Text>
          </View>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  content: { gap: spacing.gap },
  garminBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.2)",
    backgroundColor: "rgba(59,130,246,0.05)",
  },
  garminBannerText: { fontSize: 13, color: colors.mutedForeground, flex: 1 },
  garminBannerLink: { fontSize: 13, fontWeight: "600", color: colors.primary, marginLeft: 12 },
  header: { gap: 4 },
  title: { fontSize: 22, fontWeight: "600", color: colors.foreground },
  subtitle: { fontSize: 13, color: colors.mutedForeground },
  sectionHeader: {},
  readinessCard: { padding: 24 },
  readinessRow: { flexDirection: "row", alignItems: "center", gap: 24 },
  readinessBody: { flex: 1, minWidth: 0 },
  readinessTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  readinessTitle: { fontSize: 16, fontWeight: "600", color: colors.foreground },
  readinessSummary: { fontSize: 13, color: colors.mutedForeground, lineHeight: 20 },
  readinessMeta: { flexDirection: "row", gap: 16, marginTop: 12 },
  metaText: { fontSize: 11, color: colors.mutedForeground },
  weekRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  weekKm: { fontSize: 14, fontWeight: "500", color: colors.foreground },
  weekPct: { fontSize: 12, color: colors.mutedForeground },
  progressTrack: { height: 8, borderRadius: 999, backgroundColor: colors.muted, overflow: "hidden", marginBottom: 16 },
  progressFill: { height: "100%", borderRadius: 999, backgroundColor: colors.primary },
  qualityRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  dotsRow: { flexDirection: "row", gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 999 },
  dotDone: { backgroundColor: colors.primary },
  dotPlanned: { backgroundColor: colors.muted },
  sparklineBlock: { marginTop: 12 },
  sparklineLabel: { fontSize: 11, color: colors.mutedForeground, marginBottom: 4 },
  lastActivityHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 },
  lastActivityType: { fontSize: 14, fontWeight: "500", color: colors.foreground },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 12 },
  metricCell: { width: "50%", marginBottom: 12 },
  metricLabel: { fontSize: 11, color: colors.mutedForeground, marginBottom: 2 },
  metricValue: { fontSize: 14, fontWeight: "600", color: colors.foreground },
  recoveryRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  recoveryValueRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  recoveryValue: { fontSize: 18, fontWeight: "600", color: colors.foreground },
  hrZonesBlock: { marginTop: 8 },
  hrZonesBar: { flexDirection: "row", height: 12, borderRadius: 999, overflow: "hidden" },
  hrZone: { height: "100%" },
  hrZonesLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  hrZoneLabel: { fontSize: 10, color: colors.mutedForeground },
  raceHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  raceIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: "rgba(59,130,246,0.15)", alignItems: "center", justifyContent: "center" },
  raceEmoji: { fontSize: 14 },
  raceTitle: { fontSize: 14, fontWeight: "500", color: colors.foreground },
  raceSubtitle: { fontSize: 12, color: colors.mutedForeground },
  raceTime: { fontSize: 28, fontWeight: "700", color: colors.foreground, marginBottom: 8 },
  racePaces: { gap: 2 },
  raceFootnote: { fontSize: 10, color: colors.mutedForeground, marginTop: 12 },
  daysRow: { gap: 12, paddingBottom: 8 },
  dayCard: {
    width: 140,
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  dayCardToday: { borderColor: "rgba(59,130,246,0.5)", borderWidth: 2 },
  dayCardHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  dayCardLabel: { fontSize: 11, fontWeight: "500", color: colors.mutedForeground },
  dayCardLabelToday: { color: colors.primary },
  dayCardDate: { fontSize: 10, color: colors.mutedForeground },
  dayCardTitle: { fontSize: 14, fontWeight: "500", color: colors.foreground, marginTop: 8 },
  dayCardDistance: { fontSize: 12, color: colors.mutedForeground, marginTop: 4 },
  dayCardDetail: { fontSize: 11, color: colors.mutedForeground, marginTop: 4 },
});
