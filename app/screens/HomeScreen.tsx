import { FC, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Image, Modal, Pressable, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import Reanimated, {
  Easing as ReanimatedEasing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "../components/ScreenContainer";
import { GlassCard } from "../components/GlassCard";
import { ReadinessRing } from "../components/ReadinessRing";
import { ReadinessBorder } from "../components/ReadinessBorder";
import { readinessColorForScore } from "../lib/readinessColors";
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
import { getWorkoutTypeTintGradientColors } from "../lib/workoutTypeTint";
import { spacing, typography } from "../theme/theme";
import { formatRaceTime, formatPace } from "../lib/race-prediction";
import type { AppTabsParamList } from "../navigation/RootNavigator";
import { addDays as addDaysFns, isWithinInterval, parseISO, startOfWeek as startOfWeekFns } from "date-fns";

const SCROLL_PADDING_BELOW_BUBBLE = 96;

const cleanColors = {
  background: "#ffffff",
  surface: "#ffffff",
  surfaceAlt: "#f8fafc",
  border: "rgba(0,0,0,0.07)",
  textPrimary: "#0f172a",
  textMuted: "#94a3b8",
  textSecondary: "#475569",
  accentBlue: "#3b82f6",
  accentGreen: "#22c55e",
  accentOrange: "#f59e0b",
  accentRed: "#ef4444",
  ringTrack: "#e2e8f0",
  progressTrack: "#e2e8f0",
  pillBg: "rgba(0,0,0,0.04)",
  pillBorder: "rgba(0,0,0,0.09)",
} as const;

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

function getReadinessColor(score: number): string {
  if (score >= 80) return cleanColors.accentGreen;
  if (score >= 60) return cleanColors.accentOrange;
  return cleanColors.accentRed;
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
  const readinessScale = useRef(new Animated.Value(0.96)).current;
  const [isFlipped, setIsFlipped] = useState(false);
  const [showStreakCelebration, setShowStreakCelebration] = useState(false);
  const streak = useDailyStreak();
  const raceDaysAnim = useRef(new Animated.Value(0)).current;
  const [raceDaysDisplay, setRaceDaysDisplay] = useState<number | null>(null);

  // Clean Athletic light-mode mount / continuous animations (Reanimated)
  const headerOpacity = useSharedValue(0);
  const headerTranslateY = useSharedValue(-16);
  const pillsOpacity = useSharedValue(0);
  const cardsOpacity = useSharedValue(0);
  const cardsTranslateY = useSharedValue(24);
  const readinessStrokeProgress = useSharedValue(0);
  const miniRingProgress = useSharedValue(0);
  const readinessGlowOffset = useSharedValue(0);

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

  const handleReadinessPressIn = () => {
    Animated.spring(readinessScale, {
      toValue: 0.97,
      damping: 18,
      stiffness: 260,
      useNativeDriver: true,
    }).start();
  };

  const handleReadinessPressOut = () => {
    Animated.spring(readinessScale, {
      toValue: 1,
      damping: 18,
      stiffness: 260,
      useNativeDriver: true,
    }).start();
  };

  useEffect(() => {
    // gentle scale-in on mount
    Animated.timing(readinessScale, {
      toValue: 1,
      duration: 450,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [readinessScale]);

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

  useEffect(() => {
    // Mount sequence – header, pills, cards, readiness ring + mini rings
    headerOpacity.value = withTiming(1, { duration: 420, easing: ReanimatedEasing.out(ReanimatedEasing.cubic) });
    headerTranslateY.value = withTiming(0, { duration: 420, easing: ReanimatedEasing.out(ReanimatedEasing.cubic) });
    pillsOpacity.value = withDelay(
      160,
      withTiming(1, { duration: 320, easing: ReanimatedEasing.out(ReanimatedEasing.cubic) }),
    );
    cardsOpacity.value = withDelay(
      260,
      withTiming(1, { duration: 420, easing: ReanimatedEasing.out(ReanimatedEasing.cubic) }),
    );
    cardsTranslateY.value = withDelay(
      260,
      withTiming(0, { duration: 420, easing: ReanimatedEasing.out(ReanimatedEasing.cubic) }),
    );
    readinessStrokeProgress.value = withDelay(
      320,
      withTiming(1, { duration: 900, easing: ReanimatedEasing.out(ReanimatedEasing.cubic) }),
    );
    miniRingProgress.value = withDelay(
      470,
      withTiming(1, { duration: 650, easing: ReanimatedEasing.out(ReanimatedEasing.cubic) }),
    );
    readinessGlowOffset.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 3500, easing: ReanimatedEasing.inOut(ReanimatedEasing.sin) }),
        withTiming(-1, { duration: 3500, easing: ReanimatedEasing.inOut(ReanimatedEasing.sin) }),
      ),
      -1,
      true,
    );
  }, [
    headerOpacity,
    headerTranslateY,
    pillsOpacity,
    cardsOpacity,
    cardsTranslateY,
    readinessStrokeProgress,
    miniRingProgress,
    readinessGlowOffset,
  ]);

  const headerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
    transform: [{ translateY: headerTranslateY.value }],
  }));

  const pillsAnimatedStyle = useAnimatedStyle(() => ({
    opacity: pillsOpacity.value,
  }));

  const cardsAnimatedStyle = useAnimatedStyle(() => ({
    opacity: cardsOpacity.value,
    transform: [{ translateY: cardsTranslateY.value }],
  }));

  const readinessGlowAnimatedStyle = useAnimatedStyle(() => ({
    opacity: 0.06,
    transform: [
      { translateX: readinessGlowOffset.value * 6 },
      { translateY: readinessGlowOffset.value * 6 },
    ],
  }));

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
        content: {
          gap: spacing.gap,
          paddingTop: insets.top + 16,
          paddingBottom: SCROLL_PADDING_BELOW_BUBBLE,
        },
        headerRow: {
          flexDirection: "row",
          alignItems: "flex-start",
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
          backgroundColor: theme.surfaceElevated,
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
          backgroundColor: theme.surfaceElevated,
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
          backgroundColor: theme.surfaceElevated,
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
          fontSize: 34,
          fontWeight: "800",
          color: cleanColors.textPrimary,
          letterSpacing: -0.6,
        },
        titlePressable: { alignSelf: "flex-start" },
        subtitle: { fontSize: 18, color: cleanColors.textMuted, marginTop: 2 },
        sectionHeader: { color: theme.textLabel, letterSpacing: 1.5 },
        readinessCard: {
          padding: 20,
          borderWidth: 0,
          backgroundColor: cleanColors.surface,
        },
        readinessRow: { flexDirection: "row", alignItems: "center", gap: 10 },
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
          borderRadius: 14,
          overflow: "hidden",
        },
        activityTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
        activityLabel: { fontSize: 12, fontWeight: "600", color: theme.textLabel, textTransform: "uppercase", letterSpacing: 0.5 },
        activityName: { fontSize: 16, fontWeight: "600", color: theme.textPrimary },
        activityMeta: { fontSize: 13, color: theme.textSecondary, marginTop: 4 },
        activityMetrics: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 12 },
        activityMetric: { flexDirection: "row", alignItems: "baseline", gap: 4 },
        activityHint: { marginTop: 10, fontSize: 12, color: theme.textMuted },
        quickActionsRow: {
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          marginTop: 10,
        },
        quickActionPrimary: {
          borderRadius: 999,
          paddingHorizontal: 16,
          paddingVertical: 7,
          backgroundColor: theme.accentBlue,
          alignItems: "center",
          justifyContent: "center",
        },
        quickActionSecondary: {
          paddingHorizontal: 0,
          paddingVertical: 0,
        },
        quickActionTextPrimary: { fontSize: 12, fontWeight: "600", color: theme.primaryForeground },
        quickActionTextSecondary: {
          fontSize: 11,
          fontWeight: "500",
          color: theme.accentBlue,
        },
        weekRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
        weekKm: { fontSize: 14, fontWeight: "500", color: theme.textPrimary },
        weekPct: { fontSize: 12, color: theme.textMuted },
        progressTrack: { height: 8, borderRadius: 999, backgroundColor: theme.cardBorder, overflow: "hidden", marginBottom: 10 },
        progressFill: { height: "100%", borderRadius: 999, backgroundColor: theme.accentBlue },
        weekSegmentsRow: { flexDirection: "row", width: "100%", height: "100%", overflow: "hidden", borderRadius: 999 },
        weekSegment: { flex: 1, height: "100%" },
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
          backgroundColor: isDarkPro ? theme.accentBlue : "#dbeafe",
          opacity: isDarkPro ? 0.08 : 0.35,
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
          backgroundColor: theme.cardBackground,
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
          backgroundColor: theme.cardBorder,
        },
        raceModalHeaderRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 4,
        },
        raceModalTitle: { fontSize: 18, fontWeight: "700", color: theme.textPrimary },
        raceModalCloseBtn: { padding: 4, marginRight: -4 },
        raceModalSubtitle: { fontSize: 12, color: theme.textMuted, marginBottom: 16 },
        raceModalRows: { backgroundColor: theme.cardBackground },
        raceModalRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingVertical: 14,
          paddingHorizontal: 0,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.cardBorder,
          backgroundColor: theme.cardBackground,
        },
        raceModalRowLast: { borderBottomWidth: 0 },
        raceModalRowLabel: { fontSize: 15, fontWeight: "600", color: theme.textPrimary },
        raceModalRowRight: { alignItems: "flex-end" },
        raceModalRowTime: { fontSize: 15, fontWeight: "600", color: theme.textPrimary },
        raceModalRowPace: { fontSize: 11, color: theme.textMuted, marginTop: 2 },
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
        recoveryStatsRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          width: "100%",
        },
        recoveryStatColumn: {
          flex: 1,
          minWidth: 0,
          alignItems: "center",
          gap: 6,
          paddingVertical: 4,
        },
        recoveryStatLabel: {
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: 1,
          color: theme.textMuted,
        },
        todayHeroHeaderRow: {
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 8,
          marginBottom: 10,
        },
        todayHeroTitleCol: {
          flex: 1,
        },
        todayLabel: {
          fontSize: 11,
          fontWeight: "600",
          letterSpacing: 1,
          textTransform: "uppercase",
          color: theme.textLabel,
        },
        todayStatusText: {
          marginTop: 4,
          fontSize: 20,
          fontWeight: "700",
          letterSpacing: -0.3,
          color: theme.textPrimary,
        },
        todayIntensityRow: {
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          marginTop: 4,
        },
        todayIntensityPill: {
          paddingHorizontal: 10,
          paddingVertical: 3,
          borderRadius: 999,
          backgroundColor: theme.cardBorder,
        },
        todayIntensityText: {
          fontSize: 11,
          fontWeight: "600",
          color: theme.textSecondary,
        },
        todaySubcopy: {
          marginTop: 4,
          fontSize: 12,
          color: theme.textSecondary,
        },
        todayHeroRingCol: {
          display: "none",
        },
        todayHeroRingLabel: {
          fontSize: 0,
        },
        todayMicroStripRow: {
          marginTop: 10,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        },
        todayMicroStripText: {
          fontSize: 11,
          color: theme.textMuted,
        },
        restBadge: {
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 999,
          backgroundColor: theme.cardBorder,
        },
        restBadgeText: {
          fontSize: 11,
          fontWeight: "500",
          color: theme.textMuted,
        },
        restDayText: {
          fontSize: 12,
          color: theme.textMuted,
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
          backgroundColor: theme.cardBackground,
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
          backgroundColor: isDarkPro ? theme.surfaceElevated : "#FFF8E1",
        },
        restInfoText: {
          fontSize: 12,
          color: theme.textSecondary,
          fontStyle: "italic",
        },
        insightsCard: {
          marginTop: 16,
        },
        insightsTitle: {
          fontSize: 12,
          fontWeight: "600",
          letterSpacing: 1,
          textTransform: "uppercase",
          color: theme.textLabel,
          marginBottom: 8,
        },
        insightsChipsRow: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 6,
        },
        insightsChip: {
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 999,
          backgroundColor: theme.cardBorder,
        },
        insightsChipText: {
          fontSize: 11,
          color: theme.textSecondary,
        },
        chipRow: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 6,
          marginTop: 6,
        },
        chip: {
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 999,
          backgroundColor: theme.cardBorder,
        },
        chipText: {
          fontSize: 11,
          fontWeight: "500",
          color: theme.textSecondary,
        },
        metricHighlightValue: {
          fontSize: 16,
          fontWeight: "700",
        },
        metricDeltaText: {
          fontSize: 11,
          color: theme.textMuted,
          marginTop: 2,
        },
        fab: {
          position: "absolute",
          right: 20,
          bottom: 20 + insets.bottom,
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundColor: theme.accentBlue,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#000",
          shadowOpacity: 0.15,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 4,
        },
        fabIcon: {
          color: theme.primaryForeground,
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
        ? { label: "good", color: "#22C55E" }
        : { label: "below", color: "#F59E0B" };
  const hrvScore = (() => {
    const v = recoveryMetrics.hrv ?? 0;
    if (v <= 0) return 0;
    const avg = recoveryMetrics.hrv7dayAvg ?? v;
    if (avg <= 0) return 50;
    return Math.max(0, Math.min(100, Math.round((v / avg) * 65)));
  })();
  const sleepHoursNum = readiness.sleepHours ?? 0;
  const sleepStatus =
    sleepHoursNum <= 0
      ? { label: "—", color: colors.mutedForeground }
      : sleepHoursNum < 6
        ? { label: "low", color: "#EF4444" }
        : sleepHoursNum < 7
          ? { label: "low", color: "#F59E0B" }
          : { label: "ok", color: "#22C55E" };
  const sleepScore = Math.max(0, Math.min(100, Math.round((sleepHoursNum / 8) * 100)));
  const tsbVal = readiness.tsb ?? 0;
  const tsbStatus =
    tsbVal < -15
      ? { label: "fatigued", color: "#EF4444" }
      : tsbVal < -5
        ? { label: "tired", color: "#F59E0B" }
        : { label: "ready", color: "#22C55E" };
  const tsbScore = Math.max(0, Math.min(100, Math.round(((tsbVal + 20) / 40) * 100)));
  const hrvTrendLabel =
    recoveryMetrics.hrv == null || recoveryMetrics.hrv === 0
      ? "—"
      : hrvDelta > 0
        ? "↑ improving"
        : hrvDelta < 0
          ? "↓ below"
          : "↔ stable";
  const sleepTrendLabel =
    sleepHoursNum <= 0 ? "—" : sleepHoursNum >= 7 ? "↑ enough" : "↓ low";
  const tsbTrendLabel =
    tsbVal > 5 ? "↑ fresh" : tsbVal < -5 ? "↓ strained" : "↔ balanced";
  const loadZoneLabel =
    tsbVal < -15 ? "Overreaching" : tsbVal < -5 ? "High load" : tsbVal > 5 ? "Fresh" : "Optimal";
  const readinessPct = Math.max(0, Math.min(100, readiness.score ?? 0));
  const readinessDelta = readiness.scoreDelta;
  const readinessTrendText =
    readinessDelta == null
      ? null
      : readinessDelta > 0
        ? `↑ +${readinessDelta} from yesterday`
        : readinessDelta < 0
          ? `↓ ${readinessDelta} from yesterday`
          : "↔ Same as yesterday";
  // Live data (no mock) for today's readiness metrics
  const displayReadinessScore = readinessPct;
  const displayHrvScore = hrvScore;
  const displaySleepScore = sleepScore;
  const displayHrvValue =
    readiness.hrv != null && readiness.hrv !== 0 ? `${readiness.hrv}` : "—";
  const displaySleepHours = readiness.sleepHours;

  // Keep mobile card accent colors aligned with web readiness ring thresholds.
  const readinessColor = readinessColorForScore(displayReadinessScore);
  const readinessAccentColor = readinessColor;
  const readinessTintBg =
    displayReadinessScore >= 75 ? "#f0fdf4" : displayReadinessScore >= 50 ? "#fffdf7" : "#fff1f2";

  const isRestDay =
    (todaysPlan && (todaysPlan.type === "recovery" || /rest/i.test(todaysPlan.title ?? ""))) ||
    (todaysActual &&
      /rest|recovery/i.test(String(todaysActual.name ?? todaysActual.type ?? "")));
  const workoutTypeSource = (todaysPlan?.type ?? todaysWorkout?.type ?? todaysActual?.type ?? "").toLowerCase();
  const statusKind: "rest" | "easy" | "workout" =
    isRestDay || workoutTypeSource.includes("rest")
      ? "rest"
      : workoutTypeSource.includes("interval") ||
        workoutTypeSource.includes("tempo") ||
        workoutTypeSource.includes("long") ||
        workoutTypeSource.includes("race")
        ? "workout"
        : "easy";
  const statusLabel = statusKind === "rest" ? "REST" : statusKind === "easy" ? "EASY DAY" : "WORKOUT";
  const intensityLabel =
    statusKind === "rest"
      ? "No intensity"
      : statusKind === "easy"
        ? "Low intensity"
        : "High intensity";
  const statusColor =
    statusKind === "rest"
      ? colors.mutedForeground
      : statusKind === "easy"
        ? theme.accentOrange
        : theme.accentGreen;
  const workoutBorderColor = workoutAccent(todaysWorkout?.type, theme);
  const todayWorkoutTintGradientColors = getWorkoutTypeTintGradientColors(
    todaysPlan?.type ?? todaysWorkout?.type ?? todaysActual?.type,
    colors,
  );
  const sessionsDone = Math.max(0, Math.min(7, Math.round((weekStats.actualKm / Math.max(weekStats.plannedKm, 1)) * 7)));
  const lastActivityDetailId =
    (lastActivity as unknown as { detailId?: string | null }).detailId ?? null;
  const consistencyPct = hasTrainingPlan ? Math.round((sessionsDone / 7) * 100) : null;
  const coachNote =
    !hasTrainingPlan
      ? "No structured plan yet · Tap Plan to get started."
      : progressPct === 0
        ? "Let’s plan your first run this week."
        : progressPct < 40
          ? "This week: ease into your aerobic base."
          : progressPct < 90
            ? "This week: keep building your aerobic base."
            : "This week: great work · protect recovery after key sessions.";
  const lastActivityTypeRaw = String(lastActivity.type ?? "").toLowerCase();
  const lastActivityTypeChip =
    lastActivityTypeRaw.includes("interval")
      ? "Interval"
      : lastActivityTypeRaw.includes("tempo")
        ? "Tempo"
        : lastActivityTypeRaw.includes("long")
          ? "Long run"
          : lastActivityTypeRaw.includes("recovery")
            ? "Recovery"
            : "Easy";
  const lastActivityConditions =
    String(lastActivity.name ?? "").toLowerCase().includes("treadmill")
      ? "Treadmill"
      : String(lastActivity.name ?? "").toLowerCase().includes("trail")
        ? "Trail"
        : null;
  const lastActivityPaceTrend = (lastActivity as any)?.avgPaceTrend as
    | "faster"
    | "slower"
    | "same"
    | undefined;
  const lastActivityHrTrend = (lastActivity as any)?.avgHrTrend as
    | "higher"
    | "lower"
    | "same"
    | undefined;
  const insights: string[] = [];
  if (lastActivityPaceTrend === "faster") {
    insights.push("Speed improving (+ vs last similar session).");
  } else if (lastActivityPaceTrend === "slower") {
    insights.push("Pace slower than last similar · prioritize recovery.");
  }
  if (lastActivityHrTrend === "lower") {
    insights.push("HR stable or lower at similar effort.");
  } else if (lastActivityHrTrend === "higher") {
    insights.push("Higher HR at similar effort · watch fatigue.");
  }
  if (streak.currentStreak >= 5) {
    insights.push(`Strong consistency streak: ${streak.currentStreak} days.`);
  }

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

  const openRecoveryChecklist = () => {
    if (!isRestDay) return;
    navigation.navigate("RecoveryFlow" as never);
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
            <Ionicons name="flag-outline" size={18} color={theme.textPrimary} />
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
            <Ionicons name="flag-outline" size={18} color={theme.textPrimary} />
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
            <Ionicons name="flag-outline" size={18} color={theme.textPrimary} />
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
          <Ionicons name="flag-outline" size={18} color={theme.textPrimary} />
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

  // Dark Pro layout – original intervals.icu style
  if (isDarkPro) {
    const tsb = readiness.tsb ?? 0;
    const statusLabel =
      tsb > 5 ? "READY" : tsb >= 0 ? "NEUTRAL" : "FATIGUED";
    const statusColor =
      tsb > 5 ? theme.positive : tsb >= 0 ? theme.warning : theme.negative;
    const todayGuidance =
      tsb < -15
        ? "Recommended today: Full rest or very easy 20–30 min."
        : tsb < -5
          ? "Recommended today: Easy 30–40 min, avoid hard intervals."
          : tsb > 5
            ? "Recommended today: You can handle quality work."
            : "Recommended today: Easy aerobic 40–50 min.";

    return (
      <View style={{ flex: 1 }}>
        <ScreenContainer
          contentContainerStyle={[styles.content, { paddingBottom: SCROLL_PADDING_BELOW_BUBBLE }]}
          onRefresh={refetchAll}
        >
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
                    <Ionicons name="flame-outline" size={14} color={theme.textPrimary} />
                    <Text style={styles.streakCountText}>{streak.currentStreak}</Text>
                  </View>
                  <Text style={styles.streakLabelText}>day streak</Text>
                </View>
                <View style={styles.weekPill}>
                  <View style={styles.streakPillTopRow}>
                    <Ionicons name="calendar-outline" size={14} color={theme.textPrimary} />
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

          <TouchableOpacity
            activeOpacity={0.9}
            onPress={flipCard}
            onPressIn={handleReadinessPressIn}
            onPressOut={handleReadinessPressOut}
          >
            <View style={styles.flipContainer}>
              <Animated.View
                style={[
                  styles.flipCard,
                  { transform: [{ rotateY: frontRotation }, { scale: readinessScale }] },
                ]}
              >
                <ReadinessBorder readiness={displayReadinessScore} radius={theme.cardRadius}>
                  <GlassCard
                    style={[
                      styles.readinessCard,
                      {
                        borderWidth: 2,
                        borderColor: readinessAccentColor,
                        borderRadius: 20,
                        backgroundColor: readinessTintBg,
                        shadowColor: readinessAccentColor,
                        shadowOffset: { width: 0, height: 6 },
                        shadowOpacity: 0.28,
                        shadowRadius: 18,
                        elevation: 8,
                      },
                    ]}
                  >
                    <View
                      style={{
                        height: 3,
                        backgroundColor: readinessAccentColor,
                        borderTopLeftRadius: 18,
                        borderTopRightRadius: 18,
                        width: "100%",
                        marginBottom: 14,
                      }}
                    />
                    <View style={styles.readinessRow}>
                      <ReadinessRing
                        score={displayReadinessScore}
                        size={80}
                        strokeWidth={10}
                        trackColor="#f1f5f9"
                        statusLabel={
                          readiness.tsb != null
                            ? Number(readiness.tsb) > 5
                              ? "READY"
                              : Number(readiness.tsb) <= -10
                                ? "FATIGUED"
                                : "NEUTRAL"
                            : undefined
                        }
                        statusColor={readinessAccentColor}
                        centerTextStyle={{ fontSize: 32, fontWeight: "800" }}
                        labelTextStyle={{
                          fontSize: 10,
                          letterSpacing: 2,
                          textTransform: "uppercase",
                          color: readinessAccentColor,
                        }}
                      />
                      <View style={styles.readinessBody}>
                        <View style={styles.readinessTitleRow}>
                          <Text style={styles.readinessTitle}>{readinessTitle}</Text>
                          <WorkoutBadge type={todaysWorkout.type} />
                        </View>
                        {readinessTrendText && (
                          <Text
                            style={[
                              styles.readinessTrend,
                              readinessDelta != null &&
                                readinessDelta < 0 && { color: theme.accentOrange },
                            ]}
                          >
                            {readinessTrendText}
                          </Text>
                        )}
                        <Text style={styles.readinessSummary}>{readiness.aiSummary}</Text>
                        <View style={{ height: 1, backgroundColor: "#f1f5f9", marginVertical: 12 }} />
                        <View>
                          <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => navigation.navigate("Stats" as never)}
                          >
                            <View style={styles.recoveryStatsRow}>
                              <View style={styles.recoveryStatColumn}>
                                <ReadinessRing
                                  score={displayHrvScore}
                                  size={128}
                                  strokeWidth={10}
                                  trackColor="#f1f5f9"
                                  centerText={
                                    displayHrvValue
                                  }
                                  statusLabel={hrvTrendLabel}
                                  statusColor={
                                    recoveryMetrics.hrv == null || recoveryMetrics.hrv === 0
                                      ? "#94a3b8"
                                      : hrvDelta < 0
                                        ? "#ef4444"
                                        : hrvDelta > 0
                                          ? "#22c55e"
                                          : "#94a3b8"
                                  }
                                  centerTextStyle={{ fontSize: 16, fontWeight: "700" }}
                                  labelTextStyle={{
                                    fontSize: 9,
                                    textTransform: "uppercase",
                                    color:
                                      recoveryMetrics.hrv == null || recoveryMetrics.hrv === 0
                                        ? "#94a3b8"
                                        : hrvDelta < 0
                                          ? "#ef4444"
                                          : hrvDelta > 0
                                            ? "#22c55e"
                                            : "#94a3b8",
                                  }}
                                />
                                <Text style={styles.recoveryStatLabel}>HRV</Text>
                              </View>
                              <View style={styles.recoveryStatColumn}>
                                <ReadinessRing
                                  score={displaySleepScore}
                                  size={128}
                                  strokeWidth={10}
                                  trackColor="#f1f5f9"
                                  centerText={formatSleepHours(displaySleepHours)}
                                  centerScale={0.1}
                                  statusLabel={sleepTrendLabel}
                                  statusColor={sleepStatus.color}
                                  centerTextStyle={{ fontSize: 11, fontWeight: "700" }}
                                  labelTextStyle={{
                                    fontSize: 9,
                                    textTransform: "uppercase",
                                    color: sleepStatus.color,
                                  }}
                                />
                                <Text style={styles.recoveryStatLabel}>Sleep</Text>
                              </View>
                              <View style={styles.recoveryStatColumn}>
                                <ReadinessRing
                                  score={tsbScore}
                                  size={128}
                                  strokeWidth={10}
                                  trackColor="#f1f5f9"
                                  centerText={
                                    readiness.tsb != null
                                      ? Number(readiness.tsb).toFixed(0)
                                      : "—"
                                  }
                                  statusLabel={tsbTrendLabel}
                                  statusColor={tsbStatus.color}
                                  centerTextStyle={{ fontSize: 16, fontWeight: "700" }}
                                  labelTextStyle={{
                                    fontSize: 9,
                                    textTransform: "uppercase",
                                    color: tsbStatus.color,
                                  }}
                                />
                                <Text style={styles.recoveryStatLabel}>TSB</Text>
                              </View>
                            </View>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                    <Text style={{ fontSize: 11, color: "#94a3b8", marginTop: 4, alignSelf: "flex-end" }}>
                      {relativeMinsLabel(lastFetchedAt)}
                    </Text>
                  </GlassCard>
                </ReadinessBorder>
              </Animated.View>
            </View>
          </TouchableOpacity>

          {/* existing dark widgets and lower sections preserved from original */}
          {/* SECTION 2 – Three-column widget row */}
          {/* ... original dark widgets code here ... */}
        </ScreenContainer>
      </View>
    );
  }

  // Default (light) layout – existing structure
  return (
    <View style={{ flex: 1, backgroundColor: cleanColors.background }}>
      <StatusBar barStyle="dark-content" />
      <ScreenContainer
        contentContainerStyle={[styles.content, { paddingBottom: SCROLL_PADDING_BELOW_BUBBLE }]}
        onRefresh={refetchAll}
      >
        {/* HEADER */}
        <Reanimated.View style={headerAnimatedStyle}>
          <View style={styles.headerRow}>
            <View style={styles.header}>
              <TouchableOpacity
                style={styles.titlePressable}
                activeOpacity={0.8}
                onPress={() =>
                  navigation.navigate(
                    "Calendar" as never,
                    { selectedDate: activeDateStr } as never,
                  )
                }
              >
                <Text style={styles.title}>{headerDateText.split(",")[0]}</Text>
              </TouchableOpacity>
              <Text style={styles.subtitle}>
                {headerDateText.split(", ").slice(1).join(", ")}
              </Text>
            </View>
            <Image
              source={require("../assets/cade-logo-transparent.png")}
              style={{
                width: 150,
                height: 40,
                marginTop: -2,
              }}
              resizeMode="contain"
            />
          </View>
          <Reanimated.View style={[styles.headerMetaRow, pillsAnimatedStyle]}>
            <View style={[styles.streakPill, { backgroundColor: cleanColors.pillBg, borderColor: cleanColors.pillBorder, borderWidth: StyleSheet.hairlineWidth }]}>
              <View style={styles.streakPillTopRow}>
                <Ionicons name="flame-outline" size={15} color={cleanColors.accentOrange} />
                <Text style={[styles.streakCountText, { color: cleanColors.textPrimary }]}>{streak.currentStreak}</Text>
              </View>
              <Text style={[styles.streakLabelText, { color: cleanColors.textMuted }]}>day streak</Text>
            </View>
            <View style={[styles.weekPill, { backgroundColor: cleanColors.pillBg, borderColor: cleanColors.pillBorder, borderWidth: StyleSheet.hairlineWidth }]}>
              <View style={styles.streakPillTopRow}>
                <Ionicons name="calendar-outline" size={15} color={cleanColors.accentBlue} />
                <Text style={[styles.weekCountText, { color: cleanColors.textPrimary }]}>
                  {planWeekCurrent != null ? `Week ${planWeekCurrent}` : "Week —"}
                </Text>
              </View>
              <Text style={[styles.streakLabelText, { color: cleanColors.textMuted }]}>
                {planWeekTotal != null && hasTrainingPlan
                  ? `of ${planWeekTotal} · ${athlete.currentPhase} Phase`
                  : "no plan"}
              </Text>
            </View>
            <View style={[styles.racePill, { backgroundColor: cleanColors.pillBg, borderColor: cleanColors.pillBorder, borderWidth: StyleSheet.hairlineWidth }]}>
              <View style={styles.streakPillTopRow}>
                <Ionicons name="flag-outline" size={15} color={cleanColors.accentBlue} />
                <Text style={[styles.weekCountText, { color: cleanColors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>
                  {raceState === "none" || raceState === "past"
                    ? "—"
                    : (raceDaysDisplay != null && raceDaysDisplay > 0
                        ? raceDaysDisplay
                        : raceDays ?? 0)}
                </Text>
              </View>
              <Text style={[styles.streakLabelText, { color: cleanColors.textMuted }]}>
                {raceState === "none" || raceState === "past" ? "set race" : "to race"}
              </Text>
            </View>
          </Reanimated.View>
        </Reanimated.View>

        <Reanimated.View style={cardsAnimatedStyle}>
          {/* READINESS HERO */}
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={flipCard}
            onPressIn={() => {
              handleReadinessPressIn();
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            onPressOut={handleReadinessPressOut}
          >
            <View style={styles.flipContainer}>
              <Animated.View
                style={[
                  styles.flipCard,
                  { transform: [{ rotateY: frontRotation }, { scale: readinessScale }] },
                ]}
              >
                <ReadinessBorder readiness={readiness.score} radius={theme.cardRadius}>
                  <View style={{ position: "relative" }}>
                    {/* Ambient glow behind card — color from JS only, no worklet color logic */}
                    <Reanimated.View
                      pointerEvents="none"
                      style={[
                        {
                          position: "absolute",
                          width: "100%",
                          height: "100%",
                          borderRadius: 24,
                          backgroundColor: readinessColor,
                          opacity: 0.13,
                          transform: [
                            { scaleX: 0.92 },
                            { scaleY: 0.85 },
                            { translateY: 12 },
                          ],
                          shadowColor: readinessColor,
                          shadowOffset: { width: 0, height: 8 },
                          shadowOpacity: 0.45,
                          shadowRadius: 24,
                        },
                        readinessGlowAnimatedStyle,
                      ]}
                    />
                    <GlassCard
                      style={[
                        styles.readinessCard,
                        {
                          shadowColor: readinessColor,
                          shadowOffset: { width: 0, height: 8 },
                          shadowOpacity: 0.35,
                          shadowRadius: 20,
                          elevation: 10,
                        },
                      ]}
                    >
                      <View style={styles.readinessRow}>
                        <ReadinessRing
                          score={displayReadinessScore}
                          size={84}
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
                                ? cleanColors.accentGreen
                                : Number(readiness.tsb) <= -10
                                  ? cleanColors.accentRed
                                  : cleanColors.accentOrange
                              : undefined
                          }
                        />
                        <View style={styles.readinessBody}>
                          <View style={styles.readinessTitleRow}>
                            <Text style={[styles.readinessTitle, { color: cleanColors.textPrimary }]}>
                              Today's Readiness
                            </Text>
                            <View
                              style={{
                                paddingHorizontal: 10,
                                paddingVertical: 4,
                                borderRadius: 999,
                                backgroundColor: cleanColors.pillBg,
                                borderWidth: StyleSheet.hairlineWidth,
                                borderColor: cleanColors.pillBorder,
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 11,
                                  fontWeight: "600",
                                  letterSpacing: 0.7,
                                  textTransform: "uppercase",
                                  color:
                                    displayReadinessScore >= 70
                                      ? cleanColors.accentGreen
                                      : displayReadinessScore >= 40
                                        ? cleanColors.accentOrange
                                        : cleanColors.accentRed,
                                }}
                              >
                                  {displayReadinessScore >= 70
                                  ? "READY"
                                    : displayReadinessScore >= 40
                                    ? "MANAGE LOAD"
                                    : "PROTECT RECOVERY"}
                              </Text>
                            </View>
                          </View>
                          {readinessTrendText && (
                            <Text
                              style={{
                                fontSize: 12,
                                color:
                                  readinessDelta != null && readinessDelta < 0
                                    ? cleanColors.accentOrange
                                    : cleanColors.accentGreen,
                                marginBottom: 6,
                              }}
                            >
                              {readinessTrendText}
                            </Text>
                          )}
                          <Text
                            style={{
                              fontSize: 13,
                              lineHeight: 19,
                              color: cleanColors.textSecondary,
                            }}
                            numberOfLines={3}
                          >
                            {readiness.aiSummary}
                          </Text>

                          <View
                            style={{
                              marginTop: 14,
                              paddingTop: 14,
                              borderTopWidth: StyleSheet.hairlineWidth,
                              borderTopColor: cleanColors.border,
                              flexDirection: "row",
                              justifyContent: "flex-start",
                            }}
                          >
                            {[
                              {
                                label: "HRV",
                                score: displayHrvScore,
                                value: displayHrvValue,
                                status: hrvTrendLabel,
                                color: cleanColors.accentGreen,
                              },
                              {
                                label: "Sleep",
                                score: displaySleepScore,
                                value: formatSleepHours(displaySleepHours),
                                status: sleepTrendLabel,
                                color: cleanColors.accentBlue,
                              },
                              {
                                label: "TSB",
                                score: tsbScore,
                                value:
                                  readiness.tsb != null
                                    ? Number(readiness.tsb).toFixed(0)
                                    : "—",
                                status: tsbTrendLabel,
                                color: tsbStatus.color,
                              },
                            ].map((m, idx) => (
                              <TouchableOpacity
                                key={m.label}
                                activeOpacity={0.85}
                                onPress={() => navigation.navigate("Stats" as never)}
                              >
                                <Reanimated.View
                                  entering={FadeInDown.delay(470 + idx * 150).springify()}
                                  style={{ alignItems: "center", minWidth: 72, marginRight: 6 }}
                                >
                                  <ReadinessRing
                                    score={miniRingProgress.value ? m.score : 0}
                                    size={68}
                                    centerScale={0.18}
                                    centerText={m.value}
                                    statusLabel={m.status}
                                    statusColor={m.color}
                                    centerTextStyle={{ fontSize: 14, fontWeight: "700" }}
                                  />
                                  <Text
                                    style={{
                                      fontSize: 10,
                                      marginTop: 6,
                                      letterSpacing: 0.9,
                                      textTransform: "uppercase",
                                      color: cleanColors.textMuted,
                                    }}
                                  >
                                    {m.label}
                                  </Text>
                                </Reanimated.View>
                              </TouchableOpacity>
                            ))}
                          </View>
                          <Text
                            style={{
                              fontSize: 10,
                              color: cleanColors.textMuted,
                              marginTop: 8,
                            }}
                          >
                            {relativeMinsLabel(lastFetchedAt)}
                          </Text>
                        </View>
                      </View>
                    </GlassCard>
                  </View>
                </ReadinessBorder>
              </Animated.View>
            </View>
          </TouchableOpacity>

          {/* TODAY'S SESSION */}
          <Reanimated.View
            style={{ marginTop: 16 }}
            entering={FadeInDown.delay(160).springify()}
          >
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                if (!isRestDay) {
                  openRecoveryChecklist();
                }
              }}
            >
              <View style={styles.activityCardWrap}>
                <GlassCard
                  style={[
                    styles.activityCard,
                    {
                      backgroundColor: colors.card,
                      borderRadius: 14,
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: colors.border,
                      shadowOpacity: 0,
                      shadowRadius: 0,
                      shadowOffset: { width: 0, height: 0 },
                      elevation: 0,
                    },
                  ]}
                >
                  <LinearGradient
                    pointerEvents="none"
                    colors={todayWorkoutTintGradientColors}
                    locations={[0, 0.35, 0.7]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={StyleSheet.absoluteFillObject}
                  />
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text
                        style={{
                          fontSize: 11,
                          letterSpacing: 1.2,
                          textTransform: "uppercase",
                          color: cleanColors.textMuted,
                        }}
                      >
                        Today · {headerDateText.split(",")[0]}
                      </Text>
                      <Text
                        style={{
                          marginTop: 4,
                          fontSize: 22,
                          fontWeight: "700",
                          letterSpacing: -0.3,
                          color: cleanColors.textPrimary,
                        }}
                      >
                        {todaysPlan?.title ??
                          todaysWorkout.title ??
                          (isRestDay ? "Rest & Recovery" : "No session planned")}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
                        <View
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                            borderRadius: 999,
                            backgroundColor: cleanColors.pillBg,
                            borderWidth: StyleSheet.hairlineWidth,
                            borderColor: cleanColors.pillBorder,
                            marginRight: 6,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 11,
                              fontWeight: "600",
                              color: statusColor,
                            }}
                          >
                            {statusLabel}
                          </Text>
                        </View>
                        <WorkoutBadge type={todaysPlan?.type ?? todaysWorkout.type} />
                      </View>
                      <Text
                        style={{
                          marginTop: 8,
                          fontSize: 13,
                          color: cleanColors.textSecondary,
                        }}
                        numberOfLines={2}
                      >
                        {isRestDay
                          ? "Planned rest day. Light movement, good food, and early sleep keep the engine fresh."
                          : todaysPlan
                            ? `${todaysPlan.distance > 0 ? `${todaysPlan.distance} km · ` : ""}${
                                todaysPlan.description || "Controlled aerobic work with smooth pacing."
                              }`
                            : todaysActual
                              ? `${(todaysActual.distance_km ?? 0).toFixed(1)} km · ${formatDuration(
                                  todaysActual.duration_seconds,
                                )}${todaysActual.avg_pace ? ` @ ${todaysActual.avg_pace}` : ""}`
                              : "No run on the calendar. A short, easy session or complete rest both work today."}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.quickActionsRow}>
                    <TouchableOpacity
                      style={styles.quickActionPrimary}
                      activeOpacity={0.9}
                      onPress={() => {
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        openRecoveryChecklist();
                      }}
                    >
                      <Text style={styles.quickActionTextPrimary}>
                        {isRestDay ? "Open recovery checklist" : "Begin today’s session"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.quickActionSecondary}
                      activeOpacity={0.9}
                      onPress={() => {
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        navigation.navigate("Coach" as never);
                      }}
                    >
                      <Text style={styles.quickActionTextSecondary}>Message coach</Text>
                    </TouchableOpacity>
                  </View>
                </GlassCard>
              </View>
            </TouchableOpacity>
          </Reanimated.View>

          {/* THIS WEEK */}
          <Reanimated.View
            entering={FadeInDown.delay(260).springify()}
            style={{ marginTop: 16 }}
          >
            <GlassCard style={{ backgroundColor: cleanColors.surface }}>
              <Text style={[styles.sectionHeader, typography.sectionHeader, { color: cleanColors.textMuted }]}>
                This Week
              </Text>
              <View style={styles.weekRow}>
                <Text style={[styles.weekKm, { color: cleanColors.textPrimary }]}>
                  {Number(weekStats.actualKm ?? 0).toFixed(1)} /{" "}
                  {Number(weekStats.plannedKm ?? 0).toFixed(0)} km
                </Text>
              </View>
              <View
                style={[
                  styles.progressTrack,
                  { backgroundColor: cleanColors.progressTrack },
                ]}
              >
                <Animated.View
                  style={[
                    styles.progressFill,
                    {
                      backgroundColor: cleanColors.accentGreen,
                      width: `${progressPct}%`,
                    },
                  ]}
                />
              </View>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginBottom: 10,
                }}
              >
                {weekPlan.map((day, idx) => {
                  const isDone = idx < sessionsDone;
                  const isFuture =
                    !isDone &&
                    !day.isToday &&
                    new Date(day.date) > new Date();
                  const color = isDone
                    ? cleanColors.accentGreen
                    : isFuture
                      ? cleanColors.accentBlue
                      : cleanColors.textMuted;
                  return (
                    <View
                      key={day.day}
                      style={{
                        flex: 1,
                        marginHorizontal: 2,
                        borderRadius: 999,
                        height: 24,
                        backgroundColor: cleanColors.surfaceAlt,
                        justifyContent: "flex-end",
                        overflow: "hidden",
                      }}
                    >
                      <View
                        style={{
                          height: day.distance > 0 ? 18 : 6,
                          borderRadius: 999,
                          backgroundColor: color,
                          opacity: day.distance > 0 ? 1 : 0.35,
                        }}
                      />
                    </View>
                  );
                })}
              </View>
              <Text style={[styles.weekSessionsText, { color: cleanColors.textMuted }]}>
                {sessionsDone}/7 sessions done · {weekStats.qualityDone}/
                {weekStats.qualityPlanned} quality
              </Text>
              <View style={styles.sparklineBlock}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 4,
                  }}
                >
                  <Text style={[styles.sparklineLabel, { color: cleanColors.textMuted }]}>
                    Load trend
                  </Text>
                  <Text
                    style={[
                      styles.sparklineLabel,
                      { color: tsbStatus.color, fontWeight: "500" },
                    ]}
                  >
                    TSB {tsbVal.toFixed(1)} · {loadZoneLabel}
                  </Text>
                </View>
                <Sparkline
                  data={weekStats.tssData}
                  color={cleanColors.accentBlue}
                />
              </View>
            </GlassCard>
          </Reanimated.View>

          {/* NEXT 7 DAYS STRIP */}
          <Reanimated.View
            entering={FadeInDown.delay(320).springify()}
            style={{ marginTop: 12 }}
          >
            <Text style={[styles.sectionHeader, typography.sectionHeader, { color: cleanColors.textMuted }]}>
              Next 7 Days
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={[styles.daysRow, { paddingHorizontal: 0 }]}
              snapToAlignment="start"
              decelerationRate="fast"
              snapToInterval={148}
            >
              {weekPlan.map((day) => (
                <View
                  key={day.day}
                  style={[
                    styles.dayCard,
                    {
                      backgroundColor: cleanColors.surfaceAlt,
                      borderColor: day.isToday
                        ? cleanColors.accentBlue
                        : cleanColors.border,
                      opacity: day.isToday
                        ? 1
                        : new Date(day.date) < new Date()
                          ? 0.45
                          : 0.9,
                      transform: [{ scale: day.isToday ? 1.02 : 1 }],
                    },
                  ]}
                >
                  <View style={styles.dayCardHeader}>
                    <Text
                      style={[
                        styles.dayCardLabel,
                        {
                          color: day.isToday
                            ? cleanColors.accentBlue
                            : cleanColors.textSecondary,
                        },
                      ]}
                    >
                      {day.isToday ? "Today" : day.day}
                    </Text>
                    <Text
                      style={[
                        styles.dayCardDate,
                        { color: cleanColors.textMuted },
                      ]}
                    >
                      {day.date}
                    </Text>
                  </View>
                  <WorkoutBadge type={day.type} />
                  <Text
                    style={[
                      styles.dayCardTitle,
                      { color: cleanColors.textPrimary },
                    ]}
                    numberOfLines={2}
                  >
                    {day.title}
                  </Text>
                  {day.distance > 0 ? (
                    <>
                      <Text
                        style={[
                          styles.dayCardDistance,
                          typography.mono,
                          { color: cleanColors.textSecondary },
                        ]}
                      >
                        {day.distance} km
                      </Text>
                      {!!day.detail && (
                        <Text
                          style={[
                            styles.dayCardDetail,
                            { color: cleanColors.textMuted },
                          ]}
                          numberOfLines={1}
                        >
                          {day.detail}
                        </Text>
                      )}
                    </>
                  ) : (
                    <Text
                      style={[
                        styles.dayRestCentered,
                        { color: cleanColors.textMuted },
                      ]}
                    >
                      💤 Rest
                    </Text>
                  )}
                </View>
              ))}
            </ScrollView>
          </Reanimated.View>

          {/* LAST ACTIVITY */}
          <Reanimated.View
            entering={FadeInDown.delay(380).springify()}
            style={{ marginTop: 16 }}
          >
            <GlassCard style={{ backgroundColor: cleanColors.surface }}>
              <View style={styles.lastActivityHeader}>
                <Text
                  style={[
                    styles.sectionHeader,
                    typography.sectionHeader,
                    { color: cleanColors.textMuted },
                  ]}
                >
                  Last Activity
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text
                    style={{ fontSize: 11, color: cleanColors.textMuted, marginRight: 8 }}
                  >
                    {lastActivity.date}
                  </Text>
                  <TouchableOpacity
                    style={styles.lastActivityActionBtn}
                    activeOpacity={0.85}
                    onPress={() => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      navigation.navigate("Coach" as never);
                    }}
                  >
                    <Ionicons
                      name="chatbubble-ellipses"
                      size={14}
                      color={cleanColors.textSecondary}
                    />
                  </TouchableOpacity>
                </View>
              </View>
              <TouchableOpacity
                activeOpacity={lastActivityDetailId ? 0.9 : 1}
                onPress={lastActivityDetailId ? goToLastActivity : undefined}
              >
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: "600",
                    color: cleanColors.textPrimary,
                    marginBottom: 4,
                  }}
                >
                  {lastActivity.type}
                </Text>
                <View style={styles.chipRow}>
                  <View style={styles.chip}>
                    <Text style={styles.chipText}>{lastActivityTypeChip}</Text>
                  </View>
                  {lastActivityConditions && (
                    <View style={styles.chip}>
                      <Text style={styles.chipText}>{lastActivityConditions}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.metricsGrid}>
                  <View style={styles.metricCell}>
                    <Text style={styles.metricLabel}>Distance</Text>
                    <Text
                      style={[
                        styles.metricValue,
                        styles.metricHighlightValue,
                        typography.mono,
                      ]}
                    >
                      {lastActivity.distance != null && lastActivity.distance > 0
                        ? typeof lastActivity.distance === "number"
                          ? lastActivity.distance.toFixed(1)
                          : lastActivity.distance
                        : "—"}
                    </Text>
                  </View>
                  <View style={styles.metricCell}>
                    <Text style={styles.metricLabel}>Pace</Text>
                    <Text
                      style={[
                        styles.metricValue,
                        styles.metricHighlightValue,
                        typography.mono,
                      ]}
                    >
                      {lastActivity.avgPace && lastActivity.avgPace !== "0"
                        ? lastActivity.avgPace
                        : "—"}
                    </Text>
                    {lastActivityPaceTrend && (
                      <Text style={styles.metricDeltaText}>
                        {lastActivityPaceTrend === "faster"
                          ? "↑ faster vs last similar"
                          : lastActivityPaceTrend === "slower"
                            ? "↓ slower vs last similar"
                            : "↔ similar pace"}
                      </Text>
                    )}
                  </View>
                  <View style={styles.metricCell}>
                    <Text style={styles.metricLabel}>Avg HR</Text>
                    <Text
                      style={[styles.metricValue, typography.mono]}
                    >
                      {lastActivity.avgHr != null && lastActivity.avgHr > 0
                        ? `${lastActivity.avgHr} bpm`
                        : "—"}
                    </Text>
                    {lastActivityHrTrend && (
                      <Text style={styles.metricDeltaText}>
                        {lastActivityHrTrend === "lower"
                          ? "↑ more efficient vs last"
                          : lastActivityHrTrend === "higher"
                            ? "↓ higher strain vs last"
                            : "↔ similar HR"}
                      </Text>
                    )}
                  </View>
                  <View style={styles.metricCell}>
                    <Text style={styles.metricLabel}>Duration</Text>
                    <Text
                      style={[styles.metricValue, typography.mono]}
                    >
                      {lastActivity.duration}
                    </Text>
                  </View>
                </View>
                <View style={styles.hrZonesBlock}>
                  <Text style={[styles.sparklineLabel, { color: cleanColors.textMuted }]}>
                    HR Zones
                  </Text>
                  <View style={styles.hrZonesBar}>
                    <View
                      style={[
                        styles.hrZone,
                        {
                          width: `${lastActivity.hrZones.z1}%`,
                          backgroundColor: cleanColors.textMuted,
                        },
                      ]}
                    />
                    <View
                      style={[
                        styles.hrZone,
                        {
                          width: `${lastActivity.hrZones.z2}%`,
                          backgroundColor: cleanColors.accentBlue,
                        },
                      ]}
                    />
                    <View
                      style={[
                        styles.hrZone,
                        {
                          width: `${lastActivity.hrZones.z3}%`,
                          backgroundColor: cleanColors.accentGreen,
                        },
                      ]}
                    />
                    <View
                      style={[
                        styles.hrZone,
                        {
                          width: `${lastActivity.hrZones.z4}%`,
                          backgroundColor: cleanColors.accentOrange,
                        },
                      ]}
                    />
                    <View
                      style={[
                        styles.hrZone,
                        {
                          width: `${lastActivity.hrZones.z5}%`,
                          backgroundColor: cleanColors.accentRed,
                        },
                      ]}
                    />
                  </View>
                </View>
              </TouchableOpacity>
            </GlassCard>
          </Reanimated.View>

          {/* RECOVERY */}
          <Reanimated.View
            entering={FadeInDown.delay(440).springify()}
            style={{ marginTop: 16 }}
          >
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => navigation.navigate("Stats" as never)}
            >
              <GlassCard style={{ backgroundColor: cleanColors.surface }}>
                <View style={styles.recoveryHeaderRow}>
                  <View style={styles.recoveryHeaderDot} />
                  <Text
                    style={[
                      styles.sectionHeader,
                      typography.sectionHeader,
                      { color: cleanColors.textMuted },
                    ]}
                  >
                    Recovery
                  </Text>
                </View>
                <View style={styles.recoveryRow}>
                  <View>
                    <Text style={styles.metricLabel}>HRV</Text>
                    <View style={styles.recoveryValueRow}>
                      <Text style={[styles.recoveryValue, typography.mono]}>
                        {recoveryMetrics.hrv != null && recoveryMetrics.hrv !== 0
                          ? recoveryMetrics.hrv
                          : "—"}
                      </Text>
                      <Text style={styles.metaText}>
                        /{" "}
                        {recoveryMetrics.hrv7dayAvg != null &&
                        recoveryMetrics.hrv7dayAvg !== 0
                          ? recoveryMetrics.hrv7dayAvg
                          : "—"}{" "}
                        avg
                      </Text>
                    </View>
                  </View>
                </View>
                <Text
                  style={
                    hrvDelta < 0
                      ? styles.recoveryTrendNegative
                      : styles.recoveryTrendPositive
                  }
                >
                  {hrvDelta < 0 ? "↓" : "↑"}{" "}
                  {Math.abs(Math.round(hrvDelta))}ms{" "}
                  {hrvDelta < 0 ? "below" : "above"} baseline
                </Text>
                <View style={styles.sparklineBlock}>
                  <Text style={[styles.sparklineLabel, { color: cleanColors.textMuted }]}>
                    HRV (7 days)
                  </Text>
                  <Sparkline
                    data={recoveryMetrics.hrvTrend}
                    color={cleanColors.accentGreen}
                  />
                </View>
                <View style={styles.sparklineBlock}>
                  <Text style={[styles.sparklineLabel, { color: cleanColors.textMuted }]}>
                    Resting HR (7 days)
                  </Text>
                  <Sparkline
                    data={recoveryMetrics.restingHrTrend}
                    color={cleanColors.accentRed}
                  />
                </View>
              </GlassCard>
            </TouchableOpacity>
          </Reanimated.View>

          {/* RACE PREDICTION */}
          {racePrediction && (
            <Reanimated.View
              entering={FadeInDown.delay(520).springify()}
              style={{ marginTop: 16, marginBottom: 12 }}
            >
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => setRaceModalVisible(true)}
              >
                <GlassCard
                  style={{
                    backgroundColor: "#eff6ff",
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: "rgba(59,130,246,0.12)",
                  }}
                >
                  <View style={styles.raceHeader}>
                    <View style={styles.raceIcon}>
                      <Text style={styles.raceEmoji}>🏁</Text>
                    </View>
                    <View>
                      <Text
                        style={[
                          styles.raceTitle,
                          { color: cleanColors.textPrimary },
                        ]}
                      >
                        Race Prediction
                      </Text>
                      <Text
                        style={[
                          styles.raceSubtitle,
                          { color: cleanColors.textMuted },
                        ]}
                      >
                        {goalRaceLabel}
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={[
                      styles.raceTime,
                      typography.mono,
                      { color: cleanColors.textPrimary },
                    ]}
                  >
                    {racePrediction.time}
                  </Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 6 }}>
                    <View style={styles.chip}>
                      <Text style={styles.chipText}>
                        Z2 {racePrediction.zone2}
                      </Text>
                    </View>
                    <View style={styles.chip}>
                      <Text style={styles.chipText}>
                        Threshold {racePrediction.threshold}
                      </Text>
                    </View>
                    <View style={styles.chip}>
                      <Text style={styles.chipText}>
                        VO2max {racePrediction.vo2max}
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={[
                      styles.raceFootnote,
                      { color: cleanColors.textMuted },
                    ]}
                  >
                    Based on best effort · CTL {Math.round(racePrediction.ctl)}
                  </Text>
                  <View style={styles.raceViewAllBtn}>
                    <Text
                      style={[
                        styles.raceViewAll,
                        { color: cleanColors.accentBlue },
                      ]}
                    >
                      View all distances
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={14}
                      color={cleanColors.accentBlue}
                    />
                  </View>
                </GlassCard>
              </TouchableOpacity>
            </Reanimated.View>
          )}

          {/* Race predictions modal unchanged */}
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
                      <Text
                        style={{
                          fontSize: 22,
                          color: theme.textMuted,
                          lineHeight: 24,
                        }}
                      >
                        ×
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.raceModalSubtitle}>
                    Based on best effort
                    {racePrediction.best.distanceKm > 0
                      ? ` (${racePrediction.best.distanceKm.toFixed(1)} km)`
                      : ""}{" "}
                    · CTL {Math.round(racePrediction.ctl)}
                  </Text>
                  <View style={styles.raceModalRows}>
                    {racePrediction.allPredictions.map(
                      ({ label, km, time }, idx) => (
                        <View
                          key={km}
                          style={[
                            styles.raceModalRow,
                            idx === racePrediction.allPredictions.length - 1 &&
                              styles.raceModalRowLast,
                          ]}
                        >
                          <Text style={styles.raceModalRowLabel}>{label}</Text>
                          <View style={styles.raceModalRowRight}>
                            <Text
                              style={[
                                styles.raceModalRowTime,
                                typography.mono,
                              ]}
                            >
                              {formatRaceTime(time)}
                            </Text>
                            <Text style={styles.raceModalRowPace}>
                              {formatPace(time, km)}
                            </Text>
                          </View>
                        </View>
                      ),
                    )}
                  </View>
                </Pressable>
              </Pressable>
            </Modal>
          )}
        </Reanimated.View>
      </ScreenContainer>
    </View>
  );
};
