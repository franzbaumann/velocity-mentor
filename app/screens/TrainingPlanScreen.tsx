import { FC, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Image,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "../components/ScreenContainer";
import { GlassCard } from "../components/GlassCard";
import { useTheme } from "../context/ThemeContext";
import { typography } from "../theme/theme";
import type { PlanStackParamList } from "../navigation/RootNavigator";
import { useTrainingPlan, TrainingPlanSession } from "../hooks/useTrainingPlan";
import { SessionCard } from "../components/plan/SessionCard";
import { DraggableSessionList } from "../components/plan/DraggableSessionList";
import { SessionDetailModal } from "../components/plan/SessionDetailModal";
import { SkeletonCard, SkeletonLine } from "../components/Skeleton";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PlanOnboardingOverlay, SpotlightRect } from "../components/plan/PlanOnboardingOverlay";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  differenceInCalendarDays,
  isWithinInterval,
  parseISO,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";

const SCROLL_PADDING_BELOW_BUBBLE = 120;
const WEEK_COLUMN_WIDTH = Dimensions.get("window").width * 0.82;
const WEEK_COLUMN_GAP = 12;

type ViewMode = "list" | "calendar";

function formatKm(km: number | null | undefined): string {
  if (km == null || !isFinite(km)) return "--";
  const v = Math.round(km * 10) / 10;
  return `${v} km`;
}

function formatMin(min: number | null | undefined): string {
  if (min == null || !isFinite(min)) return "--";
  return `${Math.round(min)} min`;
}

export const TrainingPlanScreen: FC = () => {
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<PlanStackParamList>>();
  const { plan, isLoading, isRefetching, rescheduleSession, markSessionDone, isMarkingDone, isNutritionLoading } =
    useTrainingPlan();
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(new Set([1]));
  const [selectedSession, setSelectedSession] = useState<TrainingPlanSession | null>(null);
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [movingSession, setMovingSession] = useState<TrainingPlanSession | null>(null);
  const [weekSessionOrder, setWeekSessionOrder] = useState<Record<string, string[]>>({});
  const weekScrollRef = useRef<ScrollView | null>(null);
  const containerRef = useRef<View>(null);
  const scrollAreaRef = useRef<View>(null);
  const [onboardingStep, setOnboardingStep] = useState<1 | 2 | 3 | null>(null);
  const [onboardingCompleting, setOnboardingCompleting] = useState(false);
  const [scrollAreaRect, setScrollAreaRect] = useState<SpotlightRect | null>(null);
  const onboardingStepRef = useRef<1 | 2 | 3 | null>(null);
  onboardingStepRef.current = onboardingStep;
  const scrollBaselineRef = useRef<number | null>(null);
  const styles = useMemo(
    () =>
      StyleSheet.create({
        content: { gap: 8, paddingBottom: 24, backgroundColor: "#f9fafb" },
        title: { fontSize: 22, fontWeight: "600", color: colors.foreground },
        subtitle: { fontSize: 14, color: colors.mutedForeground, marginTop: 4 },
        countdownBadge: {
          borderRadius: 999,
          paddingHorizontal: 14,
          paddingVertical: 6,
          backgroundColor: colors.muted,
        },
        countdownText: { fontSize: 12, fontWeight: "600", color: colors.mutedForeground },
        sectionHeader: { color: colors.mutedForeground },
        body: { fontSize: 14, color: colors.mutedForeground, lineHeight: 20 },
        weekHeaderButton: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingVertical: 14,
          paddingHorizontal: 16,
        },
        weekHeaderLeft: {
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          flex: 1,
        },
        chevron: {
          fontSize: 14,
          color: colors.mutedForeground,
          width: 16,
        },
        weekTitle: {
          fontSize: 15,
          fontWeight: "600",
          color: colors.foreground,
        },
        weekPhase: {
          fontSize: 11,
          fontWeight: "500",
          color: colors.primary,
          backgroundColor: colors.primary + "15",
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 999,
          overflow: "hidden",
          textTransform: "capitalize",
        },
        weekDateRange: {
          fontSize: 12,
          color: colors.mutedForeground,
        },
        weekMeta: {
          fontSize: 12,
          color: colors.mutedForeground,
        },
        weekColumnsContainer: {
          paddingTop: 4,
          paddingBottom: 8,
        },
        weekColumnCard: {
          padding: 0,
          overflow: "hidden",
          width: WEEK_COLUMN_WIDTH,
          marginRight: WEEK_COLUMN_GAP,
        },
        weekSessions: {
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 12,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
        },
        thisWeekRow: {
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        },
        thisWeekCircle: {
          width: 56,
          height: 56,
          borderRadius: 28,
          borderWidth: 2,
          borderColor: colors.primary,
          alignItems: "center",
          justifyContent: "center",
        },
        thisWeekCircleText: {
          fontSize: 16,
          fontWeight: "700",
          color: colors.primary,
        },
        thisWeekLabel: {
          fontSize: 14,
          color: colors.mutedForeground,
        },
        thisWeekLoadTrack: {
          marginTop: 10,
          height: 8,
          borderRadius: 999,
          overflow: "hidden",
          backgroundColor: colors.border,
        },
        thisWeekLoadFill: {
          height: "100%",
          borderRadius: 999,
          backgroundColor: colors.primary,
        },
        thisWeekLoadLabel: {
          marginTop: 6,
          fontSize: 11,
          color: colors.mutedForeground,
        },
        onTrackBadge: {
          marginTop: 8,
          alignSelf: "flex-start",
          borderRadius: 999,
          paddingHorizontal: 10,
          paddingVertical: 4,
          backgroundColor: "#22c55e22",
        },
        onTrackText: { fontSize: 11, fontWeight: "700", color: "#16a34a" },
        rebuildCard: {
          marginTop: 4,
        },
        rebuildRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        },
        rebuildTitle: {
          fontSize: 15,
          fontWeight: "500",
          color: colors.foreground,
        },
        rebuildSubtitle: {
          fontSize: 13,
          color: colors.mutedForeground,
          marginTop: 2,
        },
        rebuildButton: {
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderRadius: 999,
          backgroundColor: colors.primary,
        },
        rebuildButtonText: {
          fontSize: 14,
          fontWeight: "600",
          color: colors.primaryForeground,
        },
        toggleRow: {
          flexDirection: "row",
          alignItems: "center",
          borderRadius: 14,
          padding: 3,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          marginTop: 0,
        },
        toggleButton: {
          flex: 1,
          borderRadius: 11,
          paddingVertical: 8,
          alignItems: "center",
          justifyContent: "center",
        },
        toggleButtonActive: {
          backgroundColor: colors.muted,
        },
        toggleText: {
          fontSize: 12,
          fontWeight: "500",
          color: colors.mutedForeground,
        },
        toggleTextActive: {
          color: colors.foreground,
          fontWeight: "600",
        },
        calendarHeaderRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 12,
          marginBottom: 8,
        },
        calendarMonth: {
          fontSize: 15,
          fontWeight: "600",
          color: colors.foreground,
        },
        calendarNav: {
          paddingHorizontal: 8,
          paddingVertical: 4,
        },
        calendarWeekdayRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: 4,
        },
        calendarWeekday: {
          flex: 1,
          textAlign: "center",
          fontSize: 10,
          fontWeight: "500",
          color: colors.mutedForeground,
        },
        calendarGrid: {
          flexDirection: "row",
          flexWrap: "wrap",
          marginHorizontal: -4,
        },
        calendarDayCell: {
          width: `${100 / 7}%`,
          paddingHorizontal: 4,
          paddingVertical: 6,
        },
        calendarDayBox: {
          borderRadius: 12,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          padding: 6,
          minHeight: 72,
        },
        calendarDayLabel: {
          fontSize: 11,
          marginBottom: 4,
        },
        calendarDayLabelToday: {
          color: colors.primary,
          fontWeight: "600",
        },
        calendarSessionPill: {
          borderRadius: 999,
          paddingHorizontal: 6,
          paddingVertical: 2,
          marginBottom: 4,
        },
        calendarSessionText: {
          fontSize: 10,
        },
      }),
    [colors]
  );

  const toggleWeek = useCallback((n: number) => {
    setExpandedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  }, []);

  const handleRebuildPlan = useCallback(() => {
    navigation.navigate("PlanOnboarding", { mode: "rebuild" });
  }, [navigation]);

  const handleAskKipcoachee = useCallback(
    (session: TrainingPlanSession) => {
      if (!plan?.plan) return;
      const weeks = plan.weeks ?? [];
      const parentNav = navigation.getParent();
      if (!parentNav) return;

      const sessionWeek = weeks.find((w) =>
        w.sessions.some((s) => s.id === session.id),
      );
      const weekNum = sessionWeek?.week_number ?? "?";
      const planName =
        plan.plan.plan_name ??
        plan.plan.philosophy ??
        "training plan";

      const details = [
        session.distance_km != null && `${session.distance_km}km`,
        session.duration_min != null && `${session.duration_min}min`,
        session.pace_target && `@${session.pace_target}`,
      ]
        .filter(Boolean)
        .join(" · ");

      const visibleMsg = `${session.description}${
        details ? ` (${details})` : ""
      }`;
      const hiddenMeta = JSON.stringify({
        fromPlan: true,
        planName,
        weekNumber: weekNum,
        sessionType: session.session_type,
        description: session.description,
        distanceKm: session.distance_km,
        durationMin: session.duration_min,
        paceTarget: session.pace_target,
        hrZone: session.target_hr_zone,
        adjustmentNotes: session.adjustment_notes ?? null,
      });

      parentNav.navigate(
        "Coach" as never,
        {
          from: "plan",
          session: encodeURIComponent(visibleMsg),
          planMeta: encodeURIComponent(hiddenMeta),
        } as never,
      );
    },
    [navigation, plan],
  );

  const weeks = plan?.weeks ?? [];
  const today = new Date();

  // Seed local ordering when weeks change.
  useEffect(() => {
    if (!weeks.length) return;
    setWeekSessionOrder((prev) => {
      const next = { ...prev };
      for (const w of weeks) {
        if (!next[w.id]) {
          next[w.id] = w.sessions.map((s) => s.id);
        }
      }
      return next;
    });
  }, [weeks]);

  const getOrderedSessions = useCallback(
    (week: (typeof weeks)[number]): TrainingPlanSession[] => {
      const order = weekSessionOrder[week.id];
      if (!order) return week.sessions;
      const byId = new Map<string, TrainingPlanSession>();
      for (const s of week.sessions) byId.set(s.id, s);
      const ordered: TrainingPlanSession[] = [];
      for (const id of order) {
        const s = byId.get(id);
        if (s) ordered.push(s);
      }
      // Fallback: include any new sessions not in order yet
      if (ordered.length !== week.sessions.length) {
        for (const s of week.sessions) {
          if (!order.includes(s.id)) ordered.push(s);
        }
      }
      return ordered;
    },
    [weekSessionOrder, weeks],
  );

  const thisWeekData = useMemo(() => {
    const mon = startOfWeek(today, { weekStartsOn: 0 });
    const sun = endOfWeek(today, { weekStartsOn: 0 });
    const week = weeks.find((w) => {
      const start = parseISO(w.start_date);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return isWithinInterval(today, { start, end });
    });
    if (!week) return null;
    const sessions = week.sessions;
    const doneCount = sessions.filter((s) => !!s.completed_at).length;
    const plannedKm = sessions.reduce(
      (sum, s) => sum + (s.distance_km ?? 0),
      0,
    );
    return {
      sessions,
      doneCount,
      plannedKm,
      rangeLabel: `${format(mon, "MMM d")} – ${format(sun, "MMM d")}`,
    };
  }, [weeks, today]);

  const currentWeekIndex = useMemo(() => {
    if (!weeks.length) return -1;
    return weeks.findIndex((w) => {
      const start = parseISO(w.start_date);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return isWithinInterval(today, { start, end });
    });
  }, [weeks, today]);

  const raceDateRaw = plan?.plan?.goal_date || plan?.plan?.race_date || null;
  const raceDate = raceDateRaw ? new Date(raceDateRaw) : null;
  const daysToRace = raceDate ? Math.max(0, differenceInCalendarDays(raceDate, new Date())) : null;
  const planDisplayName =
    plan?.plan?.goal_race ??
    plan?.plan?.plan_name ??
    plan?.plan?.race_type ??
    plan?.plan?.philosophy ??
    "Training plan";
  const raceSubtitle = raceDate
    ? `${planDisplayName} · ${format(raceDate, "MMM d, yyyy")}`
    : planDisplayName;

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [currentMonth]);

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, TrainingPlanSession[]>();
    for (const w of weeks) {
      for (const s of w.sessions) {
        if (!s.scheduled_date) continue;
        const key = s.scheduled_date.slice(0, 10);
        const list = map.get(key) ?? [];
        list.push(s);
        map.set(key, list);
      }
    }
    return map;
  }, [weeks]);

  const completedSessionsByDate = useMemo(() => {
    const map = new Map<string, TrainingPlanSession[]>();
    for (const w of weeks) {
      for (const s of w.sessions) {
        if (!s.completed_at) continue;
        const key = s.completed_at.slice(0, 10);
        const list = map.get(key) ?? [];
        list.push(s);
        map.set(key, list);
      }
    }
    return map;
  }, [weeks]);

  const planStartDate = plan?.plan?.start_date ? parseISO(plan.plan.start_date) : null;
  const planEndDate = plan?.plan?.end_date ? parseISO(plan.plan.end_date) : null;

  const isDayWithinPlan = useCallback(
    (day: Date) => {
      if (!planStartDate || !planEndDate) return true;
      return isWithinInterval(day, { start: planStartDate, end: planEndDate });
    },
    [planStartDate, planEndDate],
  );

  const getSessionTypeColor = useCallback(
    (sessionType: string) => {
      const t = sessionType.toLowerCase();
      if (t.includes("easy") || t.includes("recovery")) return colors.accentGreen;
      if (t.includes("tempo") || t.includes("threshold")) return colors.accentBlue;
      if (t.includes("interval") || t.includes("repeat") || t.includes("fartlek")) return colors.negative;
      if (t.includes("long")) return colors.warning;
      if (t.includes("rest") || t.includes("off")) return colors.mutedForeground;
      if (t.includes("race") || t.includes("tt")) return "#a855f7";
      return colors.accentBlue;
    },
    [colors],
  );

  const handleCalendarDayPress = useCallback(
    (day: Date) => {
      if (!movingSession) return;
      if (!isDayWithinPlan(day)) return;
      const newDate = format(day, "yyyy-MM-dd");
      rescheduleSession({ sessionId: movingSession.id, newDate });
      setMovingSession(null);
    },
    [isDayWithinPlan, movingSession, rescheduleSession],
  );

  const openSeason = useCallback(() => {
    navigation.navigate("Season");
  }, [navigation]);

  useEffect(() => {
    if (viewMode !== "list") return;
    if (currentWeekIndex == null || currentWeekIndex < 0) return;
    const x = currentWeekIndex * (WEEK_COLUMN_WIDTH + WEEK_COLUMN_GAP);
    weekScrollRef.current?.scrollTo({ x, y: 0, animated: false });
  }, [viewMode, currentWeekIndex]);

  // ── Plan onboarding tutorial ──────────────────────────────
  const hasPlan = !!plan?.plan;
  useEffect(() => {
    if (!hasPlan) return;
    AsyncStorage.getItem("onboarding_plan_v1").then((v) => {
      if (v !== "done") setOnboardingStep(1);
    });
  }, [hasPlan]);

  const handleScrollAreaLayout = useCallback(() => {
    requestAnimationFrame(() => {
      containerRef.current?.measureInWindow((cx: number, cy: number) => {
        scrollAreaRef.current?.measureInWindow(
          (sx: number, sy: number, sw: number, sh: number) => {
            if (sw > 0 && sh > 0) {
              setScrollAreaRect({ x: sx - cx, y: sy - cy, w: sw, h: sh });
            }
          },
        );
      });
    });
  }, []);

  const handleWeekScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (onboardingStepRef.current !== 1) return;
      const x = e.nativeEvent.contentOffset.x;
      if (scrollBaselineRef.current === null) {
        scrollBaselineRef.current = x;
        return;
      }
      if (Math.abs(x - scrollBaselineRef.current) >= 80) {
        setOnboardingStep(2);
        scrollBaselineRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    if (onboardingStepRef.current === 3 && selectedSession && !onboardingCompleting) {
      setOnboardingCompleting(true);
    }
  }, [selectedSession, onboardingCompleting]);

  const handleOnboardingDone = useCallback(() => {
    setOnboardingStep(null);
    setOnboardingCompleting(false);
    AsyncStorage.setItem("onboarding_plan_v1", "done");
  }, []);

  const onboardingSpotlight = useMemo((): SpotlightRect | null => {
    if (!scrollAreaRect || !onboardingStep) return null;
    if (onboardingStep === 1) return scrollAreaRect;
    return {
      x: scrollAreaRect.x + 16,
      y: scrollAreaRect.y + 55,
      w: WEEK_COLUMN_WIDTH - 32,
      h: 130,
    };
  }, [scrollAreaRect, onboardingStep]);
  // ── End onboarding ────────────────────────────────────────

  const handleWeekReorder = useCallback(
    (weekId: string, fromIndex: number, toIndex: number) => {
      const week = weeks.find((w) => w.id === weekId);
      if (!week) return;
      const ordered = getOrderedSessions(week);
      if (
        fromIndex < 0 ||
        fromIndex >= ordered.length ||
        toIndex < 0 ||
        toIndex >= ordered.length
      ) {
        return;
      }
      const source = ordered[fromIndex];
      const target = ordered[toIndex];
      if (!target?.scheduled_date) return;
      const newDate = target.scheduled_date.slice(0, 10);

      setWeekSessionOrder((prev) => {
        const currentIds =
          prev[weekId] ?? week.sessions.map((s) => s.id);
        const nextIds = currentIds.slice();
        const [moved] = nextIds.splice(fromIndex, 1);
        nextIds.splice(toIndex, 0, moved);
        return { ...prev, [weekId]: nextIds };
      });

      rescheduleSession({ sessionId: source.id, newDate });
      if (onboardingStepRef.current === 2) setOnboardingStep(3);
    },
    [weeks, getOrderedSessions, rescheduleSession],
  );


  // Only show the blocking skeleton while the very first plan load is happening.
  // Background refetches (e.g. after marking sessions done or generating coach notes)
  // should keep showing the current plan to avoid jarring flashes.
  if (isLoading && !plan?.plan) {
    return (
      <ScreenContainer
        contentContainerStyle={[styles.content, { paddingBottom: SCROLL_PADDING_BELOW_BUBBLE }]}
      >
        <Text style={styles.title}>Training plan</Text>
        <SkeletonCard>
          <SkeletonLine width="35%" />
          <SkeletonLine width="70%" style={{ marginTop: 12 }} />
          <SkeletonLine width="100%" style={{ marginTop: 12, height: 70, borderRadius: 12 }} />
        </SkeletonCard>
        <SkeletonCard>
          <SkeletonLine width="25%" />
          <SkeletonLine width="90%" style={{ marginTop: 10 }} />
          <SkeletonLine width="80%" style={{ marginTop: 10 }} />
        </SkeletonCard>
      </ScreenContainer>
    );
  }

  if (!plan?.plan) {
    return (
      <ScreenContainer
        contentContainerStyle={[styles.content, { paddingBottom: SCROLL_PADDING_BELOW_BUBBLE }]}
      >
        <View
          style={{
            alignItems: "flex-end",
            marginBottom: 8,
          }}
        >
          <TouchableOpacity
            onPress={openSeason}
            activeOpacity={0.8}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingVertical: 8,
              paddingHorizontal: 12,
              minHeight: 48,
            }}
          >
            <Image
              source={require("../assets/cade-runner-blue.png")}
              style={{ width: 22, height: 22, tintColor: "#2563eb" }}
            />
            <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>Season</Text>
          </TouchableOpacity>
        </View>
        <GlassCard>
          <Text style={[styles.sectionHeader, typography.sectionHeader]}>No plan yet</Text>
          <Text style={[styles.body, { marginTop: 8 }]}>
            Complete onboarding with Kipcoachee or rebuild your plan to get a personalized block.
          </Text>
          <TouchableOpacity
            onPress={handleRebuildPlan}
            activeOpacity={0.85}
            style={[styles.rebuildButton, { marginTop: 16, alignSelf: "flex-start" }]}
          >
            <Text style={styles.rebuildButtonText}>Get started</Text>
          </TouchableOpacity>
        </GlassCard>
      </ScreenContainer>
    );
  }

  return (
    <View ref={containerRef} style={{ flex: 1 }}>
    <ScreenContainer
      contentContainerStyle={[styles.content, { paddingBottom: SCROLL_PADDING_BELOW_BUBBLE }]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
        {raceDate && (
          <View style={styles.countdownBadge}>
            <Text style={styles.countdownText}>
              {format(raceDate, "MMM d")} · {planDisplayName}
            </Text>
          </View>
        )}
        {daysToRace != null && (
          <View style={styles.countdownBadge}>
            <Text style={styles.countdownText}>{daysToRace} days to race</Text>
          </View>
        )}
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <TouchableOpacity
            onPress={openSeason}
            activeOpacity={0.8}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingVertical: 8,
              paddingHorizontal: 12,
              minHeight: 48,
            }}
          >
            <Image
              source={require("../assets/cade-runner-blue.png")}
              style={{ width: 26, height: 26, tintColor: "#2563eb" }}
            />
            <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>Season</Text>
          </TouchableOpacity>
        </View>
      </View>

      {thisWeekData && (
        <GlassCard>
          <Text style={[styles.sectionHeader, typography.sectionHeader]}>This week</Text>
          <View style={{ marginTop: 12, gap: 8 }}>
            <View style={styles.thisWeekRow}>
              <View style={styles.thisWeekCircle}>
                <Text style={styles.thisWeekCircleText}>
                  {thisWeekData.doneCount}/{thisWeekData.sessions.length}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.thisWeekLabel}>
                  {Math.round(thisWeekData.plannedKm)} km planned · {thisWeekData.rangeLabel}
                </Text>
                <View style={styles.thisWeekLoadTrack}>
                  <View
                    style={[
                      styles.thisWeekLoadFill,
                      {
                        width: `${Math.max(
                          0,
                          Math.min(
                            100,
                            thisWeekData.plannedKm > 0
                              ? (thisWeekData.doneCount / Math.max(thisWeekData.sessions.length, 1)) * 100
                              : 0,
                          ),
                        )}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.thisWeekLoadLabel}>
                  Weekly load: {thisWeekData.doneCount}/{thisWeekData.sessions.length} sessions
                </Text>
                <View style={styles.onTrackBadge}>
                  <Text style={styles.onTrackText}>On track</Text>
                </View>
              </View>
            </View>
          </View>
        </GlassCard>
      )}

      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[
            styles.toggleButton,
            viewMode === "list" && styles.toggleButtonActive,
          ]}
          activeOpacity={0.8}
          onPress={() => setViewMode("list")}
        >
          <Text
            style={[
              styles.toggleText,
              viewMode === "list" && styles.toggleTextActive,
            ]}
          >
            List
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.toggleButton,
            viewMode === "calendar" && styles.toggleButtonActive,
          ]}
          activeOpacity={0.8}
          onPress={() => setViewMode("calendar")}
        >
          <Text
            style={[
              styles.toggleText,
              viewMode === "calendar" && styles.toggleTextActive,
            ]}
          >
            Calendar
          </Text>
        </TouchableOpacity>
      </View>

      {viewMode === "list" ? (
        <View ref={scrollAreaRef} onLayout={handleScrollAreaLayout}>
        <ScrollView
          ref={weekScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.weekColumnsContainer}
          snapToInterval={WEEK_COLUMN_WIDTH + WEEK_COLUMN_GAP}
          snapToAlignment="start"
          decelerationRate="fast"
          onScroll={handleWeekScroll}
          scrollEventThrottle={16}
        >
          {weeks.map((week) => {
            const isExpanded = true;
            const weekStart = parseISO(week.start_date);
            const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
            const orderedSessions = getOrderedSessions(week);
            return (
              <GlassCard key={week.id} style={styles.weekColumnCard}>
                <View>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={styles.weekHeaderButton}
                  >
                    <View style={styles.weekHeaderLeft}>
                      <Text style={styles.chevron}>{isExpanded ? "▾" : "▸"}</Text>
                      <Image
                        source={require("../assets/cade-runner-blue.png")}
                        style={{ width: 24, height: 24, tintColor: "#2563eb" }}
                      />
                      <Text style={styles.weekTitle}>Week {week.week_number}</Text>
                      {week.phase && (
                        <Text style={styles.weekPhase}>{week.phase}</Text>
                      )}
                      <Text style={styles.weekDateRange}>
                        {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d")}
                      </Text>
                    </View>
                    <Text style={styles.weekMeta}>
                      {week.total_km != null ? `${Math.round(week.total_km)} km` : ""}
                    </Text>
                  </TouchableOpacity>
                  {isExpanded && (
                    <View style={styles.weekSessions}>
                      <DraggableSessionList
                        sessions={orderedSessions}
                        onToggleDone={(sess) =>
                          markSessionDone({
                            sessionId: sess.id,
                            done: !sess.completed_at,
                          })
                        }
                        onPress={setSelectedSession}
                        onAskKipcoachee={handleAskKipcoachee}
                        onReorder={(from, to) =>
                          handleWeekReorder(week.id, from, to)
                        }
                      />
                    </View>
                  )}
                </View>
              </GlassCard>
            );
          })}
        </ScrollView>
        </View>
      ) : (
        <GlassCard>
          <View>
            {!!movingSession && (
              <View style={{ marginBottom: 8, paddingHorizontal: 2 }}>
                <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                  Tap a day to move{" "}
                  <Text style={{ fontWeight: "600", color: colors.foreground }}>
                    {movingSession.description}
                  </Text>
                  .
                </Text>
              </View>
            )}
            <View style={styles.calendarHeaderRow}>
              <TouchableOpacity
                style={styles.calendarNav}
                activeOpacity={0.8}
                onPress={() => setCurrentMonth((m) => subMonths(m, 1))}
              >
                <Text style={styles.weekMeta}>{"‹ Prev"}</Text>
              </TouchableOpacity>
              <Text style={styles.calendarMonth}>{format(currentMonth, "MMMM yyyy")}</Text>
              <TouchableOpacity
                style={styles.calendarNav}
                activeOpacity={0.8}
                onPress={() => setCurrentMonth((m) => addMonths(m, 1))}
              >
                <Text style={styles.weekMeta}>{"Next ›"}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.calendarWeekdayRow}>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <Text key={d} style={styles.calendarWeekday}>
                  {d}
                </Text>
              ))}
            </View>
            <View style={styles.calendarGrid}>
              {calendarDays.map((day) => {
                const key = format(day, "yyyy-MM-dd");
                const inMonth = isSameMonth(day, currentMonth);
                const isTodayDay = isSameDay(day, new Date());
                const plannedSessions = sessionsByDate.get(key) ?? [];
                const completedSessions = completedSessionsByDate.get(key) ?? [];
                const isValidTarget = isDayWithinPlan(day);
                const hasAny = plannedSessions.length > 0 || completedSessions.length > 0;
                return (
                  <View key={key} style={styles.calendarDayCell}>
                    <TouchableOpacity
                      activeOpacity={movingSession ? 0.9 : 1}
                      disabled={!movingSession}
                      onPress={() => handleCalendarDayPress(day)}
                    >
                      <View
                        style={[
                          styles.calendarDayBox,
                          !inMonth && { opacity: 0.35 },
                          isTodayDay && { borderColor: colors.primary },
                          movingSession &&
                            (isValidTarget
                              ? { borderColor: colors.primary, borderStyle: "dashed" as const }
                              : { opacity: 0.15 }),
                        ]}
                      >
                        <Text
                          style={[
                            styles.calendarDayLabel,
                            isTodayDay && styles.calendarDayLabelToday,
                          ]}
                        >
                          {format(day, "d")}
                        </Text>
                        {plannedSessions.map((s) => {
                          const typeColor = getSessionTypeColor(s.session_type);
                          const isCompletedHere =
                            !!s.completed_at &&
                            s.completed_at.slice(0, 10) === key;
                          const isRescheduled =
                            !!s.completed_at &&
                            !!s.scheduled_date &&
                            s.completed_at.slice(0, 10) !== s.scheduled_date.slice(0, 10);
                          const labelSource =
                            typeof s.session_type === "string" && s.session_type.trim().length > 0
                              ? s.session_type.trim()
                              : "Session";
                          const shortLabel =
                            labelSource.length <= 3
                              ? labelSource
                              : labelSource.slice(0, 1).toUpperCase();
                          return (
                            <TouchableOpacity
                              key={s.id}
                              activeOpacity={0.85}
                              style={[
                                styles.calendarSessionPill,
                                {
                                  backgroundColor: colors.card,
                                  borderWidth: 1,
                                  borderColor: typeColor,
                                  borderStyle: isRescheduled ? "dashed" : "solid",
                                },
                              ]}
                              onPress={() => {
                                if (movingSession) {
                                  handleCalendarDayPress(day);
                                } else {
                                  setSelectedSession(s);
                                }
                              }}
                              onLongPress={() => setMovingSession(s)}
                            >
                              <Text
                                numberOfLines={1}
                                style={[
                                  styles.calendarSessionText,
                                  {
                                    color: typeColor,
                                    fontWeight: isCompletedHere ? "700" : "500",
                                  },
                                ]}
                              >
                                {shortLabel}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                        {completedSessions
                          .filter(
                            (s) =>
                              (!s.scheduled_date ||
                                s.scheduled_date.slice(0, 10) !== key) &&
                              s.completed_at &&
                              s.completed_at.slice(0, 10) === key,
                          )
                          .map((s) => {
                            const typeColor = getSessionTypeColor(s.session_type);
                            return (
                              <TouchableOpacity
                                key={`${s.id}_completed`}
                                activeOpacity={0.85}
                                style={[
                                  styles.calendarSessionPill,
                                  {
                                    backgroundColor: typeColor,
                                    borderWidth: 1,
                                    borderColor: typeColor,
                                  },
                                ]}
                                onPress={() => {
                                  if (movingSession) {
                                    handleCalendarDayPress(day);
                                  } else {
                                    setSelectedSession(s);
                                  }
                                }}
                                onLongPress={() => setMovingSession(s)}
                              >
                                <Text
                                  numberOfLines={1}
                                  style={[
                                    styles.calendarSessionText,
                                    { color: colors.primaryForeground },
                                  ]}
                                >
                                  ✓ {s.description}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        {!hasAny && isDayWithinPlan(day) && (
                          <Text
                            style={[
                              styles.calendarSessionText,
                              { marginTop: 2, color: colors.mutedForeground },
                            ]}
                          >
                            💤
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </View>
        </GlassCard>
      )}

      <GlassCard style={styles.rebuildCard}>
        <View style={styles.rebuildRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rebuildTitle}>Rebuild plan</Text>
            <Text style={styles.rebuildSubtitle}>
              Change your goals or schedule and let Cade design a fresh block.
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleRebuildPlan}
            activeOpacity={0.85}
            style={styles.rebuildButton}
          >
            <Text style={styles.rebuildButtonText}>Rebuild</Text>
          </TouchableOpacity>
        </View>
      </GlassCard>

      <SessionDetailModal
        visible={!!selectedSession}
        session={selectedSession}
        onClose={() => setSelectedSession(null)}
        onToggleDone={(sess) =>
          markSessionDone({ sessionId: sess.id, done: !sess.completed_at })
        }
        onAskKipcoachee={handleAskKipcoachee}
        isMarkingDone={isMarkingDone}
        isNutritionLoading={isNutritionLoading}
      />
    </ScreenContainer>
    {onboardingStep != null && (
      <PlanOnboardingOverlay
        step={onboardingStep}
        spotlight={onboardingSpotlight}
        completing={onboardingCompleting}
        onComplete={handleOnboardingDone}
      />
    )}
    </View>
  );
};
