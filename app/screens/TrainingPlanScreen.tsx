import { FC, useCallback, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
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
import { SessionDetailModal } from "../components/plan/SessionDetailModal";
import { SkeletonCard, SkeletonLine } from "../components/Skeleton";
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
  const styles = useMemo(
    () =>
      StyleSheet.create({
        content: { gap: 16, paddingBottom: 32 },
        title: { fontSize: 22, fontWeight: "600", color: colors.foreground },
        subtitle: { fontSize: 14, color: colors.mutedForeground, marginTop: 4 },
        countdownBadge: {
          borderRadius: 999,
          paddingHorizontal: 10,
          paddingVertical: 4,
          backgroundColor: colors.muted,
        },
        countdownText: { fontSize: 11, fontWeight: "500", color: colors.mutedForeground },
        sectionHeader: {},
        body: { fontSize: 14, color: colors.mutedForeground, lineHeight: 20 },
        weekHeaderRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        },
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
        weekSessions: {
          paddingHorizontal: 16,
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
          marginTop: 16,
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

  const thisWeekData = useMemo(() => {
    const mon = startOfWeek(today, { weekStartsOn: 1 });
    const sun = endOfWeek(today, { weekStartsOn: 1 });
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
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
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
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <Text style={styles.title}>Training plan</Text>
          <TouchableOpacity
            onPress={openSeason}
            activeOpacity={0.8}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 12, minHeight: 48 }}
          >
            <Ionicons name="trophy" size={20} color={colors.primary} />
            <Text style={{ fontSize: 15, fontWeight: "600", color: colors.primary }}>Season</Text>
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
    <ScreenContainer
      contentContainerStyle={[styles.content, { paddingBottom: SCROLL_PADDING_BELOW_BUBBLE }]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <Text style={styles.title}>Training plan</Text>
        <TouchableOpacity
          onPress={openSeason}
          activeOpacity={0.8}
          style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 12, minHeight: 48 }}
        >
          <Ionicons name="trophy" size={20} color={colors.primary} />
          <Text style={{ fontSize: 15, fontWeight: "600", color: colors.primary }}>Season</Text>
        </TouchableOpacity>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={styles.subtitle}>{raceSubtitle}</Text>
        {daysToRace != null && (
          <View style={styles.countdownBadge}>
            <Text style={styles.countdownText}>🏁 {daysToRace} days to race</Text>
          </View>
        )}
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
        <View style={{ gap: 8 }}>
          {weeks.map((week) => {
            const isExpanded = expandedWeeks.has(week.week_number);
            const weekStart = parseISO(week.start_date);
            const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
            return (
              <GlassCard key={week.id} style={{ padding: 0, overflow: "hidden" }}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  style={styles.weekHeaderButton}
                  onPress={() => toggleWeek(week.week_number)}
                >
                  <View style={styles.weekHeaderLeft}>
                    <Text style={styles.chevron}>
                      {isExpanded ? "▾" : "▸"}
                    </Text>
                    <Text style={styles.weekTitle}>Week {week.week_number}</Text>
                    {week.phase && (
                      <Text style={styles.weekPhase}>{week.phase}</Text>
                    )}
                    <Text style={styles.weekDateRange}>
                      {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d")}
                    </Text>
                  </View>
                  <Text style={styles.weekMeta}>
                    {week.sessions.length} sessions
                    {week.total_km != null
                      ? ` · ${Math.round(week.total_km)} km`
                      : ""}
                  </Text>
                </TouchableOpacity>
                {isExpanded && (
                  <View style={styles.weekSessions}>
                    {week.sessions.map((s) => (
                      <SessionCard
                        key={s.id}
                        session={s}
                        onToggleDone={(sess) =>
                          markSessionDone({
                            sessionId: sess.id,
                            done: !sess.completed_at,
                          })
                        }
                        onPress={setSelectedSession}
                        onAskKipcoachee={handleAskKipcoachee}
                      />
                    ))}
                  </View>
                )}
              </GlassCard>
            );
          })}
        </View>
      ) : (
        <GlassCard>
          <View>
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
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
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
                          const bgColor = isCompletedHere ? typeColor : `${typeColor}22`;
                          const textColor = isCompletedHere ? colors.primaryForeground : typeColor;
                          return (
                            <TouchableOpacity
                              key={s.id}
                              activeOpacity={0.85}
                              style={[
                                styles.calendarSessionPill,
                                {
                                  backgroundColor: bgColor,
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
                                  { color: textColor },
                                ]}
                              >
                                {isCompletedHere ? "✓ " : ""}
                                {s.description}
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
              Change your goals or schedule and let Kipcoachee design a fresh block.
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
  );
};
