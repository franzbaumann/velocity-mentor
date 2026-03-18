import { FC, useMemo, useState } from "react";
import { Modal, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../components/ScreenContainer";
import { GlassCard } from "../components/GlassCard";
import { useTheme } from "../context/ThemeContext";
import { getWorkoutTypeTintGradientColors } from "../lib/workoutTypeTint";
import { useActivitiesList, type ActivityListItem } from "../hooks/useActivities";
import { useMergedActivities } from "../hooks/useMergedActivities";
import { useActivityStreamsSync } from "../hooks/useActivityStreamsSync";
import { useIntervalsIntegration } from "../hooks/useIntervalsIntegration";
import { dailyTSSFromActivities, getRunTypeLabelForDisplay, isRunningActivity } from "../lib/analytics";
import type { ActivitiesStackParamList } from "../navigation/RootNavigator";
import { useTrainingPlan, type TrainingPlanSession } from "../hooks/useTrainingPlan";
import { SkeletonCard, SkeletonLine } from "../components/Skeleton";
import { LinearGradient } from "expo-linear-gradient";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";

type ActivitiesNav = NativeStackNavigationProp<ActivitiesStackParamList, "ActivitiesList">;

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Match web: easy=accentGreen, tempo=accentBlue, interval=negative, long=warning, rest=textMuted */
function activityTypeToColor(
  type: string,
  name: string,
  theme: { accentGreen: string; accentBlue: string; negative: string; warning: string; textMuted: string },
): string {
  const t = String(type || "").toLowerCase();
  const n = String(name || "").toLowerCase();
  const combined = `${t} ${n}`;
  if (/easy|recovery|jog|base/i.test(combined)) return theme.accentGreen;
  if (/tempo|threshold|steady/i.test(combined)) return theme.accentBlue;
  if (/interval|vo2|fartlek|speed|hiit/i.test(combined)) return theme.negative;
  if (/long|endurance/i.test(combined)) return theme.warning;
  if (/rest|rest day/i.test(combined)) return theme.textMuted;
  return theme.accentBlue;
}

function activityLoadProxy(a: ActivityListItem): number {
  // Use a stable proxy that roughly matches what drives daily TSS in analytics.ts,
  // but prioritize "icuTrainingLoad" then "trimp", then duration and finally km.
  if (typeof a.icuTrainingLoad === "number" && a.icuTrainingLoad > 0) return a.icuTrainingLoad;
  if (typeof a.trimp === "number" && a.trimp > 0) return a.trimp;
  if (typeof a.durationSeconds === "number" && a.durationSeconds > 0) return a.durationSeconds / 36;
  if (typeof a.km === "number" && a.km > 0) return a.km * 10;
  return 0;
}

export const ActivitiesScreen: FC = () => {
  const { theme, colors } = useTheme();
  const { isConnected } = useIntervalsIntegration();
  const { data: items = [], isLoading, isEmpty, isRefetching, refetch } = useMergedActivities(730);
  const { plan } = useTrainingPlan();

  // Background sync of activity streams (intervals.icu), rate-limited to once per hour
  useActivityStreamsSync(items ?? [], isConnected);
  const navigation = useNavigation<ActivitiesNav>();
  const [viewMonth, setViewMonth] = useState(() => new Date());
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const todayKey = format(new Date(), "yyyy-MM-dd");

  const activitiesByDate = useMemo(() => {
    const map = new Map<string, ActivityListItem[]>();
    for (const a of items) {
      const key = format(a.date ?? new Date(), "yyyy-MM-dd");
      const list = map.get(key) ?? [];
      list.push(a);
      map.set(key, list);
    }

    return map;
  }, [items]);

  const statsActivities = useMemo(
    () =>
      items.map((a) => ({
        id: a.id,
        date: format(a.date ?? new Date(), "yyyy-MM-dd"),
        type: a.type,
        distance_km: a.km,
        duration_seconds: a.durationSeconds,
        avg_hr: a.hr,
        avg_pace: a.pace,
        icu_training_load: a.icuTrainingLoad,
        trimp: a.trimp,
      })),
    [items],
  );

  const dailyTSS = useMemo(() => dailyTSSFromActivities(statsActivities), [statsActivities]);
  const maxTSS = useMemo(() => {
    let max = 0;
    for (const v of dailyTSS.values()) if (v > max) max = v;
    return Math.max(max, 1);
  }, [dailyTSS]);

  const calendarWeeks = useMemo(() => {
    const monthStart = startOfMonth(viewMonth);
    const monthEnd = endOfMonth(viewMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const weeks: Date[][] = [];
    let d = new Date(calStart);
    while (d <= calEnd) {
      const week: Date[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(new Date(d));
        d = addDays(d, 1);
      }
      weeks.push(week);
    }

    return weeks;
  }, [viewMonth]);

  const planSessionsByDate = useMemo(() => {
    const map = new Map<string, TrainingPlanSession[]>();
    const weeks = plan?.weeks ?? [];
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
  }, [plan]);

  const goToSettings = () => {
    (navigation.getParent() as { getParent?: () => { navigate: (name: string) => void } })?.getParent?.()?.navigate("Settings");
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        loadingContent: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 32, gap: 16 },
        listContent: { paddingHorizontal: 0, paddingTop: 56, paddingBottom: 32 },
        title: { fontSize: 22, fontWeight: "600", color: theme.textPrimary, paddingHorizontal: 20, marginBottom: 4 },
        body: { fontSize: 14, color: theme.textSecondary, lineHeight: 20 },
        emptyCard: { padding: 24, alignItems: "center", gap: 12 },
        emptyTitle: { fontSize: 18, fontWeight: "600", color: theme.textPrimary },
        emptyActions: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "center", marginTop: 8 },
        btnPrimary: {
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderRadius: 999,
          backgroundColor: theme.accentBlue,
        },
        btnPrimaryText: { fontSize: 14, fontWeight: "600", color: theme.primaryForeground },
        btnOutline: {
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderRadius: 999,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.cardBorder,
        },
        btnOutlineText: { fontSize: 14, fontWeight: "500", color: theme.textPrimary },
        calendarCard: {
          marginHorizontal: 20,
          marginTop: 8,
          borderRadius: 24,
          overflow: "hidden",
        },
        calendarHeader: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingVertical: 14,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderColor: theme.cardBorder,
        },
        calendarMonth: { fontSize: 16, fontWeight: "600", color: theme.textPrimary },
        calendarNav: { paddingHorizontal: 8, paddingVertical: 6 },
        calendarNavText: { fontSize: 14, color: theme.textSecondary },
        weekdayRow: {
          flexDirection: "row",
          paddingHorizontal: 12,
          marginBottom: 8,
        },
        weekdayCell: { flex: 1, alignItems: "center" },
        weekdayLabel: { fontSize: 11, fontWeight: "500", color: theme.textSecondary },
        calendarGrid: { paddingHorizontal: 12, paddingBottom: 12 },
        weekRow: { flexDirection: "row", marginBottom: 6 },
        dayCell: {
          flex: 1,
          minHeight: 72,
          marginHorizontal: 2,
          borderRadius: 10,
          overflow: "hidden",
          paddingVertical: 6,
          paddingHorizontal: 4,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: "transparent",
        },
        dayLabel: { fontSize: 13, marginBottom: 4 },
        dayLabelToday: { color: theme.textPrimary, fontWeight: "600" },
        dayLabelMuted: { color: theme.textSecondary },
        dotRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 2 },
        dayHint: {
          fontSize: 10,
          color: theme.textSecondary,
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderColor: theme.cardBorder,
        },
        moreCountText: {
          fontSize: 9,
          color: theme.textSecondary,
        },
        planPillRow: {
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "center",
          marginTop: 2,
          gap: 4,
        },
        planPill: {
          borderRadius: 999,
          paddingHorizontal: 6,
          paddingVertical: 2,
          opacity: 0.6,
        },
        planPillText: {
          fontSize: 9,
          fontWeight: "500",
          textTransform: "capitalize",
        },
        dayModalBackdrop: {
          flex: 1,
          backgroundColor: theme.overlayBackdrop,
          justifyContent: "flex-end",
        },
        dayModalCard: {
          backgroundColor: theme.cardBackground,
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 24,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderColor: theme.cardBorder,
          maxHeight: "80%",
        },
        dayModalHeader: { marginBottom: 8 },
        dayModalTitle: { fontSize: 15, fontWeight: "600", color: theme.textPrimary },
        dayModalSubtitle: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
        dayModalList: { maxHeight: 280 },
        dayModalListItem: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingVertical: 12,
          paddingHorizontal: 4,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderColor: theme.cardBorder,
          gap: 12,
        },
        dayModalLeft: { flex: 1, minWidth: 0 },
        dayModalName: { fontSize: 14, fontWeight: "500", color: theme.textPrimary },
        dayModalMeta: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
        dayModalRight: { alignItems: "flex-end", gap: 4 },
        dayModalDistance: { fontSize: 14, fontWeight: "600", color: theme.textPrimary },
        dayModalType: {
          fontSize: 10,
          color: theme.textSecondary,
          paddingHorizontal: 6,
          paddingVertical: 2,
          borderRadius: 999,
          backgroundColor: theme.cardBorder,
        },
        dayModalClose: { marginTop: 12, alignItems: "center" },
        dayModalCloseText: { fontSize: 13, color: theme.textSecondary },
      }),
    [theme],
  );

  if (!isConnected && isEmpty && !isLoading) {
    return (
      <ScreenContainer contentContainerStyle={styles.loadingContent}>
        <Text style={styles.title}>Activities</Text>
        <GlassCard>
          <View style={styles.emptyCard}>
            <Text style={{ fontSize: 48, color: theme.textMuted }}>🧭</Text>
            <Text style={styles.emptyTitle}>Connect intervals.icu to see your activities</Text>
            <TouchableOpacity style={styles.btnPrimary} onPress={goToSettings} activeOpacity={0.85}>
              <Text style={styles.btnPrimaryText}>Go to Settings →</Text>
            </TouchableOpacity>
          </View>
        </GlassCard>
      </ScreenContainer>
    );
  }

  if (isLoading) {
    return (
      <ScreenContainer contentContainerStyle={styles.loadingContent}>
        <Text style={styles.title}>Activities</Text>
        <SkeletonCard>
          <SkeletonLine width="30%" />
          <SkeletonLine width="100%" style={{ marginTop: 10, height: 220, borderRadius: 14 }} />
        </SkeletonCard>
      </ScreenContainer>
    );
  }

  if (isEmpty) {
    return (
      <ScreenContainer contentContainerStyle={styles.loadingContent}>
        <Text style={styles.title}>Activities</Text>
        <GlassCard>
          <View style={styles.emptyCard}>
            <Text style={{ fontSize: 48, color: theme.textMuted }}>🏃</Text>
            <Text style={styles.emptyTitle}>No activities yet · Try syncing in Settings</Text>
            <TouchableOpacity style={styles.btnPrimary} onPress={() => refetch()} activeOpacity={0.85}>
              <Text style={styles.btnPrimaryText}>Sync now →</Text>
            </TouchableOpacity>
          </View>
        </GlassCard>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll={false} contentContainerStyle={styles.listContent}>
      <Text style={[styles.title, { paddingHorizontal: 20 }]}>Activities</Text>

      <GlassCard style={styles.calendarCard}>
        <View style={styles.calendarHeader}>
          <TouchableOpacity
            onPress={() => setViewMonth((m) => subMonths(m, 1))}
            style={styles.calendarNav}
            activeOpacity={0.8}
          >
            <Text style={styles.calendarNavText}>‹ Prev</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setViewMonth(new Date())} activeOpacity={0.8}>
            <Text style={styles.calendarMonth}>{format(viewMonth, "MMMM yyyy")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setViewMonth((m) => addMonths(m, 1))}
            style={styles.calendarNav}
            activeOpacity={0.8}
          >
            <Text style={styles.calendarNavText}>Next ›</Text>
          </TouchableOpacity>
        </View>

        <View style={{ paddingHorizontal: 12 }}>
          <View style={styles.weekdayRow}>
            {WEEKDAYS.map((d) => (
              <View key={d} style={styles.weekdayCell}>
                <Text style={styles.weekdayLabel}>{d}</Text>
              </View>
            ))}
          </View>

          <ScrollView
            style={styles.calendarGrid}
            contentContainerStyle={{ paddingBottom: 8 }}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />
            }
          >
            {calendarWeeks.map((week, idx) => (
              <View key={idx} style={styles.weekRow}>
                {week.map((day) => {
                  const key = format(day, "yyyy-MM-dd");
                  const inMonth = isSameMonth(day, viewMonth);
                  const today = isToday(day);
                  const dayActivities = activitiesByDate.get(key) ?? [];
                  const tss = dailyTSS.get(key) ?? 0;
                  const intensity = maxTSS > 0 ? Math.min(1, tss / maxTSS) : 0;
                  const planSessions = planSessionsByDate.get(key) ?? [];
                  const hasActivities = dayActivities.length > 0;
                  const hasPlan = planSessions.length > 0;
                  const showCompletedFade = hasActivities && inMonth;
                  const showUpcomingFade = !hasActivities && hasPlan && inMonth && key >= todayKey;
                  const showFade = showCompletedFade || showUpcomingFade;

                  // Derive type string for getWorkoutTypeTintGradientColors (matches Plan SessionCard)
                  let typeForGradient: string | null = null;
                  if (showCompletedFade) {
                    const best = dayActivities.reduce(
                      (acc, a) => {
                        const load = activityLoadProxy(a);
                        return load > acc.load ? { activity: a, load } : acc;
                      },
                      { activity: dayActivities[0], load: -1 },
                    );
                    const bestActivity = best.activity;
                    typeForGradient = isRunningActivity(bestActivity.type)
                      ? getRunTypeLabelForDisplay({
                          type: bestActivity.type,
                          avg_hr: bestActivity.hr,
                          max_hr: bestActivity.maxHr,
                        })
                      : bestActivity.type;
                  } else if (showUpcomingFade) {
                    // Same priority as plan pill: interval > tempo/long > easy
                    let bestPriority = -1;
                    let bestType = planSessions[0]?.session_type ?? null;
                    for (const s of planSessions) {
                      const st = s.session_type?.toLowerCase() ?? "";
                      let p = -1;
                      if (st.includes("interval") || st.includes("vo2")) p = 2;
                      else if (st.includes("tempo") || st.includes("threshold") || st.includes("long")) p = 1;
                      else if (st.includes("easy") || st.includes("recovery")) p = 0;
                      if (p > bestPriority) {
                        bestPriority = p;
                        bestType = s.session_type;
                      }
                    }
                    typeForGradient = bestType;
                  }

                  const tintGradientColors =
                    typeForGradient != null
                      ? getWorkoutTypeTintGradientColors(typeForGradient, colors)
                      : null;

                  return (
                    <TouchableOpacity
                      key={key}
                      style={[
                        styles.dayCell,
                        {
                          borderColor: today ? theme.accentBlue : "transparent",
                          opacity: inMonth ? 1 : 0.4,
                        },
                      ]}
                      activeOpacity={hasActivities ? 0.8 : 1}
                      onPress={hasActivities ? () => setSelectedDayKey(key) : undefined}
                    >
                      {showFade && tintGradientColors && (
                        <LinearGradient
                          colors={tintGradientColors}
                          locations={[0, 0.35, 0.7]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          pointerEvents="none"
                          style={StyleSheet.absoluteFillObject}
                        />
                      )}
                      <Text
                        style={[
                          styles.dayLabel,
                          today ? styles.dayLabelToday : styles.dayLabelMuted,
                        ]}
                      >
                        {format(day, "d")}
                      </Text>
                      {hasActivities && (
                        <View style={styles.dotRow}>
                          {dayActivities.slice(0, 4).map((a) => {
                            const displayType = isRunningActivity(a.type)
                              ? getRunTypeLabelForDisplay({ type: a.type, avg_hr: a.hr, max_hr: a.maxHr })
                              : a.type;
                            return (
                              <View
                                key={a.id}
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: 2,
                                  backgroundColor: activityTypeToColor(displayType, a.name, theme),
                                  opacity: 0.6 + intensity * 0.4,
                                }}
                              />
                            );
                          })}
                          {dayActivities.length > 4 && (
                            <Text style={styles.moreCountText}>+{dayActivities.length - 4}</Text>
                          )}
                        </View>
                      )}
                      {hasPlan && (
                        <View style={styles.planPillRow}>
                          {planSessions.slice(0, 2).map((s) => {
                            const st = s.session_type?.toLowerCase() ?? "";
                            let bg = theme.cardBorder;
                            if (st.includes("easy") || st.includes("recovery")) bg = theme.accentGreen;
                            else if (st.includes("tempo") || st.includes("threshold")) bg = theme.accentBlue;
                            else if (st.includes("interval") || st.includes("vo2")) bg = theme.negative;
                            else if (st.includes("long")) bg = theme.warning;
                            return (
                              <View
                                key={s.id}
                                style={[
                                  styles.planPill,
                                  {
                                    backgroundColor: bg,
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.planPillText,
                                    {
                                      color: theme.appBackground,
                                    },
                                  ]}
                                  numberOfLines={1}
                                >
                                  {s.session_type}
                                </Text>
                              </View>
                            );
                          })}
                          {planSessions.length > 2 && (
                            <Text style={styles.planPillText}>+{planSessions.length - 2}</Text>
                          )}
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </ScrollView>

          <Text style={[styles.dayHint, { textAlign: "center" }]}>
            Tap a date to view activities
          </Text>
        </View>
      </GlassCard>

      <Modal
        visible={!!selectedDayKey}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedDayKey(null)}
      >
        <TouchableOpacity
          style={styles.dayModalBackdrop}
          activeOpacity={1}
          onPress={() => setSelectedDayKey(null)}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            style={styles.dayModalCard}
          >
            {selectedDayKey && (
              <>
                <View style={styles.dayModalHeader}>
                  <Text style={styles.dayModalTitle}>
                    {format(new Date(selectedDayKey), "EEEE, MMMM d")}
                  </Text>
                  <Text style={styles.dayModalSubtitle}>
                    {(() => {
                      const actCount = activitiesByDate.get(selectedDayKey)?.length ?? 0;
                      const planCount = planSessionsByDate.get(selectedDayKey)?.length ?? 0;
                      const parts: string[] = [];
                      if (actCount > 0) {
                        parts.push(`${actCount} ${actCount === 1 ? "activity" : "activities"}`);
                      }
                      if (planCount > 0) {
                        parts.push(`${planCount} planned`);
                      }
                      return parts.length > 0 ? parts.join(" · ") : "No data";
                    })()}
                  </Text>
                </View>
                <ScrollView style={styles.dayModalList} keyboardShouldPersistTaps="handled">
                  {(activitiesByDate.get(selectedDayKey) ?? []).map((a) => (
                    <TouchableOpacity
                      key={a.id}
                      style={styles.dayModalListItem}
                      activeOpacity={0.85}
                      onPress={() => {
                        setSelectedDayKey(null);
                        navigation.navigate("ActivityDetail", { id: a.id });
                      }}
                    >
                      <View style={styles.dayModalLeft}>
                        <Text style={styles.dayModalName} numberOfLines={1}>
                          {a.name}
                        </Text>
                        <Text style={styles.dayModalMeta} numberOfLines={1}>
                          {[a.pace, a.duration, a.hr != null ? `${a.hr} bpm` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </Text>
                      </View>
                      <View style={styles.dayModalRight}>
                        <Text style={styles.dayModalDistance}>
                          {a.nonDist
                            ? a.duration
                            : a.km != null
                              ? `${a.km.toFixed(1)} km`
                              : ""}
                        </Text>
                        <Text style={styles.dayModalType}>
                          {isRunningActivity(a.type)
                            ? getRunTypeLabelForDisplay({ type: a.type, avg_hr: a.hr, max_hr: a.maxHr })
                            : a.type}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                  {(planSessionsByDate.get(selectedDayKey) ?? []).map((s) => (
                    <View key={s.id} style={styles.dayModalListItem}>
                      <View style={styles.dayModalLeft}>
                        <Text style={styles.dayModalName} numberOfLines={1}>
                          {s.description || s.session_type || "Planned session"}
                        </Text>
                        <Text style={styles.dayModalMeta} numberOfLines={1}>
                          {[s.session_type, s.pace_target]
                            .filter(Boolean)
                            .join(" · ")}
                        </Text>
                      </View>
                      <View style={styles.dayModalRight}>
                        <Text style={styles.dayModalDistance}>
                          {s.distance_km != null
                            ? `${s.distance_km} km`
                            : s.duration_min != null
                              ? `${Math.round(s.duration_min)} min`
                              : ""}
                        </Text>
                        <Text style={styles.dayModalType}>Planned</Text>
                      </View>
                    </View>
                  ))}
                </ScrollView>
                <TouchableOpacity
                  style={styles.dayModalClose}
                  onPress={() => setSelectedDayKey(null)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.dayModalCloseText}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </ScreenContainer>
  );
};
