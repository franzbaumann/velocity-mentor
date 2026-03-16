import { FC, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { ScreenContainer } from "../components/ScreenContainer";
import { GlassCard } from "../components/GlassCard";
import { ReadinessRing } from "../components/ReadinessRing";
import { WorkoutBadge } from "../components/WorkoutBadge";
import { Sparkline } from "../components/Sparkline";
import { SkeletonCard, SkeletonLine } from "../components/Skeleton";
import { useTheme } from "../context/ThemeContext";
import { useDashboardData } from "../hooks/useDashboardData";
import { useIntervalsAutoSync } from "../hooks/useIntervalsAutoSync";
import { useRacePredictions } from "../hooks/useRacePredictions";
import { useDailyStreak } from "../hooks/useDailyStreak";
import { getLocalDateString } from "../lib/date";
import { formatDuration, formatSleepHours } from "../lib/format";
import { spacing, typography } from "../theme/theme";
import { formatRaceTime, formatPace } from "../lib/race-prediction";
import type { AppTabsParamList } from "../navigation/RootNavigator";
import { addDays as addDaysFns, isWithinInterval, parseISO, startOfWeek as startOfWeekFns } from "date-fns";

const RACE_DISTANCES: { km: number; label: string }[] = [
  { km: 5, label: "5K" },
  { km: 10, label: "10K" },
  { km: 21.0975, label: "Half Marathon" },
  { km: 42.195, label: "Marathon" },
];

const SCROLL_PADDING_BELOW_BUBBLE = 24;

function workoutAccent(type: string | undefined, theme: ReturnType<typeof useTheme>["theme"]) {
  const t = String(type ?? "").toLowerCase();
  if (t.includes("interval")) return theme.accentRed;
  if (t.includes("tempo") || t.includes("threshold")) return theme.accentBlue;
  if (t.includes("easy") || t.includes("recovery")) return theme.accentGreen;
  return theme.accentBlue;
}

function relativeMinsLabel(lastFetchedAt: number | null): string {
  if (!lastFetchedAt) return "Updated just now";
  const mins = Math.round((Date.now() - lastFetchedAt) / 60000);
  if (mins < 1) return "Updated just now";
  if (mins === 1) return "Updated 1 min ago";
  return `Updated ${mins} min ago`;
}

/** e.g. "12 Mar" from "2026-03-12" */
function formatReadinessDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export const HomeScreen: FC = () => {
  const route = useRoute<RouteProp<AppTabsParamList, "Dashboard">>();
  const { themeName, theme, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const selectedDate = route.params?.selectedDate;
  const activeDateStr = selectedDate ?? getLocalDateString();
  const headerDateText = useMemo(
    () => new Date(`${activeDateStr}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }),
    [activeDateStr],
  );
  const navigation = useNavigation();
  const dashboard = useDashboardData(activeDateStr);

  // Silent quick sync on app open when intervals.icu connected (once per 24h)
  useIntervalsAutoSync();
  const {
    trainingPlan,
    athleteProfile,
    athlete,
    readiness,
    todaysWorkout,
    weekStats,
    lastActivity,
    recoveryMetrics,
    weekPlan,
    activities,
    isRefetching,
    refetchAll,
    lastFetchedAt,
  } = dashboard;

  // No refetch on focus — reduces unnecessary API load. Use pull-to-refresh to refresh.

  const todayStr = activeDateStr;
  const todaysActual = activities?.filter((a) => a.date === activeDateStr)?.[0] ?? null;
  const todaysPlan = weekPlan?.find((d) => d.isToday) ?? null;
  const readinessTitle =
    readiness?.isToday === true || (readiness as { date?: string })?.date === todayStr
      ? "Today's Readiness"
      : readiness?.date
        ? `Readiness · ${formatReadinessDate(readiness.date)}`
        : "Today's Readiness";

  const flipAnim = useRef(new Animated.Value(0)).current;
  const refreshSpin = useRef(new Animated.Value(0)).current;
  const [isFlipped, setIsFlipped] = useState(false);
  const [showStreakCelebration, setShowStreakCelebration] = useState(false);
  const streak = useDailyStreak();
  const raceDaysAnim = useRef(new Animated.Value(0)).current;
  const [raceDaysDisplay, setRaceDaysDisplay] = useState<number | null>(null);

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

  useEffect(() => {
    if (!isRefetching) {
      refreshSpin.stopAnimation();
      refreshSpin.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(refreshSpin, {
        toValue: 1,
        duration: 800,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [isRefetching, refreshSpin]);

  useEffect(() => {
    if (streak.isMilestone && streak.milestoneDay != null) {
      setShowStreakCelebration(true);
    }
  }, [streak.isMilestone, streak.milestoneDay]);

  // Days to race (based on athlete_profile.goal_race_date)
  const goalRaceDateStr = athleteProfile?.goal_race_date ?? null;
  let raceDays: number | null = null;
  let raceState: "none" | "future" | "today" | "past" = "none";
  if (goalRaceDateStr) {
    const raceDate = new Date(goalRaceDateStr + "T00:00:00");
    const today = new Date();
    const todayMidnight = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    const diffMs = raceDate.getTime() - todayMidnight.getTime();
    const diffDays = Math.ceil(diffMs / 86400000);
    if (diffDays > 0) {
      raceDays = diffDays;
      raceState = "future";
    } else if (diffDays === 0) {
      raceDays = 0;
      raceState = "today";
    } else {
      raceDays = diffDays;
      raceState = "past";
    }
  }

  useEffect(() => {
    if (raceState !== "future" || raceDays == null || raceDays <= 0) {
      setRaceDaysDisplay(null);
      return;
    }
    const start = raceDays + 7;
    raceDaysAnim.setValue(start);
    setRaceDaysDisplay(start);
    const id = raceDaysAnim.addListener(({ value }) => {
      setRaceDaysDisplay(Math.round(value));
    });
    Animated.timing(raceDaysAnim, {
      toValue: raceDays,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(() => {
      raceDaysAnim.removeListener(id);
      setRaceDaysDisplay(raceDays);
    });
    return () => {
      raceDaysAnim.removeListener(id);
    };
  }, [raceState, raceDays, raceDaysAnim]);

  const progressPct = useMemo(() => {
    if (!weekStats?.plannedKm || weekStats.plannedKm <= 0) return 0;
    return Math.round(
      Math.max(
        0,
        Math.min(100, (Number(weekStats.actualKm ?? 0) / Number(weekStats.plannedKm)) * 100),
      ),
    );
  }, [weekStats]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        content: { gap: spacing.gap },
        headerRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        },
        headerMetaRow: {
          marginTop: 8,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          marginLeft: 12,
        },
        streakPill: {
          flexDirection: "column",
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 999,
          backgroundColor: "#F3F4F6",
          shadowColor: "#000",
          shadowOpacity: 0.06,
          shadowOffset: { width: 0, height: 2 },
          shadowRadius: 4,
          elevation: 1,
          width: 110,
        },
        weekPill: {
          flexDirection: "column",
          paddingHorizontal: 16,
          paddingVertical: 6,
          borderRadius: 999,
          backgroundColor: "#F3F4F6",
          shadowColor: "#000",
          shadowOpacity: 0.06,
          shadowOffset: { width: 0, height: 2 },
          shadowRadius: 4,
          elevation: 1,
          width: 150,
        },
        racePill: {
          flexDirection: "column",
          paddingHorizontal: 16,
          paddingVertical: 6,
          borderRadius: 999,
          backgroundColor: "#F3F4F6",
          shadowColor: "#000",
          shadowOpacity: 0.06,
          shadowOffset: { width: 0, height: 2 },
          shadowRadius: 4,
          elevation: 1,
          width: 90,
        },
        streakPillTopRow: {
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
        },
        streakCountText: {
          fontSize: 20,
          fontWeight: "700",
          color: theme.textPrimary,
        },
        weekCountText: {
          fontSize: 20,
          fontWeight: "700",
          color: theme.textPrimary,
        },
        streakLabelText: {
          marginTop: 2,
          fontSize: 11,
          color: theme.textMuted,
        },
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
        title: {
          fontSize: 30,
          fontWeight: "800",
          color: themeName === "darkPro" ? theme.textPrimary : "#111111",
          letterSpacing: -0.5,
        },
        titlePressable: { alignSelf: "flex-start" },
        subtitle: { fontSize: 13, color: theme.textSecondary },
        sectionHeader: { color: theme.textLabel, letterSpacing: 1.5 },
        readinessCard: { padding: 24 },
        readinessRow: { flexDirection: "row", alignItems: "center", gap: 20 },
        readinessBody: { flex: 1, minWidth: 0 },
        readinessTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
        readinessTitle: { fontSize: 16, fontWeight: "600", color: theme.textPrimary },
        readinessTrend: { fontSize: 12, color: theme.accentGreen, marginBottom: 6 },
        readinessSummary: { fontSize: 13, color: theme.textSecondary, lineHeight: 20 },
        readinessMeta: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
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
        activityCardWrap: {
          borderLeftWidth: 3,
          borderRadius: 16,
          overflow: "hidden",
        },
        activityTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
        activityLabel: { fontSize: 12, fontWeight: "600", color: theme.textLabel, textTransform: "uppercase", letterSpacing: 0.5 },
        activityName: { fontSize: 16, fontWeight: "600", color: theme.textPrimary },
        activityMeta: { fontSize: 13, color: theme.textSecondary, marginTop: 4 },
        activityMetrics: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 12 },
        activityMetric: { flexDirection: "row", alignItems: "baseline", gap: 4 },
        activityHint: { marginTop: 10, fontSize: 12, color: theme.textMuted },
        quickActionsRow: { flexDirection: "row", gap: 8, marginTop: 12 },
        quickActionPrimary: {
          borderRadius: 999,
          paddingHorizontal: 14,
          paddingVertical: 8,
          backgroundColor: theme.accentBlue,
        },
        quickActionSecondary: {
          borderRadius: 999,
          paddingHorizontal: 14,
          paddingVertical: 8,
          backgroundColor: theme.cardBorder,
        },
        quickActionTextPrimary: { fontSize: 12, fontWeight: "600", color: theme.primaryForeground },
        quickActionTextSecondary: { fontSize: 12, fontWeight: "600", color: theme.textSecondary },
        weekRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
        weekKm: { fontSize: 14, fontWeight: "500", color: theme.textPrimary },
        weekPct: { fontSize: 12, color: theme.textMuted },
        progressTrack: { height: 8, borderRadius: 999, backgroundColor: theme.cardBorder, overflow: "hidden", marginBottom: 10 },
        progressFill: { height: "100%", borderRadius: 999, backgroundColor: theme.accentBlue },
        weekSessionsText: { fontSize: 11, color: theme.textMuted, marginBottom: 12 },
        qualityRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
        dotsRow: { flexDirection: "row", gap: 6 },
        dot: { width: 10, height: 10, borderRadius: 999, borderWidth: 1 },
        dotDone: { },
        dotPlanned: { },
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
        hrZonesBar: { flexDirection: "row", height: 6, borderRadius: 999, overflow: "hidden" },
        hrZone: { height: "100%" },
        hrZonesLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
        hrZoneLabel: { fontSize: 10, color: theme.textMuted },
        raceHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
        raceGradientTint: {
          ...StyleSheet.absoluteFillObject,
          borderRadius: 16,
          backgroundColor: "#dbeafe",
          opacity: 0.35,
        },
        raceIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: theme.chartFill, alignItems: "center", justifyContent: "center" },
        raceEmoji: { fontSize: 14 },
        raceTitle: { fontSize: 14, fontWeight: "500", color: theme.textPrimary },
        raceSubtitle: { fontSize: 12, color: theme.textSecondary },
        raceTime: { fontSize: 28, fontWeight: "700", color: theme.textPrimary, marginBottom: 8 },
        racePaces: { gap: 2 },
        racePillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 8 },
        raceMetaPill: { },
        racePillText: { fontSize: 12, color: theme.textMuted },
        racePillSep: { fontSize: 12, color: theme.textMuted },
        raceFootnote: { fontSize: 10, color: theme.textMuted, marginTop: 12 },
        raceViewAllBtn: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" },
        raceViewAll: { fontSize: 12 },
        raceModalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
        raceModalSheet: {
          backgroundColor: "#ffffff",
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          paddingTop: 12,
          paddingHorizontal: 20,
          paddingBottom: 32 + insets.bottom,
        },
        raceModalHandle: {
          width: 36,
          height: 4,
          borderRadius: 2,
          alignSelf: "center",
          marginBottom: 16,
          backgroundColor: "#d4d4d4",
        },
        raceModalHeaderRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 4,
        },
        raceModalTitle: { fontSize: 18, fontWeight: "700", color: "#171717" },
        raceModalCloseBtn: { padding: 4, marginRight: -4 },
        raceModalSubtitle: { fontSize: 12, color: "#737373", marginBottom: 16 },
        raceModalRows: { backgroundColor: "#ffffff" },
        raceModalRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingVertical: 14,
          paddingHorizontal: 0,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: "#e5e5e5",
          backgroundColor: "#ffffff",
        },
        raceModalRowLast: { borderBottomWidth: 0 },
        raceModalRowLabel: { fontSize: 15, fontWeight: "600", color: "#171717" },
        raceModalRowRight: { alignItems: "flex-end" },
        raceModalRowTime: { fontSize: 15, fontWeight: "600", color: "#171717" },
        raceModalRowPace: { fontSize: 11, color: "#737373", marginTop: 2 },
        daysRow: { gap: 12, paddingBottom: 8 },
        dayCard: {
          width: 140,
          minHeight: 160,
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
        dayZoneBar: { marginTop: 10, height: 4, borderRadius: 999, backgroundColor: theme.cardBorder },
        dayZoneFill: { height: "100%", borderRadius: 999 },
        dayRestCentered: { marginTop: 18, textAlign: "center", fontSize: 13, color: theme.textMuted, opacity: 0.6 },
        lastUpdatedBlock: { marginTop: 8, gap: 2 },
        lastUpdatedText: { fontSize: 10, color: theme.textMuted },
        updatedInlineRow: { marginTop: 8, flexDirection: "row", alignItems: "center", gap: 6 },
        lastActivityActionBtn: {
          width: 28,
          height: 28,
          borderRadius: 999,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.cardBorder,
        },
        recoveryHeaderRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
        recoveryHeaderDot: { width: 8, height: 8, borderRadius: 999, backgroundColor: theme.accentGreen },
        recoveryTrendNegative: { fontSize: 11, color: theme.accentOrange },
        recoveryTrendPositive: { fontSize: 11, color: theme.accentGreen },
        recoveryStatsContainer: {
          marginTop: 12,
          paddingTop: 12,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: "#F3F4F6",
        },
        recoveryStatsRow: {
          flexDirection: "row",
        },
        recoveryStatColumn: {
          flex: 1,
          alignItems: "center",
        },
        recoveryStatLabel: {
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: 1,
          color: "#9CA3AF",
        },
        recoveryStatValue: {
          marginTop: 4,
          fontSize: 16,
          fontWeight: "700",
          color: "#111111",
        },
        recoveryStatStatus: {
          marginTop: 2,
          fontSize: 11,
        },
        restBadge: {
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 999,
          backgroundColor: "#F3F4F6",
        },
        restBadgeText: {
          fontSize: 11,
          fontWeight: "500",
          color: "#6B7280",
        },
        restDayText: {
          fontSize: 12,
          color: "#9CA3AF",
        },
        restContent: {
          marginTop: 12,
          alignItems: "center",
        },
        restEmoji: { fontSize: 48, marginBottom: 8 },
        restTitle: {
          fontSize: 18,
          fontWeight: "700",
          color: theme.textPrimary,
          textAlign: "center",
        },
        restSubtitle: {
          marginTop: 4,
          fontSize: 13,
          color: theme.textSecondary,
          textAlign: "center",
        },
        restTipsRow: {
          marginTop: 16,
          flexDirection: "row",
          justifyContent: "space-between",
          gap: 8,
        },
        restTipCard: {
          flex: 1,
          backgroundColor: colors.card,
          borderRadius: 16,
          paddingVertical: 10,
          paddingHorizontal: 8,
          shadowColor: "#000",
          shadowOpacity: 0.06,
          shadowOffset: { width: 0, height: 2 },
          shadowRadius: 4,
          elevation: 1,
          alignItems: "center",
        },
        restTipEmoji: { fontSize: 20, marginBottom: 4 },
        restTipTitle: {
          fontSize: 12,
          fontWeight: "600",
          color: theme.textPrimary,
        },
        restTipSubtitle: {
          fontSize: 11,
          color: theme.textSecondary,
        },
        restInfoCard: {
          marginTop: 16,
          padding: 12,
          borderRadius: 12,
          backgroundColor: "#FFF8E1",
        },
        restInfoText: {
          fontSize: 12,
          color: "#4B5563",
          fontStyle: "italic",
        },
      }),
    [colors, theme, insets, themeName]
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

  const activitiesForPrediction = useMemo(
    () =>
      activities?.map((a) => ({
        date: a.date,
        distance_km: a.distance_km,
        duration_seconds: a.duration_seconds,
      })) ?? [],
    [activities],
  );
  const { racePrediction } = useRacePredictions(
    activitiesForPrediction,
    readiness?.ctl ?? null,
    goalRaceKm,
  );

  const [raceModalVisible, setRaceModalVisible] = useState(false);

  const planWeeks = trainingPlan?.weeks ?? [];
  const hasTrainingPlan = !!trainingPlan?.plan && planWeeks.length > 0;

  const { planWeekCurrent, planWeekTotal } = useMemo(() => {
    if (!hasTrainingPlan) {
      return { planWeekCurrent: null as number | null, planWeekTotal: null as number | null };
    }
    const total = Math.max(...planWeeks.map((w) => w.week_number || 0));
    const today = new Date(`${activeDateStr}T12:00:00`);

    let current: number | null = null;

    // First try: find week where today is within [start_date, start_date+6]
    for (const w of planWeeks) {
      if (!w.start_date) continue;
      const start = parseISO(w.start_date);
      const end = addDaysFns(start, 6);
      if (isWithinInterval(today, { start, end })) {
        current = w.week_number;
        break;
      }
    }

    // Fallback: compute offset from plan start week
    if (current == null) {
      const planStartRaw = trainingPlan?.plan?.start_date;
      if (planStartRaw) {
        const planStart = parseISO(planStartRaw);
        const weekStart = startOfWeekFns(planStart, { weekStartsOn: 1 });
        const diffMs = today.getTime() - weekStart.getTime();
        const weekIdx = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
        current = Math.max(1, Math.min(total, weekIdx));
      } else {
        current = total;
      }
    }

    return { planWeekCurrent: current, planWeekTotal: total };
  }, [hasTrainingPlan, planWeeks, activeDateStr, trainingPlan]);

  if (!readiness || !weekStats) {
    return (
      <ScreenContainer contentContainerStyle={styles.content}>
        <SkeletonCard>
          <SkeletonLine width="45%" />
          <SkeletonLine width="80%" style={{ marginTop: 12 }} />
          <SkeletonLine width="100%" style={{ marginTop: 12, height: 80, borderRadius: 12 }} />
        </SkeletonCard>
        <SkeletonCard>
          <SkeletonLine width="40%" />
          <SkeletonLine width="70%" style={{ marginTop: 10 }} />
          <SkeletonLine width="100%" style={{ marginTop: 10 }} />
        </SkeletonCard>
      </ScreenContainer>
    );
  }

  const refreshRotation = refreshSpin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });
  const hrvDelta = (recoveryMetrics.hrv ?? 0) - (recoveryMetrics.hrv7dayAvg ?? 0);
  const hrvStatus =
    recoveryMetrics.hrv == null || recoveryMetrics.hrv === 0
      ? { label: "—", color: colors.mutedForeground }
      : hrvDelta >= 0
        ? { label: "↑ good", color: "#22C55E" }
        : { label: "↓ below", color: "#F59E0B" };
  const sleepHoursNum = readiness.sleepHours ?? 0;
  const sleepStatus =
    sleepHoursNum <= 0
      ? { label: "—", color: colors.mutedForeground }
      : sleepHoursNum < 6
        ? { label: "very low", color: "#EF4444" }
        : sleepHoursNum < 7
          ? { label: "low", color: "#F59E0B" }
          : { label: "ok", color: "#22C55E" };
  const tsbVal = readiness.tsb ?? 0;
  const tsbStatus =
    tsbVal < -15
      ? { label: "fatigued", color: "#EF4444" }
      : tsbVal < -5
        ? { label: "tired", color: "#F59E0B" }
        : { label: "ready", color: "#22C55E" };
  const isRestDay =
    (todaysPlan && (todaysPlan.type === "recovery" || /rest/i.test(todaysPlan.title ?? ""))) ||
    (todaysActual &&
      /rest|recovery/i.test(String(todaysActual.name ?? todaysActual.type ?? "")));
  const workoutBorderColor = workoutAccent(todaysWorkout?.type, theme);
  const sessionsDone = Math.max(0, Math.min(7, Math.round((weekStats.actualKm / Math.max(weekStats.plannedKm, 1)) * 7)));
  const lastActivityDetailId =
    (lastActivity as unknown as { detailId?: string | null }).detailId ?? null;

  const goToLastActivity = () => {
    if (!lastActivityDetailId) return;
    navigation.navigate(
      "ActivitiesStack" as never,
      { screen: "ActivityDetail", params: { id: lastActivityDetailId } } as never,
    );
  };

  const goToPlanOnboardingRace = () => {
    navigation.navigate("Plan" as never);
  };

  const renderRacePill = () => {
    if (raceState === "none") {
      return (
        <TouchableOpacity
          style={styles.racePill}
          activeOpacity={0.8}
          onPress={goToPlanOnboardingRace}
        >
          <View style={styles.streakPillTopRow}>
            <Ionicons name="flag-outline" size={18} color="#1C1C1E" />
            <Text
              style={styles.streakCountText}
              numberOfLines={1}
              ellipsizeMode="tail"
              adjustsFontSizeToFit
            >
              —
            </Text>
          </View>
          <Text
            style={styles.streakLabelText}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            set race
          </Text>
        </TouchableOpacity>
      );
    }
    if (raceState === "today") {
      return (
        <View style={styles.racePill}>
          <View style={styles.streakPillTopRow}>
            <Ionicons name="flag-outline" size={18} color="#1C1C1E" />
            <Text
              style={[styles.streakCountText, { color: theme.accentGreen }]}
              numberOfLines={1}
              ellipsizeMode="tail"
              adjustsFontSizeToFit
            >
              Race day!
            </Text>
          </View>
          <Text
            style={styles.streakLabelText}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            Good luck
          </Text>
        </View>
      );
    }
    if (raceState === "past") {
      return (
        <TouchableOpacity
          style={styles.racePill}
          activeOpacity={0.8}
          onPress={goToPlanOnboardingRace}
        >
          <View style={styles.streakPillTopRow}>
            <Ionicons name="flag-outline" size={18} color="#1C1C1E" />
            <Text
              style={styles.streakCountText}
              numberOfLines={1}
              ellipsizeMode="tail"
              adjustsFontSizeToFit
            >
              —
            </Text>
          </View>
          <Text
            style={styles.streakLabelText}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            set race
          </Text>
        </TouchableOpacity>
      );
    }
    const display =
      raceDaysDisplay != null && raceDaysDisplay > 0
        ? raceDaysDisplay
        : raceDays ?? 0;
    return (
      <View style={styles.racePill}>
        <View style={styles.streakPillTopRow}>
          <Ionicons name="flag-outline" size={18} color="#1C1C1E" />
          <Text
            style={styles.streakCountText}
            numberOfLines={1}
            ellipsizeMode="tail"
            adjustsFontSizeToFit
          >
            {display}
          </Text>
        </View>
        <Text
          style={styles.streakLabelText}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          to race
        </Text>
      </View>
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
      <View style={{ flex: 1 }}>
        <ScreenContainer
          contentContainerStyle={[styles.content, { paddingBottom: SCROLL_PADDING_BELOW_BUBBLE }]}
          onRefresh={refetchAll}
        >
          {/* Header: title + settings top-right */}
          <View style={styles.headerRow}>
            <View style={styles.header}>
              <TouchableOpacity
                style={styles.titlePressable}
                activeOpacity={0.8}
                onPress={() => navigation.navigate("Calendar" as never, { selectedDate: activeDateStr } as never)}
              >
                <Text style={styles.title}>{headerDateText}</Text>
              </TouchableOpacity>
              <View style={styles.headerMetaRow}>
                <View style={styles.streakPill}>
                  <View style={styles.streakPillTopRow}>
                    <Ionicons name="flame-outline" size={14} color="#1C1C1E" />
                    <Text style={styles.streakCountText}>{streak.currentStreak}</Text>
                  </View>
                  <Text style={styles.streakLabelText}>day streak</Text>
                </View>
                <View style={styles.weekPill}>
                  <View style={styles.streakPillTopRow}>
                    <Ionicons name="calendar-outline" size={14} color="#1C1C1E" />
                    <Text style={styles.weekCountText}>
                      {planWeekCurrent != null ? `Week ${planWeekCurrent}` : "Week —"}
                    </Text>
                  </View>
                  <Text style={styles.streakLabelText}>
                    {planWeekTotal != null && hasTrainingPlan
                      ? `of ${planWeekTotal} · ${athlete.currentPhase} Phase`
                      : "no plan"}
                  </Text>
                </View>
                {renderRacePill()}
              </View>
            </View>
          </View>

        {/* Readiness Card */}
        <TouchableOpacity activeOpacity={0.9} onPress={flipCard}>
          <View style={styles.flipContainer}>
            <Animated.View style={[styles.flipCard, { transform: [{ rotateY: frontRotation }] }]}>
              <GlassCard style={styles.readinessCard}>
                <View style={styles.readinessRow}>
                  <ReadinessRing
                    score={readiness.score}
                    size={80}
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
                      <Text style={styles.readinessTitle}>{readinessTitle}</Text>
                      <WorkoutBadge type={todaysWorkout.type} />
                    </View>
                    <Text style={styles.readinessTrend}>↑ +3 from yesterday</Text>
                    <Text style={styles.readinessSummary}>{readiness.aiSummary}</Text>
                    <View style={styles.recoveryStatsContainer}>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => navigation.navigate("Stats" as never)}
                      >
                        <View style={styles.recoveryStatsRow}>
                          <View style={styles.recoveryStatColumn}>
                            <Text style={styles.recoveryStatLabel}>HRV</Text>
                            <Text style={[styles.recoveryStatValue, typography.mono]}>
                              {readiness.hrv != null && readiness.hrv !== 0 ? `${readiness.hrv}ms` : "—"}
                            </Text>
                            <Text style={[styles.recoveryStatStatus, { color: hrvStatus.color }]}>
                              {hrvStatus.label}
                            </Text>
                          </View>
                          <View style={styles.recoveryStatColumn}>
                            <Text style={styles.recoveryStatLabel}>Sleep</Text>
                            <Text style={[styles.recoveryStatValue, typography.mono]}>
                              {formatSleepHours(readiness.sleepHours)}
                            </Text>
                            <Text style={[styles.recoveryStatStatus, { color: sleepStatus.color }]}>
                              {sleepStatus.label}
                            </Text>
                          </View>
                          <View style={styles.recoveryStatColumn}>
                            <Text style={styles.recoveryStatLabel}>TSB</Text>
                            <Text style={[styles.recoveryStatValue, typography.mono]}>
                              {readiness.tsb != null ? Number(readiness.tsb).toFixed(1) : "—"}
                            </Text>
                            <Text style={[styles.recoveryStatStatus, { color: tsbStatus.color }]}>
                              {tsbStatus.label}
                            </Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
                <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 12 }}>
                  {relativeMinsLabel(lastFetchedAt)}
                </Text>
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
                {Number(weekStats.actualKm ?? 0).toFixed(1)} /{" "}
                {Number(weekStats.plannedKm ?? 0).toFixed(0)} km
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${progressPct}%`,
                    backgroundColor:
                      progressPct >= 90 ? theme.accentGreen : theme.accentBlue,
                  },
                ]}
              />
            </View>
            <Text style={styles.weekSessionsText}>
              Sessions: {sessionsDone}/7 complete
            </Text>
            <Text style={styles.metaText}>🏃 Quality sessions</Text>
            <Text style={styles.metaText}>
              {weekStats.qualityDone} / {weekStats.qualityPlanned} quality sessions
            </Text>
            <View style={styles.dotsRow}>
              {Array.from({ length: weekStats.qualityPlanned }).map((_, i) => {
                const isDone = i < weekStats.qualityDone;
                const typeIndex = i % 3;
                const color =
                  typeIndex === 0
                    ? theme.accentRed
                    : typeIndex === 1
                    ? theme.accentBlue
                    : theme.accentOrange;
                return (
                  <View
                    key={i}
                    style={[
                      styles.dot,
                      {
                        borderColor: color,
                        backgroundColor: isDone ? color : "transparent",
                      },
                    ]}
                  />
                );
              })}
            </View>
            <View style={styles.sparklineBlock}>
              <Text style={styles.sparklineLabel}>Load trend</Text>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                <Text style={styles.metaText}>min {Math.round(Math.min(...weekStats.tssData))}</Text>
                <Text style={styles.metaText}>max {Math.round(Math.max(...weekStats.tssData))}</Text>
              </View>
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
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={styles.metaText}>{lastActivity.date}</Text>
                <TouchableOpacity style={styles.lastActivityActionBtn} onPress={() => navigation.navigate("Coach" as never)} activeOpacity={0.85}>
                  <Ionicons name="chatbubble-ellipses" size={14} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.metricsGrid}>
              <View style={styles.metricCell}>
                <Text style={styles.metricLabel}>Distance</Text>
                <Text style={[styles.metricValue, typography.mono]}>
                  {lastActivity.distance != null && lastActivity.distance > 0 ? (typeof lastActivity.distance === "number" ? lastActivity.distance.toFixed(1) : lastActivity.distance) : "—"}
                </Text>
              </View>
              <View style={styles.metricCell}>
                <Text style={styles.metricLabel}>Avg Pace</Text>
                <Text style={[styles.metricValue, typography.mono]}>
                  {lastActivity.avgPace && lastActivity.avgPace !== "0" ? lastActivity.avgPace : "—"}
                </Text>
              </View>
              <View style={styles.metricCell}>
                <Text style={styles.metricLabel}>Avg HR</Text>
                <Text style={[styles.metricValue, typography.mono]}>
                  {lastActivity.avgHr != null && lastActivity.avgHr > 0 ? `${lastActivity.avgHr} bpm` : "—"}
                </Text>
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
          <TouchableOpacity
            style={styles.widgetCard}
            activeOpacity={0.9}
            onPress={() => navigation.navigate("Stats" as never)}
          >
            <View style={styles.recoveryHeaderRow}>
              <View style={styles.recoveryHeaderDot} />
              <Text style={styles.widgetHeader}>Recovery</Text>
            </View>
            <View style={styles.recoveryRow}>
              <View>
                <Text style={styles.metricLabel}>HRV</Text>
                <View style={styles.recoveryValueRow}>
                  <Text style={[styles.recoveryValue, typography.mono]}>
                    {recoveryMetrics.hrv != null && recoveryMetrics.hrv !== 0 ? recoveryMetrics.hrv : "—"}
                  </Text>
                  <Text style={styles.metaText}>/ {recoveryMetrics.hrv7dayAvg != null && recoveryMetrics.hrv7dayAvg !== 0 ? recoveryMetrics.hrv7dayAvg : "—"} avg</Text>
                </View>
              </View>
            </View>
            <Text style={hrvDelta < 0 ? styles.recoveryTrendNegative : styles.recoveryTrendPositive}>
              {hrvDelta < 0 ? "↓" : "↑"} {Math.abs(Math.round(hrvDelta))}ms {hrvDelta < 0 ? "below" : "above"} baseline
            </Text>
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
          </TouchableOpacity>
        </View>

        {/* SECTION 4 – Today’s activity (existing card) */}
        <View style={[styles.activityCardWrap, { borderLeftColor: workoutBorderColor }]}>
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
            <Text style={styles.activityHint}>Tap to see full session details →</Text>
            <View style={styles.quickActionsRow}>
              <TouchableOpacity style={styles.quickActionPrimary} activeOpacity={0.85}>
                <Text style={styles.quickActionTextPrimary}>Start</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickActionSecondary} activeOpacity={0.85} onPress={() => navigation.navigate("Coach" as never)}>
                <Text style={styles.quickActionTextSecondary}>Ask Coach</Text>
              </TouchableOpacity>
            </View>
          </GlassCard>
        </View>

        {/* Keep existing lower sections (race prediction, CTA, next 7 days) */}
        {racePrediction && (
          <TouchableOpacity activeOpacity={0.9} onPress={() => setRaceModalVisible(true)}>
            <GlassCard>
              <View style={styles.raceGradientTint} />
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
              <Text style={styles.racePillText}>
                Z2 {racePrediction.zone2} · Threshold {racePrediction.threshold} · VO2max {racePrediction.vo2max}
              </Text>
              <Text style={styles.raceFootnote}>
                Based on best effort · CTL {Math.round(racePrediction.ctl)}
              </Text>
              <View style={styles.raceViewAllBtn}>
                <Text style={[styles.raceViewAll, { color: theme.accentBlue }]}>View all distances</Text>
                <Ionicons name="chevron-forward" size={14} color={theme.accentBlue} />
              </View>
            </GlassCard>
          </TouchableOpacity>
        )}

        {/* Race Predictions modal – all 4 distances (Dark Pro branch) */}
        {racePrediction?.allPredictions && (
          <Modal
            visible={raceModalVisible}
            transparent
            animationType="slide"
            onRequestClose={() => setRaceModalVisible(false)}
          >
            <Pressable
              style={styles.raceModalBackdrop}
              onPress={() => setRaceModalVisible(false)}
            >
              <Pressable
                style={styles.raceModalSheet}
                onPress={(e) => e.stopPropagation()}
              >
                <View style={styles.raceModalHandle} />
                <View style={styles.raceModalHeaderRow}>
                  <Text style={styles.raceModalTitle}>Race Predictions</Text>
                  <TouchableOpacity
                    style={styles.raceModalCloseBtn}
                    onPress={() => setRaceModalVisible(false)}
                    accessibilityLabel="Close"
                  >
                    <Text style={{ fontSize: 22, color: "#737373", lineHeight: 24 }}>×</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.raceModalSubtitle}>
                  Based on best effort{racePrediction.best.distanceKm > 0 ? ` (${racePrediction.best.distanceKm.toFixed(1)} km)` : ""} · CTL {Math.round(racePrediction.ctl)}
                </Text>
                <View style={styles.raceModalRows}>
                  {racePrediction.allPredictions.map(({ label, km, time }, idx) => (
                    <View
                      key={km}
                      style={[styles.raceModalRow, idx === racePrediction.allPredictions.length - 1 && styles.raceModalRowLast]}
                    >
                      <Text style={styles.raceModalRowLabel}>{label}</Text>
                      <View style={styles.raceModalRowRight}>
                        <Text style={[styles.raceModalRowTime, typography.mono]}>{formatRaceTime(time)}</Text>
                        <Text style={styles.raceModalRowPace}>{formatPace(time, km)}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </Pressable>
            </Pressable>
          </Modal>
        )}

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
              <Text style={styles.dayCardTitle} numberOfLines={2}>{day.title}</Text>
              {day.distance > 0 ? (
                <>
                  <Text style={[styles.dayCardDistance, typography.mono]}>{day.distance} km</Text>
                  <Text style={styles.dayCardDetail}>@ planned pace</Text>
                  <Text style={styles.dayCardDetail}>{day.detail}</Text>
                </>
              ) : (
                <Text style={styles.dayRestCentered}>💤{"\n"}Rest</Text>
              )}
              <View style={styles.dayZoneBar}>
                <View
                  style={[
                    styles.dayZoneFill,
                    {
                      width: "100%",
                      backgroundColor:
                        day.type === "interval"
                          ? theme.accentRed
                          : day.type === "tempo"
                          ? theme.accentBlue
                          : day.type === "easy" || day.type === "recovery"
                          ? theme.accentGreen
                          : theme.textMuted,
                    },
                  ]}
                />
              </View>
            </View>
          ))}
        </ScrollView>
        </ScreenContainer>
      </View>
    );
  }

  // Default (light) layout – existing structure
  return (
    <View style={{ flex: 1 }}>
      <ScreenContainer
        contentContainerStyle={[styles.content, { paddingBottom: SCROLL_PADDING_BELOW_BUBBLE }]}
        onRefresh={refetchAll}
      >
        {/* Page header – title + settings top-right */}
        <View style={styles.headerRow}>
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.titlePressable}
              activeOpacity={0.8}
              onPress={() => navigation.navigate("Calendar" as never, { selectedDate: activeDateStr } as never)}
            >
              <Text style={styles.title}>{headerDateText}</Text>
            </TouchableOpacity>
            <View style={styles.headerMetaRow}>
              <View style={styles.streakPill}>
                <View style={styles.streakPillTopRow}>
                  <Ionicons name="flame-outline" size={14} color="#1C1C1E" />
                  <Text style={styles.streakCountText}>{streak.currentStreak}</Text>
                </View>
                <Text style={styles.streakLabelText}>day streak</Text>
              </View>
              <View style={styles.weekPill}>
                <View style={styles.streakPillTopRow}>
                  <Ionicons name="calendar-outline" size={14} color="#1C1C1E" />
                  <Text style={styles.weekCountText}>
                    {planWeekCurrent != null ? `Week ${planWeekCurrent}` : "Week —"}
                  </Text>
                </View>
                <Text style={styles.streakLabelText}>
                  {planWeekTotal != null && hasTrainingPlan
                    ? `of ${planWeekTotal} · ${athlete.currentPhase} Phase`
                    : "no plan"}
                </Text>
              </View>
              {renderRacePill()}
            </View>
          </View>
        </View>

      {/* Readiness Card */}
      <TouchableOpacity activeOpacity={0.9} onPress={flipCard}>
        <View style={styles.flipContainer}>
          <Animated.View style={[styles.flipCard, { transform: [{ rotateY: frontRotation }] }]}>
            <GlassCard style={styles.readinessCard}>
              <View style={styles.readinessRow}>
                <ReadinessRing
                  score={readiness.score}
                  size={80}
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
                    <Text style={styles.readinessTitle}>{readinessTitle}</Text>
                    <WorkoutBadge type={todaysWorkout.type} />
                  </View>
                  <Text style={styles.readinessTrend}>↑ +3 from yesterday</Text>
                  <Text style={styles.readinessSummary}>{readiness.aiSummary}</Text>
                  <View style={styles.recoveryStatsContainer}>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => navigation.navigate("Stats" as never)}
                    >
                      <View style={styles.recoveryStatsRow}>
                        <View style={styles.recoveryStatColumn}>
                          <Text style={styles.recoveryStatLabel}>HRV</Text>
                          <Text style={[styles.recoveryStatValue, typography.mono]}>
                            {readiness.hrv != null && readiness.hrv !== 0 ? `${readiness.hrv}ms` : "—"}
                          </Text>
                          <Text style={[styles.recoveryStatStatus, { color: hrvStatus.color }]}>
                            {hrvStatus.label}
                          </Text>
                        </View>
                        <View style={styles.recoveryStatColumn}>
                          <Text style={styles.recoveryStatLabel}>Sleep</Text>
                          <Text style={[styles.recoveryStatValue, typography.mono]}>
                            {formatSleepHours(readiness.sleepHours)}
                          </Text>
                          <Text style={[styles.recoveryStatStatus, { color: sleepStatus.color }]}>
                            {sleepStatus.label}
                          </Text>
                        </View>
                        <View style={styles.recoveryStatColumn}>
                          <Text style={styles.recoveryStatLabel}>TSB</Text>
                          <Text style={[styles.recoveryStatValue, typography.mono]}>
                            {readiness.tsb != null ? Number(readiness.tsb).toFixed(1) : "—"}
                          </Text>
                          <Text style={[styles.recoveryStatStatus, { color: tsbStatus.color }]}>
                            {tsbStatus.label}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => navigation.navigate("Stats" as never)}
                  >
                    <Text
                      style={{
                        marginTop: 8,
                        fontSize: 12,
                        color: theme.textSecondary,
                        textDecorationLine: "underline",
                      }}
                    >
                      View details →
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 12 }}>{relativeMinsLabel(lastFetchedAt)}</Text>
            </GlassCard>
          </Animated.View>
        </View>
      </TouchableOpacity>

      {/* Today's Activity – planned or completed */}
      <View style={[styles.activityCardWrap, { borderLeftColor: workoutBorderColor }]}>
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
                {(todaysActual.distance_km != null && todaysActual.distance_km > 0 ? todaysActual.distance_km.toFixed(1) : "—")} km · {formatDuration(todaysActual.duration_seconds)}
                {todaysActual.avg_pace && todaysActual.avg_pace !== "0" ? ` @ ${todaysActual.avg_pace}` : ""}
              </Text>
              <View style={styles.activityMetrics}>
                <View style={styles.activityMetric}>
                  <Text style={[styles.metricValue, typography.mono]}>
                    {todaysActual.distance_km != null && todaysActual.distance_km > 0 ? todaysActual.distance_km.toFixed(1) : "—"}
                  </Text>
                  <Text style={styles.metricLabel}>km</Text>
                </View>
                <View style={styles.activityMetric}>
                  <Text style={[styles.metricValue, typography.mono]}>{formatDuration(todaysActual.duration_seconds)}</Text>
                  <Text style={styles.metricLabel}>duration</Text>
                </View>
                <View style={styles.activityMetric}>
                  <Text style={[styles.metricValue, typography.mono]}>
                    {todaysActual.avg_pace && todaysActual.avg_pace !== "0" ? todaysActual.avg_pace : "—"}
                  </Text>
                  <Text style={styles.metricLabel}>pace</Text>
                </View>
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
          <Text style={styles.activityHint}>Tap to see full session details →</Text>
          <View style={styles.quickActionsRow}>
            <TouchableOpacity style={styles.quickActionPrimary} activeOpacity={0.85}>
              <Text style={styles.quickActionTextPrimary}>Start</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickActionSecondary} activeOpacity={0.85} onPress={() => navigation.navigate("Coach" as never)}>
              <Text style={styles.quickActionTextSecondary}>Ask Coach</Text>
            </TouchableOpacity>
          </View>
        </GlassCard>
      </View>

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
        <Text style={styles.weekSessionsText}>Sessions: {sessionsDone}/7 complete</Text>
        <View style={styles.qualityRow}>
          <Text style={styles.metaText}>🏃 Quality sessions</Text>
          <View style={styles.dotsRow}>
            {Array.from({ length: weekStats.qualityPlanned }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  {
                    backgroundColor:
                      i < weekStats.qualityDone
                        ? i % 3 === 0
                          ? theme.accentGreen
                          : i % 3 === 1
                          ? theme.accentRed
                          : theme.accentBlue
                        : theme.cardBorder,
                  },
                ]}
              />
            ))}
          </View>
        </View>
        <View style={styles.sparklineBlock}>
          <Text style={styles.sparklineLabel}>Load trend</Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={styles.metaText}>min {Math.round(Math.min(...weekStats.tssData))}</Text>
            <Text style={styles.metaText}>max {Math.round(Math.max(...weekStats.tssData))}</Text>
          </View>
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
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={styles.metaText}>{lastActivity.date}</Text>
            <TouchableOpacity style={styles.lastActivityActionBtn} onPress={() => navigation.navigate("Coach" as never)} activeOpacity={0.85}>
              <Ionicons name="chatbubble-ellipses" size={14} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
          </View>
          <View style={styles.metricsGrid}>
            <View style={styles.metricCell}>
              <Text style={styles.metricLabel}>Distance</Text>
              <Text style={[styles.metricValue, typography.mono]}>
                {lastActivity.distance != null && lastActivity.distance > 0 ? (typeof lastActivity.distance === "number" ? lastActivity.distance.toFixed(1) : lastActivity.distance) : "—"}
              </Text>
            </View>
            <View style={styles.metricCell}>
              <Text style={styles.metricLabel}>Avg Pace</Text>
              <Text style={[styles.metricValue, typography.mono]}>
                {lastActivity.avgPace && lastActivity.avgPace !== "0" ? lastActivity.avgPace : "—"}
              </Text>
            </View>
            <View style={styles.metricCell}>
              <Text style={styles.metricLabel}>Avg HR</Text>
              <Text style={[styles.metricValue, typography.mono]}>
                {lastActivity.avgHr != null && lastActivity.avgHr > 0 ? `${lastActivity.avgHr} bpm` : "—"}
              </Text>
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
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => navigation.navigate("Stats" as never)}
      >
        <GlassCard>
          <View style={styles.recoveryHeaderRow}>
            <View style={styles.recoveryHeaderDot} />
            <Text style={[styles.sectionHeader, typography.sectionHeader]}>Recovery</Text>
          </View>
          <View style={styles.recoveryRow}>
            <View>
              <Text style={styles.metricLabel}>HRV</Text>
              <View style={styles.recoveryValueRow}>
                <Text style={[styles.recoveryValue, typography.mono]}>
                  {recoveryMetrics.hrv != null && recoveryMetrics.hrv !== 0 ? recoveryMetrics.hrv : "—"}
                </Text>
                <Text style={styles.metaText}>/ {recoveryMetrics.hrv7dayAvg != null && recoveryMetrics.hrv7dayAvg !== 0 ? recoveryMetrics.hrv7dayAvg : "—"} avg</Text>
              </View>
            </View>
          </View>
          <Text style={hrvDelta < 0 ? styles.recoveryTrendNegative : styles.recoveryTrendPositive}>
            {hrvDelta < 0 ? "↓" : "↑"} {Math.abs(Math.round(hrvDelta))}ms {hrvDelta < 0 ? "below" : "above"} baseline
          </Text>
          <View style={styles.sparklineBlock}>
            <Text style={styles.sparklineLabel}>HRV (7 days)</Text>
            <Sparkline data={recoveryMetrics.hrvTrend} color={theme.chartLineTSB} />
          </View>
          <View style={styles.sparklineBlock}>
            <Text style={styles.sparklineLabel}>Resting HR (7 days)</Text>
            <Sparkline data={recoveryMetrics.restingHrTrend} color={theme.negative} />
          </View>
        </GlassCard>
      </TouchableOpacity>

      {/* Race Prediction – same layout as web, tappable for all distances modal */}
      {racePrediction && (
        <TouchableOpacity activeOpacity={0.9} onPress={() => setRaceModalVisible(true)}>
          <GlassCard>
            <View style={styles.raceGradientTint} />
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
              <Text style={styles.racePillText}>
              Z2 {racePrediction.zone2} · Threshold {racePrediction.threshold} · VO2max {racePrediction.vo2max}
            </Text>
            <Text style={styles.raceFootnote}>
              Based on best effort · CTL {Math.round(racePrediction.ctl)}
            </Text>
            <View style={styles.raceViewAllBtn}>
              <Text style={[styles.raceViewAll, { color: theme.accentBlue }]}>View all distances</Text>
              <Ionicons name="chevron-forward" size={14} color={theme.accentBlue} />
            </View>
          </GlassCard>
        </TouchableOpacity>
      )}

      {/* Race Predictions modal – all 4 distances (5K, 10K, Half, Marathon) */}
      {racePrediction?.allPredictions && (
        <Modal
          visible={raceModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setRaceModalVisible(false)}
        >
          <Pressable
            style={styles.raceModalBackdrop}
            onPress={() => setRaceModalVisible(false)}
          >
            <Pressable
              style={styles.raceModalSheet}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.raceModalHandle} />
              <View style={styles.raceModalHeaderRow}>
                <Text style={styles.raceModalTitle}>Race Predictions</Text>
                <TouchableOpacity
                  style={styles.raceModalCloseBtn}
                  onPress={() => setRaceModalVisible(false)}
                  accessibilityLabel="Close"
                >
                  <Text style={{ fontSize: 22, color: "#737373", lineHeight: 24 }}>×</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.raceModalSubtitle}>
                Based on best effort{racePrediction.best.distanceKm > 0 ? ` (${racePrediction.best.distanceKm.toFixed(1)} km)` : ""} · CTL {Math.round(racePrediction.ctl)}
              </Text>
              <View style={styles.raceModalRows}>
                {racePrediction.allPredictions.map(({ label, km, time }, idx) => (
                  <View
                    key={km}
                    style={[styles.raceModalRow, idx === racePrediction.allPredictions.length - 1 && styles.raceModalRowLast]}
                  >
                    <Text style={styles.raceModalRowLabel}>{label}</Text>
                    <View style={styles.raceModalRowRight}>
                      <Text style={[styles.raceModalRowTime, typography.mono]}>{formatRaceTime(time)}</Text>
                      <Text style={styles.raceModalRowPace}>{formatPace(time, km)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}

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
            <Text style={styles.dayCardTitle} numberOfLines={2}>{day.title}</Text>
            {day.distance > 0 ? (
              <>
                <Text style={[styles.dayCardDistance, typography.mono]}>{day.distance} km</Text>
                <Text style={styles.dayCardDetail}>@ planned pace</Text>
                <Text style={styles.dayCardDetail}>{day.detail}</Text>
              </>
            ) : (
              <Text style={styles.dayRestCentered}>💤{"\n"}Rest</Text>
            )}
            <View style={styles.dayZoneBar}>
              <View
                style={[
                  styles.dayZoneFill,
                  {
                    width: "100%",
                    backgroundColor:
                      day.type === "interval"
                        ? theme.accentRed
                        : day.type === "tempo"
                        ? theme.accentBlue
                        : day.type === "easy" || day.type === "recovery"
                        ? theme.accentGreen
                        : theme.textMuted,
                  },
                ]}
              />
            </View>
          </View>
        ))}
      </ScrollView>
      </ScreenContainer>
    </View>
  );
};
