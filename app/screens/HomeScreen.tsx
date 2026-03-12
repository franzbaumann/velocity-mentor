import { FC, useMemo, useRef, useState } from "react";
import { Animated, Easing, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { ScreenContainer } from "../components/ScreenContainer";
import { GlassCard } from "../components/GlassCard";
import { ReadinessRing } from "../components/ReadinessRing";
import { WorkoutBadge } from "../components/WorkoutBadge";
import { Sparkline } from "../components/Sparkline";
import { useTheme } from "../context/ThemeContext";
import { useGreeting } from "../hooks/useGreeting";
import { useDashboardData } from "../hooks/useDashboardData";
import { getLocalDateString } from "../lib/date";
import { formatDuration, formatSleepHours } from "../lib/format";
import { spacing, typography } from "../theme/theme";
import { calculateZonePaces, findBestEffort, formatRaceTime, predictRaceTime } from "../lib/race-prediction";

export const HomeScreen: FC = () => {
  const { themeName, theme, colors } = useTheme();
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
    activities,
    isRefetching,
    refetch,
  } = dashboard;

  const todayStr = getLocalDateString();
  const todaysActual = activities?.filter((a) => a.date === todayStr)?.[0] ?? null;
  const todaysPlan = weekPlan?.find((d) => d.isToday) ?? null;

  const flipAnim = useRef(new Animated.Value(0)).current;
  const [isFlipped, setIsFlipped] = useState(false);

  const frontRotation = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });
  const backRotation = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["180deg", "360deg"],
  });

  const flipCard = () => {
    Animated.timing(flipAnim, {
      toValue: isFlipped ? 0 : 1,
      duration: 400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setIsFlipped((prev) => !prev);
    });
  };

  const isDarkPro = themeName === "darkPro";

  const styles = useMemo(
    () =>
      StyleSheet.create({
        content: { gap: spacing.gap },
        // Dark Pro specific layout
        topRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        },
        readyCol: {
          alignItems: "center",
        },
        topMetricsRow: {
          flex: 1,
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          justifyContent: "flex-end",
        },
        topMetricChip: {
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 999,
          backgroundColor: theme.cardBorder,
        },
        topMetricText: {
          fontSize: 11,
          color: theme.textSecondary,
        },
        topMetricHighlight: {
          color: theme.accentGreen,
        },
        widgetRow: {
          marginTop: 16,
          flexDirection: "row",
          gap: 12,
        },
        widgetCard: {
          flex: 1,
          backgroundColor: theme.cardBackground,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: theme.cardBorder,
          padding: 12,
        },
        widgetHeader: {
          fontSize: 10,
          letterSpacing: 1.5,
          textTransform: "uppercase",
          color: theme.textMuted,
          marginBottom: 8,
        },
        widgetTitleRow: {
          flexDirection: "row",
          alignItems: "baseline",
          marginBottom: 4,
        },
        widgetMainValue: {
          fontSize: 18,
          fontWeight: "600",
          color: theme.textPrimary,
        },
        widgetSubValue: {
          fontSize: 12,
          color: theme.textMuted,
        },
        widgetLink: {
          marginTop: 8,
          fontSize: 11,
          color: theme.accentBlue,
        },
        header: { gap: 4 },
        title: { fontSize: 22, fontWeight: "600", color: theme.textPrimary },
        subtitle: { fontSize: 13, color: theme.textSecondary },
        sectionHeader: { color: theme.textLabel, letterSpacing: 1.5 },
        readinessCard: { padding: 24 },
        readinessRow: { flexDirection: "row", alignItems: "center", gap: 24 },
        readinessBody: { flex: 1, minWidth: 0 },
        readinessTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
        readinessTitle: { fontSize: 16, fontWeight: "600", color: theme.textPrimary },
        readinessSummary: { fontSize: 13, color: theme.textSecondary, lineHeight: 20 },
        readinessMeta: { flexDirection: "row", gap: 16, marginTop: 12 },
        metaText: { fontSize: 11, color: theme.textMuted },
        flipContainer: {
          position: "relative",
        },
        flipCard: {
          backfaceVisibility: "hidden",
        },
        flipCardBack: {
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          backfaceVisibility: "hidden",
        },
        activityCard: { padding: 20 },
        activityTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
        activityLabel: { fontSize: 12, fontWeight: "600", color: theme.textLabel, textTransform: "uppercase", letterSpacing: 0.5 },
        activityName: { fontSize: 16, fontWeight: "600", color: theme.textPrimary },
        activityMeta: { fontSize: 13, color: theme.textSecondary, marginTop: 4 },
        activityMetrics: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 12 },
        activityMetric: { flexDirection: "row", alignItems: "baseline", gap: 4 },
        weekRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
        weekKm: { fontSize: 14, fontWeight: "500", color: theme.textPrimary },
        weekPct: { fontSize: 12, color: theme.textMuted },
        progressTrack: { height: 8, borderRadius: 999, backgroundColor: theme.cardBorder, overflow: "hidden", marginBottom: 16 },
        progressFill: { height: "100%", borderRadius: 999, backgroundColor: theme.accentBlue },
        qualityRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
        dotsRow: { flexDirection: "row", gap: 6 },
        dot: { width: 10, height: 10, borderRadius: 999 },
        dotDone: { backgroundColor: theme.accentBlue },
        dotPlanned: { backgroundColor: theme.cardBorder },
        sparklineBlock: { marginTop: 12 },
        sparklineLabel: { fontSize: 11, color: theme.textMuted, marginBottom: 4 },
        lastActivityHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 },
        lastActivityType: { fontSize: 14, fontWeight: "500", color: theme.textPrimary },
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
        hrZoneLabel: { fontSize: 10, color: theme.textMuted },
        raceHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
        raceIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: theme.chartFill, alignItems: "center", justifyContent: "center" },
        raceEmoji: { fontSize: 14 },
        raceTitle: { fontSize: 14, fontWeight: "500", color: theme.textPrimary },
        raceSubtitle: { fontSize: 12, color: theme.textSecondary },
        raceTime: { fontSize: 28, fontWeight: "700", color: theme.textPrimary, marginBottom: 8 },
        racePaces: { gap: 2 },
        raceFootnote: { fontSize: 10, color: theme.textMuted, marginTop: 12 },
        daysRow: { gap: 12, paddingBottom: 8 },
        dayCard: {
          width: 140,
          padding: 16,
          borderRadius: 16,
          backgroundColor: theme.appBackground,
          borderWidth: StyleSheet.hairlineWidth || theme.cardBorderWidth,
          borderColor: theme.cardBorder,
        },
        dayCardToday: { borderColor: theme.accentBlue + "80", borderWidth: 2 },
        dayCardHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
        dayCardLabel: { fontSize: 11, fontWeight: "500", color: theme.textMuted },
        dayCardLabelToday: { color: theme.accentBlue },
        dayCardDate: { fontSize: 10, color: theme.textMuted },
        dayCardTitle: { fontSize: 14, fontWeight: "500", color: theme.textPrimary, marginTop: 8 },
        dayCardDistance: { fontSize: 12, color: theme.textMuted, marginTop: 4 },
        dayCardDetail: { fontSize: 11, color: theme.textMuted, marginTop: 4 },
      }),
    [colors, theme]
  );

  const goalRaceType = athlete.goalRace?.type ?? "Half Marathon";

  const goalRaceKm = (() => {
    const t = String(goalRaceType || "").toLowerCase();
    if (t.includes("marathon") && !t.includes("half")) return 42.195;
    if (t.includes("half")) return 21.0975;
    if (t.includes("10")) return 10;
    if (t.includes("5")) return 5;
    return 21.0975;
  })();

  const goalRaceLabel = (() => {
    const t = String(goalRaceType || "").toLowerCase();
    if (t.includes("marathon") && !t.includes("half")) return "Marathon";
    if (t.includes("half")) return "Half Marathon";
    if (t.includes("10")) return "10K";
    if (t.includes("5")) return "5K";
    return "Half Marathon";
  })();

  const racePrediction = useMemo(() => {
    if (!activities || !readiness?.ctl) return null;
    const best = findBestEffort(
      activities.map((a) => ({
        distance_km: a.distance_km,
        duration_seconds: a.duration_seconds,
        date: a.date,
      })),
    );
    if (!best) return null;
    const ctl = readiness.ctl;
    const baselineCTL = Math.max(ctl * 0.7, 20);
    const predictedSeconds = predictRaceTime(
      best.timeSeconds,
      best.distanceKm,
      goalRaceKm,
      ctl,
      baselineCTL,
    );
    const paces = calculateZonePaces(predictedSeconds, goalRaceKm);
    return {
      time: formatRaceTime(predictedSeconds),
      zone2: paces.zone2,
      threshold: paces.threshold,
      vo2max: paces.vo2max,
      ctl,
    };
  }, [activities, readiness, goalRaceKm]);

  if (!readiness || !weekStats) {
    return (
      <ScreenContainer contentContainerStyle={styles.content}>
        <Text style={styles.title}>Loading…</Text>
      </ScreenContainer>
    );
  }

  const progressPct = Math.round((weekStats.actualKm / weekStats.plannedKm) * 100);
  const lastActivityDetailId =
    (lastActivity as unknown as { detailId?: string | null }).detailId ?? null;

  const goToLastActivity = () => {
    if (!lastActivityDetailId) return;
    navigation.navigate(
      "ActivitiesStack" as never,
      { screen: "ActivityDetail", params: { id: lastActivityDetailId } } as never,
    );
  };

  // Dark Pro layout – intervals.icu style
  if (isDarkPro) {
    const tsb = readiness.tsb ?? 0;
    const statusLabel =
      tsb > 5 ? "READY" : tsb >= 0 ? "NEUTRAL" : "FATIGUED";
    const statusColor =
      tsb > 5 ? theme.positive : tsb >= 0 ? theme.warning : theme.negative;

    return (
      <ScreenContainer
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={!!isRefetching}
            onRefresh={() => refetch()}
            tintColor={theme.accentBlue}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{greeting}</Text>
          <Text style={styles.subtitle}>
            Week 6 of 14 · {athlete.currentPhase} Phase · {athlete.goalRace.type} in{" "}
            {athlete.goalRace.weeksRemaining} weeks
          </Text>
        </View>

        {/* Readiness card */}
        <TouchableOpacity activeOpacity={0.9} onPress={flipCard}>
          <View style={styles.flipContainer}>
            <Animated.View style={[styles.flipCard, { transform: [{ rotateY: frontRotation }] }]}>
              <GlassCard style={styles.readinessCard}>
                <View style={styles.readinessRow}>
                  <ReadinessRing
                    score={readiness.score}
                    size={96}
                    statusLabel={statusLabel}
                    statusColor={statusColor}
                  />
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
            </Animated.View>
          </View>
        </TouchableOpacity>

        {/* SECTION 2 – Three-column widget row */}
        <View style={styles.widgetRow}>
          {/* THIS WEEK */}
          <View style={styles.widgetCard}>
            <Text style={styles.widgetHeader}>This Week</Text>
            <View style={styles.widgetTitleRow}>
              <Text style={styles.widgetMainValue}>
                {weekStats.actualKm} / {weekStats.plannedKm} km
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
            </View>
            <Text style={styles.metaText}>Quality sessions</Text>
            <Text style={styles.metaText}>
              {weekStats.qualityDone} of {weekStats.qualityPlanned} done
            </Text>
            <View style={styles.dotsRow}>
              {Array.from({ length: weekStats.qualityPlanned }).map((_, i) => (
                <View
                  key={i}
                  style={[styles.dot, i < weekStats.qualityDone ? styles.dotDone : styles.dotPlanned]}
                />
              ))}
            </View>
            <View style={styles.sparklineBlock}>
              <Text style={styles.sparklineLabel}>Load trend</Text>
              <Sparkline data={weekStats.tssData} />
            </View>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => navigation.navigate("ActivitiesStack" as never)}
            >
              <Text style={styles.widgetLink}>View activities ›</Text>
            </TouchableOpacity>
          </View>

          {/* LAST ACTIVITY */}
          <TouchableOpacity
            style={styles.widgetCard}
            activeOpacity={lastActivityDetailId ? 0.9 : 1}
            onPress={lastActivityDetailId ? goToLastActivity : undefined}
          >
            <Text style={styles.widgetHeader}>Last Activity</Text>
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
                <View
                  style={[
                    styles.hrZone,
                    { width: `${lastActivity.hrZones.z1}%`, backgroundColor: theme.textMuted },
                  ]}
                />
                <View
                  style={[
                    styles.hrZone,
                    { width: `${lastActivity.hrZones.z2}%`, backgroundColor: theme.accentBlue },
                  ]}
                />
                <View
                  style={[
                    styles.hrZone,
                    { width: `${lastActivity.hrZones.z3}%`, backgroundColor: theme.accentGreen },
                  ]}
                />
                <View
                  style={[
                    styles.hrZone,
                    { width: `${lastActivity.hrZones.z4}%`, backgroundColor: theme.accentOrange },
                  ]}
                />
                <View
                  style={[
                    styles.hrZone,
                    { width: `${lastActivity.hrZones.z5}%`, backgroundColor: theme.accentRed },
                  ]}
                />
              </View>
              <View style={styles.hrZonesLabels}>
                <Text style={styles.hrZoneLabel}>Z1</Text>
                <Text style={styles.hrZoneLabel}>Z2</Text>
                <Text style={styles.hrZoneLabel}>Z3</Text>
                <Text style={styles.hrZoneLabel}>Z4</Text>
                <Text style={styles.hrZoneLabel}>Z5</Text>
              </View>
            </View>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={lastActivityDetailId ? goToLastActivity : undefined}
              disabled={!lastActivityDetailId}
            >
              <Text style={styles.widgetLink}>View activity ›</Text>
            </TouchableOpacity>
          </TouchableOpacity>

          {/* RECOVERY */}
          <View style={styles.widgetCard}>
            <Text style={styles.widgetHeader}>Recovery</Text>
            <View style={styles.recoveryRow}>
              <View>
                <Text style={styles.metricLabel}>HRV</Text>
                <View style={styles.recoveryValueRow}>
                  <Text style={[styles.recoveryValue, typography.mono]}>{recoveryMetrics.hrv}</Text>
                  <Text style={styles.metaText}>/ {recoveryMetrics.hrv7dayAvg} avg</Text>
                </View>
              </View>
            </View>
            <View style={styles.sparklineBlock}>
              <Text style={styles.sparklineLabel}>HRV (7 days)</Text>
              <Sparkline data={recoveryMetrics.hrvTrend} color={theme.chartLineTSB} />
            </View>
            <View style={styles.sparklineBlock}>
              <Text style={styles.sparklineLabel}>Resting HR (7 days)</Text>
              <Sparkline data={recoveryMetrics.restingHrTrend} color={theme.negative} />
            </View>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => navigation.navigate("Stats" as never)}
            >
              <Text style={styles.widgetLink}>View stats ›</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* SECTION 4 – Today’s activity (existing card) */}
        <GlassCard style={styles.activityCard}>
          <View style={styles.activityTitleRow}>
            <Text style={styles.activityLabel}>Today's Activity</Text>
            {todaysActual && <View style={[styles.dot, styles.dotDone]} />}
          </View>
          {todaysActual ? (
            <>
              <View style={styles.readinessTitleRow}>
                <Text style={styles.activityName} numberOfLines={1}>
                  {todaysActual.name ?? todaysActual.type ?? "Run"}
                </Text>
                <WorkoutBadge
                  type={
                    (todaysActual.type?.toLowerCase().includes("interval")
                      ? "interval"
                      : todaysActual.type?.toLowerCase().includes("tempo")
                      ? "tempo"
                      : todaysActual.type?.toLowerCase().includes("long")
                      ? "long"
                      : todaysActual.type?.toLowerCase().includes("recovery")
                      ? "recovery"
                      : "easy") as "easy" | "tempo" | "interval" | "long" | "recovery"
                  }
                />
              </View>
              <Text style={styles.activityMeta}>
                {(todaysActual.distance_km ?? 0).toFixed(1)} km · {formatDuration(todaysActual.duration_seconds)}
                {todaysActual.avg_pace ? ` @ ${todaysActual.avg_pace}` : ""}
              </Text>
            </>
          ) : todaysPlan ? (
            <>
              <View style={styles.readinessTitleRow}>
                <WorkoutBadge type={todaysPlan.type} />
                <Text style={styles.metaText}>{todaysPlan.day}</Text>
              </View>
              <Text style={styles.activityName}>{todaysPlan.title}</Text>
              <Text style={styles.activityMeta}>
                {todaysPlan.distance > 0 ? `${todaysPlan.distance} km` : ""}
                {todaysPlan.detail
                  ? todaysPlan.distance > 0
                    ? ` · ${todaysPlan.detail}`
                    : todaysPlan.detail
                  : ""}
              </Text>
            </>
          ) : (
            <Text style={styles.activityMeta}>No activity planned or logged for today.</Text>
          )}
        </GlassCard>

        {/* Keep existing lower sections (race prediction, CTA, next 7 days) */}
        {racePrediction && (
          <GlassCard>
            <View style={styles.raceHeader}>
              <View style={styles.raceIcon}>
                <Text style={styles.raceEmoji}>🏁</Text>
              </View>
              <View>
                <Text style={styles.raceTitle}>Race Prediction</Text>
                <Text style={styles.raceSubtitle}>{goalRaceLabel}</Text>
              </View>
            </View>
            <Text style={[styles.raceTime, typography.mono]}>{racePrediction.time}</Text>
            <View style={styles.racePaces}>
              <Text style={styles.metaText}>Z2 pace: {racePrediction.zone2}</Text>
              <Text style={styles.metaText}>Threshold: {racePrediction.threshold}</Text>
              <Text style={styles.metaText}>VO2max: {racePrediction.vo2max}</Text>
            </View>
            <Text style={styles.raceFootnote}>
              Based on best effort · CTL {Math.round(racePrediction.ctl)}
            </Text>
          </GlassCard>
        )}

        <GlassCard>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => navigation.navigate("Coach" as never)}
            style={{ alignItems: "center", justifyContent: "center", paddingVertical: 20, gap: 8 }}
          >
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 999,
                backgroundColor: theme.chartFill,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 22 }}>💬</Text>
            </View>
            <Text style={{ fontSize: 16, fontWeight: "600", color: theme.textPrimary }}>Ask Kipcoachee</Text>
            <Text
              style={{
                fontSize: 12,
                color: theme.textSecondary,
                textAlign: "center",
                paddingHorizontal: 16,
              }}
            >
              Get training advice, adjust your plan, or chat about your goals.
            </Text>
          </TouchableOpacity>
        </GlassCard>

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
  }

  // Default (light) layout – existing structure
  return (
    <ScreenContainer
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={!!isRefetching} onRefresh={() => refetch()} tintColor={theme.accentBlue} />
      }
    >
      {/* Page header – matches web */}
      <View style={styles.header}>
        <Text style={styles.title}>{greeting}</Text>
        <Text style={styles.subtitle}>
          Week 6 of 14 · {athlete.currentPhase} Phase · {athlete.goalRace.type} in {athlete.goalRace.weeksRemaining} weeks
        </Text>
      </View>

      {/* Readiness Card */}
      <TouchableOpacity activeOpacity={0.9} onPress={flipCard}>
        <View style={styles.flipContainer}>
          <Animated.View style={[styles.flipCard, { transform: [{ rotateY: frontRotation }] }]}>
            <GlassCard style={styles.readinessCard}>
              <View style={styles.readinessRow}>
                <ReadinessRing
                  score={readiness.score}
                  size={96}
                  statusLabel={
                    readiness.tsb != null
                      ? Number(readiness.tsb) > 5
                        ? "READY"
                        : Number(readiness.tsb) <= -10
                        ? "FATIGUED"
                        : "NEUTRAL"
                      : undefined
                  }
                  statusColor={
                    readiness.tsb != null
                      ? Number(readiness.tsb) > 5
                        ? theme.positive
                        : Number(readiness.tsb) <= -10
                        ? theme.negative
                        : theme.warning
                      : undefined
                  }
                />
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
          </Animated.View>
        </View>
      </TouchableOpacity>

      {/* Today's Activity – planned or completed */}
      <GlassCard style={styles.activityCard}>
        <View style={styles.activityTitleRow}>
          <Text style={styles.activityLabel}>Today's Activity</Text>
          {todaysActual && (
            <View style={[styles.dot, styles.dotDone]} />
          )}
        </View>
        {todaysActual ? (
          <>
            <View style={styles.readinessTitleRow}>
              <Text style={styles.activityName} numberOfLines={1}>{todaysActual.name ?? todaysActual.type ?? "Run"}</Text>
              <WorkoutBadge
                type={
                  (todaysActual.type?.toLowerCase().includes("interval")
                    ? "interval"
                    : todaysActual.type?.toLowerCase().includes("tempo")
                    ? "tempo"
                    : todaysActual.type?.toLowerCase().includes("long")
                    ? "long"
                    : todaysActual.type?.toLowerCase().includes("recovery")
                    ? "recovery"
                    : "easy") as "easy" | "tempo" | "interval" | "long" | "recovery"
                }
              />
            </View>
            <Text style={styles.activityMeta}>
              {(todaysActual.distance_km ?? 0).toFixed(1)} km · {formatDuration(todaysActual.duration_seconds)}
              {todaysActual.avg_pace ? ` @ ${todaysActual.avg_pace}` : ""}
            </Text>
            <View style={styles.activityMetrics}>
              <View style={styles.activityMetric}>
                <Text style={[styles.metricValue, typography.mono]}>{(todaysActual.distance_km ?? 0).toFixed(1)}</Text>
                <Text style={styles.metricLabel}>km</Text>
              </View>
              <View style={styles.activityMetric}>
                <Text style={[styles.metricValue, typography.mono]}>{formatDuration(todaysActual.duration_seconds)}</Text>
                <Text style={styles.metricLabel}>duration</Text>
              </View>
              {todaysActual.avg_pace != null && (
                <View style={styles.activityMetric}>
                  <Text style={[styles.metricValue, typography.mono]}>{todaysActual.avg_pace}</Text>
                  <Text style={styles.metricLabel}>pace</Text>
                </View>
              )}
            </View>
          </>
        ) : todaysPlan ? (
          <>
            <View style={styles.readinessTitleRow}>
              <WorkoutBadge type={todaysPlan.type} />
              <Text style={styles.metaText}>{todaysPlan.day}</Text>
            </View>
            <Text style={styles.activityName}>{todaysPlan.title}</Text>
            <Text style={styles.activityMeta}>
              {todaysPlan.distance > 0 ? `${todaysPlan.distance} km` : ""}
              {todaysPlan.detail ? (todaysPlan.distance > 0 ? ` · ${todaysPlan.detail}` : todaysPlan.detail) : ""}
            </Text>
          </>
        ) : (
          <Text style={styles.activityMeta}>No activity planned or logged for today.</Text>
        )}
      </GlassCard>

      {/* This Week – matches web card (light theme) */}
      <GlassCard>
        <Text style={[styles.sectionHeader, typography.sectionHeader]}>This Week</Text>
        <View style={styles.weekRow}>
          <Text style={styles.weekKm}>
            {weekStats.actualKm} / {weekStats.plannedKm} km
          </Text>
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
        <TouchableOpacity
          activeOpacity={lastActivityDetailId ? 0.9 : 1}
          onPress={lastActivityDetailId ? goToLastActivity : undefined}
        >
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
              <View style={[styles.hrZone, { width: `${lastActivity.hrZones.z1}%`, backgroundColor: theme.textMuted }]} />
              <View style={[styles.hrZone, { width: `${lastActivity.hrZones.z2}%`, backgroundColor: theme.accentBlue }]} />
              <View style={[styles.hrZone, { width: `${lastActivity.hrZones.z3}%`, backgroundColor: theme.accentGreen }]} />
              <View style={[styles.hrZone, { width: `${lastActivity.hrZones.z4}%`, backgroundColor: theme.accentOrange }]} />
              <View style={[styles.hrZone, { width: `${lastActivity.hrZones.z5}%`, backgroundColor: theme.accentRed }]} />
            </View>
            <View style={styles.hrZonesLabels}>
              <Text style={styles.hrZoneLabel}>Z1</Text>
              <Text style={styles.hrZoneLabel}>Z2</Text>
              <Text style={styles.hrZoneLabel}>Z3</Text>
              <Text style={styles.hrZoneLabel}>Z4</Text>
              <Text style={styles.hrZoneLabel}>Z5</Text>
            </View>
          </View>
        </TouchableOpacity>
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
        </View>
        <View style={styles.sparklineBlock}>
          <Text style={styles.sparklineLabel}>HRV (7 days)</Text>
          <Sparkline data={recoveryMetrics.hrvTrend} color={theme.chartLineTSB} />
        </View>
        <View style={styles.sparklineBlock}>
          <Text style={styles.sparklineLabel}>Resting HR (7 days)</Text>
          <Sparkline data={recoveryMetrics.restingHrTrend} color={theme.negative} />
        </View>
      </GlassCard>

      {/* Race Prediction – same layout as web */}
      {racePrediction && (
        <GlassCard>
          <View style={styles.raceHeader}>
            <View style={styles.raceIcon}>
              <Text style={styles.raceEmoji}>🏁</Text>
            </View>
            <View>
              <Text style={styles.raceTitle}>Race Prediction</Text>
              <Text style={styles.raceSubtitle}>{goalRaceLabel}</Text>
            </View>
          </View>
          <Text style={[styles.raceTime, typography.mono]}>{racePrediction.time}</Text>
          <View style={styles.racePaces}>
            <Text style={styles.metaText}>Z2 pace: {racePrediction.zone2}</Text>
            <Text style={styles.metaText}>Threshold: {racePrediction.threshold}</Text>
            <Text style={styles.metaText}>VO2max: {racePrediction.vo2max}</Text>
          </View>
          <Text style={styles.raceFootnote}>
            Based on best effort · CTL {Math.round(racePrediction.ctl)}
          </Text>
        </GlassCard>
      )}

      {/* Ask Kipcoachee – CTA mirroring web dashboard */}
      <GlassCard>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => navigation.navigate("Coach" as never)}
          style={{ alignItems: "center", justifyContent: "center", paddingVertical: 20, gap: 8 }}
        >
          <View style={{ width: 48, height: 48, borderRadius: 999, backgroundColor: theme.chartFill, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 22 }}>💬</Text>
          </View>
          <Text style={{ fontSize: 16, fontWeight: "600", color: theme.textPrimary }}>Ask Kipcoachee</Text>
          <Text
            style={{
              fontSize: 12,
              color: theme.textSecondary,
              textAlign: "center",
              paddingHorizontal: 16,
            }}
          >
            Get training advice, adjust your plan, or chat about your goals.
          </Text>
        </TouchableOpacity>
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
