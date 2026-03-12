import { FC, useMemo, useState } from "react";
import { Modal, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../components/ScreenContainer";
import { GlassCard } from "../components/GlassCard";
import { useTheme } from "../context/ThemeContext";
import { useActivitiesList, type ActivityListItem } from "../hooks/useActivities";
import { useIntervalsIntegration } from "../hooks/useIntervalsIntegration";
import { dailyTSSFromActivities } from "../lib/analytics";
import type { ActivitiesStackParamList } from "../navigation/RootNavigator";
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

/** Match web: easy=accent, tempo=primary, interval=destructive, long=warning, rest=muted */
function activityTypeToColor(type: string, name: string, colors: Record<string, string>): string {
  const t = String(type || "").toLowerCase();
  const n = String(name || "").toLowerCase();
  const combined = `${t} ${n}`;
  if (/easy|recovery|jog|base/i.test(combined)) return colors.accent ?? "#22c55e";
  if (/tempo|threshold|steady/i.test(combined)) return colors.primary ?? "#2563eb";
  if (/interval|vo2|fartlek|speed|hiit/i.test(combined)) return colors.destructive ?? "#dc2626";
  if (/long|endurance/i.test(combined)) return "#f97316";
  if (/rest|rest day/i.test(combined)) return colors.muted ?? "#94a3b8";
  return colors.primary ?? "#2563eb";
}

export const ActivitiesScreen: FC = () => {
  const { colors } = useTheme();
  const { isConnected } = useIntervalsIntegration();
  const { items, isLoading, isEmpty, isRefetching, refetch } = useActivitiesList(730);
  const navigation = useNavigation<ActivitiesNav>();
  const [viewMonth, setViewMonth] = useState(() => new Date());
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);

  const activitiesByDate = useMemo(() => {
    const map = new Map<string, ActivityListItem[]>();
    for (const a of items ?? []) {
      const key = format(a.date ?? new Date(), "yyyy-MM-dd");
      const list = map.get(key) ?? [];
      list.push(a);
      map.set(key, list);
    }
    return map;
  }, [items]);

  const statsActivities = useMemo(
    () =>
      (items ?? []).map((a) => ({
        id: a.id,
        date: format(a.date ?? new Date(), "yyyy-MM-dd"),
        type: a.type,
        distance_km: a.km,
        duration_seconds: a.durationSeconds,
        avg_hr: a.hr,
        avg_pace: a.pace,
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

  const goToSettings = () => {
    (navigation.getParent() as { getParent?: () => { navigate: (name: string) => void } })?.getParent?.()?.navigate("Settings");
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        loadingContent: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 32, gap: 16 },
        listContent: { paddingHorizontal: 0, paddingTop: 56, paddingBottom: 32 },
        title: { fontSize: 22, fontWeight: "600", color: colors.foreground, paddingHorizontal: 20, marginBottom: 4 },
        body: { fontSize: 14, color: colors.mutedForeground, lineHeight: 20 },
        emptyCard: { padding: 24, alignItems: "center", gap: 12 },
        emptyTitle: { fontSize: 18, fontWeight: "600", color: colors.foreground },
        emptyActions: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "center", marginTop: 8 },
        btnPrimary: {
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderRadius: 999,
          backgroundColor: colors.primary,
        },
        btnPrimaryText: { fontSize: 14, fontWeight: "600", color: colors.primaryForeground },
        btnOutline: {
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderRadius: 999,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        },
        btnOutlineText: { fontSize: 14, fontWeight: "500", color: colors.foreground },
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
          borderColor: colors.border,
        },
        calendarMonth: { fontSize: 16, fontWeight: "600", color: colors.foreground },
        calendarNav: { paddingHorizontal: 8, paddingVertical: 6 },
        calendarNavText: { fontSize: 14, color: colors.mutedForeground },
        weekdayRow: {
          flexDirection: "row",
          paddingHorizontal: 12,
          marginBottom: 8,
        },
        weekdayCell: { flex: 1, alignItems: "center" },
        weekdayLabel: { fontSize: 11, fontWeight: "500", color: colors.mutedForeground },
        calendarGrid: { paddingHorizontal: 12, paddingBottom: 12 },
        weekRow: { flexDirection: "row", marginBottom: 6 },
        dayCell: {
          flex: 1,
          minHeight: 72,
          marginHorizontal: 2,
          borderRadius: 10,
          paddingVertical: 6,
          paddingHorizontal: 4,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: "transparent",
        },
        dayLabel: { fontSize: 13, marginBottom: 4 },
        dayLabelToday: { color: colors.primary, fontWeight: "600" },
        dayLabelMuted: { color: colors.mutedForeground },
        dotRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 2 },
        dayHint: {
          fontSize: 10,
          color: colors.mutedForeground,
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        },
        dayModalBackdrop: {
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.35)",
          justifyContent: "flex-end",
        },
        dayModalCard: {
          backgroundColor: colors.card,
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 24,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          maxHeight: "80%",
        },
        dayModalHeader: { marginBottom: 8 },
        dayModalTitle: { fontSize: 15, fontWeight: "600", color: colors.foreground },
        dayModalSubtitle: { fontSize: 12, color: colors.mutedForeground, marginTop: 2 },
        dayModalList: { maxHeight: 280 },
        dayModalListItem: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingVertical: 12,
          paddingHorizontal: 4,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          gap: 12,
        },
        dayModalLeft: { flex: 1, minWidth: 0 },
        dayModalName: { fontSize: 14, fontWeight: "500", color: colors.foreground },
        dayModalMeta: { fontSize: 12, color: colors.mutedForeground, marginTop: 2 },
        dayModalRight: { alignItems: "flex-end", gap: 4 },
        dayModalDistance: { fontSize: 14, fontWeight: "600", color: colors.foreground },
        dayModalType: {
          fontSize: 10,
          color: colors.mutedForeground,
          paddingHorizontal: 6,
          paddingVertical: 2,
          borderRadius: 999,
          backgroundColor: colors.muted,
        },
        dayModalClose: { marginTop: 12, alignItems: "center" },
        dayModalCloseText: { fontSize: 13, color: colors.mutedForeground },
      }),
    [colors],
  );

  if (!isConnected && isEmpty && !isLoading) {
    return (
      <ScreenContainer contentContainerStyle={styles.loadingContent}>
        <Text style={styles.title}>Activities</Text>
        <GlassCard>
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Add your activities</Text>
            <Text style={[styles.body, { textAlign: "center" }]}>
              Connect intervals.icu in Settings to sync your activities.
            </Text>
            <TouchableOpacity style={styles.btnPrimary} onPress={goToSettings} activeOpacity={0.85}>
              <Text style={styles.btnPrimaryText}>Go to Settings</Text>
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
        <GlassCard>
          <Text style={styles.body}>Loading activities…</Text>
        </GlassCard>
      </ScreenContainer>
    );
  }

  if (isEmpty) {
    return (
      <ScreenContainer contentContainerStyle={styles.loadingContent}>
        <Text style={styles.title}>Activities</Text>
        <GlassCard>
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No activities yet</Text>
            <Text style={[styles.body, { textAlign: "center" }]}>
              {isConnected
                ? "Connected to intervals.icu — if you have activities there, they should sync. Try refreshing or check Settings."
                : "Connect intervals.icu in Settings to sync your activities."}
            </Text>
            <View style={styles.emptyActions}>
              <TouchableOpacity style={styles.btnPrimary} onPress={() => refetch()} activeOpacity={0.85}>
                <Text style={styles.btnPrimaryText}>Refresh</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnOutline} onPress={goToSettings} activeOpacity={0.85}>
                <Text style={styles.btnOutlineText}>Go to Settings</Text>
              </TouchableOpacity>
            </View>
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
              <RefreshControl
                refreshing={!!isRefetching}
                onRefresh={() => refetch()}
                tintColor={colors.primary}
              />
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
                  const hasAny = dayActivities.length > 0;

                  return (
                    <TouchableOpacity
                      key={key}
                      style={[
                        styles.dayCell,
                        {
                          backgroundColor:
                            hasAny && inMonth
                              ? colors.primary + Math.round(0x12 * (0.4 + 0.6 * intensity)).toString(16).padStart(2, "0")
                              : "transparent",
                          borderColor: today ? colors.primary : "transparent",
                          opacity: inMonth ? 1 : 0.4,
                        },
                      ]}
                      activeOpacity={hasAny ? 0.8 : 1}
                      onPress={hasAny ? () => setSelectedDayKey(key) : undefined}
                    >
                      <Text
                        style={[
                          styles.dayLabel,
                          today ? styles.dayLabelToday : styles.dayLabelMuted,
                        ]}
                      >
                        {format(day, "d")}
                      </Text>
                      {hasAny && (
                        <View style={styles.dotRow}>
                          {dayActivities.slice(0, 4).map((a) => (
                            <View
                              key={a.id}
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: 999,
                                backgroundColor: activityTypeToColor(a.type, a.name, colors),
                                opacity: 0.6 + intensity * 0.4,
                              }}
                            />
                          ))}
                          {dayActivities.length > 4 && (
                            <Text style={[styles.dayHint, { marginTop: 0, padding: 0, fontSize: 9 }]}>
                              +{dayActivities.length - 4}
                            </Text>
                          )}
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </ScrollView>

          <Text style={styles.dayHint}>
            Tap a day to see activities · Tap an activity to view details
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
                    {(activitiesByDate.get(selectedDayKey)?.length ?? 0)}{" "}
                    {(activitiesByDate.get(selectedDayKey)?.length ?? 0) === 1 ? "activity" : "activities"}
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
                          {a.nonDist ? a.duration : `${a.km.toFixed(1)} km`}
                        </Text>
                        <Text style={styles.dayModalType}>{a.type}</Text>
                      </View>
                    </TouchableOpacity>
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
