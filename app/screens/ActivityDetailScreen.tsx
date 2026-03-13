import { FC, useCallback, useEffect, useMemo, useState } from "react";
import { RouteProp, useRoute, useNavigation } from "@react-navigation/native";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  TextInput,
  Switch,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import type { ActivitiesStackParamList } from "../navigation/RootNavigator";
import { ScreenContainer } from "../components/ScreenContainer";
import { useActivityDetailMobile } from "../hooks/useActivityDetailMobile";
import { useActivityById } from "../hooks/useActivities";
import { LapScroll } from "../components/activity/LapScroll";
import { StreamChart } from "../components/activity/StreamChart";
import { HRAnalysisCharts } from "../components/activity/HRAnalysisCharts";
import { HeartRateZones } from "../components/activity/HeartRateZones";
import { formatDistance, formatDuration } from "../lib/format";
import { isNonDistanceActivity } from "../lib/analytics";
import type { TooltipLine } from "../components/activity/StreamChart";
import { supabase, callEdgeFunctionWithRetry } from "../shared/supabase";
import Svg, { Path, Rect } from "react-native-svg";
import { useTheme } from "../context/ThemeContext";

type ActivityDetailRoute = RouteProp<ActivitiesStackParamList, "ActivityDetail">;

type ActivityTab = "charts" | "data" | "notes";

// ── Pace format: min/km decimal (5.5 = 5:30/km) — matches web exactly ──

function formatPace(val: number): string {
  if (!Number.isFinite(val) || val <= 0 || val > 20) return "--";
  return `${Math.floor(val)}:${String(Math.round((val % 1) * 60)).padStart(2, "0")}`;
}

function paceYLabels(data: number[]): string[] {
  const vals = data.filter((v) => Number.isFinite(v) && v > 0);
  if (vals.length === 0) return [];
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const mid = (min + max) / 2;
  return [formatPace(min), formatPace(mid), formatPace(max)];
}

function numYLabels(data: number[], unit?: string): string[] {
  const valid = data.filter((v) => Number.isFinite(v) && v > 0);
  if (valid.length === 0) return [];
  const max = Math.max(...valid);
  const min = Math.min(...valid);
  const mid = Math.round((max + min) / 2);
  const u = unit ?? "";
  return [`${Math.round(max)}${u}`, `${mid}${u}`, `${Math.round(min)}${u}`];
}

// ── Rolling average — matches web rollingAvg() ──

function rollingAvg(arr: number[], windowSize: number): number[] {
  if (windowSize <= 1 || arr.length === 0) return arr;
  const half = Math.floor(windowSize / 2);
  return arr.map((_, i) => {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(arr.length - 1, i + half); j++) {
      sum += arr[j];
      count++;
    }
    return sum / count;
  });
}

// ── Clamp outlier pace values — matches web smoothPace() ──

function fmtElapsed(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const total = Math.round(sec);
  if (total >= 3600) {
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function smoothPace(raw: number[], minPace = 2.0, maxPace = 12.0): number[] {
  const out = [...raw];
  for (let i = 0; i < out.length; i++) {
    if (out[i] < minPace || out[i] > maxPace || out[i] === 0 || !Number.isFinite(out[i])) {
      let left = 0;
      let right = 0;
      for (let j = i - 1; j >= 0; j--) {
        if (out[j] >= minPace && out[j] <= maxPace) { left = raw[j]; break; }
      }
      for (let j = i + 1; j < out.length; j++) {
        if (raw[j] >= minPace && raw[j] <= maxPace) { right = raw[j]; break; }
      }
      out[i] = left && right ? (left + right) / 2 : left || right || 6;
    }
  }
  return out;
}

// ── Build processed chart arrays from streams — mirrors web buildChartData() ──

type ProcessedStreams = {
  pace: number[];
  hr: number[];
  cadence: number[];
  altitude: number[];
};

function buildProcessedStreams(streams: {
  pace: number[];
  heartrate: number[];
  cadence: number[];
  altitude: number[];
}): ProcessedStreams {
  const cleanPace = smoothPace(streams.pace);
  return {
    pace: rollingAvg(cleanPace, 15),
    hr: rollingAvg(streams.heartrate.map(Number), 10),
    cadence: rollingAvg(streams.cadence.map(Number), 10),
    altitude: streams.altitude.map(Number),
  };
}

export const ActivityDetailScreen: FC = () => {
  const route = useRoute<ActivityDetailRoute>();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { id } = route.params;
  const { activity: listActivity } = useActivityById(id);
  const { data: activity, isLoading } = useActivityDetailMobile(id, {
    rawId: listActivity?.rawId,
    externalId: listActivity?.externalId ?? null,
  });

  const streams = activity?.streams;
  const latlng = activity?.latlng ?? [];

  const processed = useMemo(() => {
    if (!streams) return null;
    const hasAny =
      streams.heartrate.length > 2 ||
      streams.altitude.length > 2 ||
      streams.pace.length > 2;
    if (!hasAny) return null;
    return buildProcessedStreams(streams);
  }, [streams]);

  const [tab, setTab] = useState<ActivityTab>("charts");
  const [notes, setNotes] = useState("");
  const [nomio, setNomio] = useState(false);
  const [lactate, setLactate] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [coachNote, setCoachNote] = useState<string | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachError, setCoachError] = useState(false);
  const { themeName, theme } = useTheme();
  const isDarkPro = themeName === "darkPro";

  useEffect(() => {
    if (!activity) return;
    setNotes(activity.userNotes ?? "");
    setNomio(activity.nomioDrink ?? false);
    setLactate(activity.lactateLevels ?? "");
    setCoachNote(activity.coachNote ?? null);
  }, [activity?.id]);

  const activityIdForApi = id.startsWith("icu_") ? id.replace(/^icu_/, "") : id;

  const actIdForPb = activityIdForApi;
  const { data: pbRecords = [] } = useQuery({
    queryKey: ["personal-records-for-activity-mobile", actIdForPb, id],
    queryFn: async () => {
      if (!actIdForPb && !id) return [];
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];
      const ids = [actIdForPb, id].filter(Boolean) as string[];
      const { data } = await supabase
        .from("personal_records")
        .select("distance")
        .eq("user_id", user.id)
        .in("activity_id", [...new Set(ids)]);
      return (data ?? []) as { distance: string }[];
    },
    enabled: !!activity && (!!actIdForPb || !!id),
  });
  const isPb = pbRecords.length > 0;
  const isMarathonPb = pbRecords.some((r) =>
    /marathon|42\.195|42\s/i.test(r.distance ?? ""),
  );

  const saveNotes = useCallback(async () => {
    if (!activityIdForApi) return;
    setSavingNotes(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(activityIdForApi);
      const base = supabase
        .from("activity")
        .update({
          user_notes: notes || null,
          nomio_drink: nomio,
          lactate_levels: lactate || null,
        })
        .eq("user_id", user.id);
      const { error } = isUuid
        ? await base.eq("id", activityIdForApi)
        : await base.eq("external_id", activityIdForApi);
      if (!error) {
        queryClient.invalidateQueries({ queryKey: ["activity-detail-mobile", id] });
      }
    } finally {
      setSavingNotes(false);
    }
  }, [activityIdForApi, notes, nomio, lactate, id, queryClient]);

  useEffect(() => {
    if (!activity) return;
    const t = setTimeout(saveNotes, 600);
    return () => clearTimeout(t);
  }, [notes, nomio, lactate, activity?.id, saveNotes]);

  const generateCoachNote = useCallback(
    async (forceRegenerate = false) => {
      if (!activityIdForApi || coachLoading) return;
      setCoachLoading(true);
      setCoachError(false);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) {
          setCoachError(true);
          return;
        }
        const { data, error } = await callEdgeFunctionWithRetry({
          functionName: "intervals-proxy",
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: {
            action: "activity_coach_note",
            activityId: activityIdForApi,
            regenerate: forceRegenerate,
          },
          timeoutMs: 20000,
          maxRetries: 3,
          logContext: "ActivityDetailScreen:activity_coach_note",
        });
        if (error || !data || typeof data !== "object" || !("note" in (data as Record<string, unknown>))) {
          setCoachError(true);
          return;
        }
        const note = (data as { note?: string }).note ?? null;
        setCoachNote(note);
        queryClient.invalidateQueries({ queryKey: ["activity-detail-mobile", id] });
      } catch {
        setCoachError(true);
      } finally {
        setCoachLoading(false);
      }
    },
    [activityIdForApi, coachLoading, id, queryClient],
  );

  useEffect(() => {
    if (!activity) return;
    if (!coachNote && !coachLoading) {
      generateCoachNote(false);
    }
  }, [activity?.id, coachNote, coachLoading, generateCoachNote]);

  if (isLoading) {
    return (
      <ScreenContainer contentContainerStyle={styles.center}>
        <ActivityIndicator size="large" color="#2196F3" />
      </ScreenContainer>
    );
  }

  if (!activity && !listActivity) {
    return (
      <ScreenContainer contentContainerStyle={styles.content}>
        <TouchableOpacity
          style={styles.backRow}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={18} color="#999" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Activity not found</Text>
        <Text style={styles.debugText}>
          id: {String(id)}
        </Text>
      </ScreenContainer>
    );
  }

  if (!activity && listActivity) {
    const dateLabel = format(listActivity.date, "EEEE, MMMM d");
    return (
      <ScreenContainer contentContainerStyle={styles.content}>
        <TouchableOpacity
          style={styles.backRow}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={18} color="#999" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{listActivity.name}</Text>
        <Text style={styles.debugText}>{dateLabel}</Text>
        <Text style={styles.debugText}>
          {formatDistance(listActivity.nonDist ? null : listActivity.km)}
          {" · "}
          {formatDuration(listActivity.durationSeconds)}
          {listActivity.hr != null ? ` · ${listActivity.hr} bpm` : ""}
        </Text>
        <Text style={styles.debugText}>
          Source: {String(listActivity.source)}
        </Text>
        <Text style={styles.debugText}>
          Note: detailed charts are not available yet for this activity.
        </Text>
        <Text style={styles.debugText}>
          id: {String(id)} · rawId: {String(listActivity.rawId)} · externalId:{" "}
          {String(listActivity.externalId ?? "null")}
        </Text>
      </ScreenContainer>
    );
  }

  const nonDist = isNonDistanceActivity(activity.type);
  const hrZoneTimes = activity.hrZoneTimes ?? [];
  const hasHrZones = hrZoneTimes.some((t) => t > 0);
  const paceZoneTimes = activity.paceZoneTimes ?? [];
  const hasPaceZones = paceZoneTimes.some((t) => t > 0);

  const distanceLabel = formatDistance(activity.distance_km).replace(/\s*km$/i, "");

  return (
    <ScreenContainer
      scroll={false}
      contentContainerStyle={[
        styles.screenContent,
        isDarkPro && { backgroundColor: theme.appBackground },
      ]}
    >
      <ScrollView
        style={[styles.screen, isDarkPro && { backgroundColor: theme.appBackground }]}
        contentContainerStyle={[
          styles.scrollContent,
          isDarkPro && { backgroundColor: theme.appBackground },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.inner}>
          {/* Activity hero header */}
        <View
          style={[
            styles.heroCard,
            isDarkPro && {
              backgroundColor: theme.cardBackground,
              borderColor: theme.cardBorder,
            },
          ]}
        >
            <View style={styles.heroHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.heroTitle,
                    isDarkPro && { color: theme.textPrimary },
                  ]}
                  numberOfLines={2}
                >
                  {activity.name ?? activity.type}
                </Text>
                <Text
                  style={[
                    styles.heroSubtitle,
                    isDarkPro && { color: theme.textSecondary },
                  ]}
                  numberOfLines={1}
                >
                  {activity.date
                    ? format(new Date(activity.date), "EEEE, MMMM d, yyyy")
                    : ""}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 6 }}>
                {isPb && (
                  <View
                    style={[
                      styles.pbPill,
                      isMarathonPb && styles.pbPillMarathon,
                    ]}
                  >
                    <Ionicons
                      name="trophy"
                      size={12}
                      color={isMarathonPb ? "#d97706" : "#2563eb"}
                    />
                    <Text style={styles.pbPillText}>
                      {isMarathonPb ? "Marathon PB" : "PB"}
                    </Text>
                  </View>
                )}
                {activity.source === "intervals_icu" && (
                  <GpxDownloadButtonMobile
                    activityId={activity.id}
                    activityName={activity.name ?? activity.type ?? "activity"}
                  />
                )}
              </View>
            </View>

            <View style={styles.heroStatsGrid}>
              {!nonDist && (
                <HeroStatCard
                  label="Distance"
                  value={distanceLabel}
                  unit="km"
                />
              )}
              <HeroStatCard
                label="Duration"
                value={formatDuration(activity.duration_seconds)}
              />
              {!nonDist && activity.avg_pace && (
                <HeroStatCard label="Pace" value={activity.avg_pace} />
              )}
              {activity.avg_hr != null && (
                <HeroStatCard
                  label="Avg HR"
                  value={`${activity.avg_hr}`}
                  unit="bpm"
                />
              )}
            </View>

            <View style={styles.secondaryRowWrapper}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.secondaryChipsContent}
              >
                {activity.max_hr != null && (
                  <SecondaryChip label={`❤️ Max ${activity.max_hr} bpm`} />
                )}
                {activity.intensity != null && (
                  <SecondaryChip
                    label={`🔥 Intensity ${Math.round(activity.intensity)}%`}
                  />
                )}
                {activity.load != null && (
                  <SecondaryChip label={`⚡ Load ${Math.round(activity.load)}`} />
                )}
                {activity.trimp != null && (
                  <SecondaryChip
                    label={`📊 TRIMP ${Math.round(activity.trimp)}`}
                  />
                )}
                {activity.cadence != null && activity.cadence > 0 && (
                  <SecondaryChip
                    label={`🦵 Cadence ${Math.round(activity.cadence)} spm`}
                  />
                )}
                {activity.elevation_gain != null &&
                  activity.elevation_gain > 0 && (
                    <SecondaryChip
                      label={`⛰️ Climbing ${Math.round(activity.elevation_gain)} m`}
                    />
                  )}
                {activity.calories != null && activity.calories > 0 && (
                  <SecondaryChip
                    label={`🍎 ${Math.round(activity.calories)} kcal`}
                  />
                )}
              </ScrollView>
              <View pointerEvents="none" style={styles.secondaryMoreHint}>
                <Text style={styles.secondaryMoreHintText}>⋯</Text>
              </View>
            </View>
          </View>

          {/* Mini route map (no tiles, just route shape) */}
          {latlng.length >= 2 && (
            <View
              style={[
                styles.routeCard,
                isDarkPro && {
                  backgroundColor: theme.cardBackground,
                  borderColor: theme.cardBorder,
                },
              ]}
            >
              <Text
                style={[
                  styles.routeTitle,
                  isDarkPro && { color: theme.textSecondary },
                ]}
              >
                Route
              </Text>
              <View style={styles.routeMapWrapper}>
                <MiniRoute latlng={latlng} />
              </View>
            </View>
          )}

          {/* Tabs */}
          <View
            style={[
              styles.tabBar,
              isDarkPro && { backgroundColor: theme.cardBackground },
            ]}
          >
            <View style={styles.tabBarPillTrack}>
              <View
                style={[
                  styles.tabBarPill,
                  {
                    width: `${100 / 3}%`,
                    left:
                      tab === "charts"
                        ? "0%"
                        : tab === "data"
                        ? "33.3333%"
                        : "66.6667%",
                  },
                ]}
              />
              {(["charts", "data", "notes"] as ActivityTab[]).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={styles.tabButton}
                  onPress={() => setTab(t)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.tabText,
                      isDarkPro && { color: theme.textSecondary },
                      tab === t && styles.tabTextActive,
                      tab === t && isDarkPro && { color: theme.textPrimary },
                    ]}
                  >
                    {t === "charts" ? "Charts" : t === "data" ? "Data" : "Notes"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Charts tab */}
          {tab === "charts" && (
            <>
              <LapScroll laps={activity.laps} />
              {streams && processed && (
                <View
                  style={[
                    styles.chartsArea,
                    isDarkPro && { backgroundColor: theme.appBackground },
                  ]}
                >
                  {processed.pace.some((v) => v > 0) && (
                    <StreamChart
                      label="PACE"
                      labelColor="#3b82f6"
                      yLabels={paceYLabels(processed.pace)}
                      height={140}
                      data={processed.pace}
                      strokeColor="#3b82f6"
                      gradientColors={["#93c5fd", "#bfdbfe"]}
                      reversed
                      gradientId="paceGrad"
                      formatTooltip={(idx: number): TooltipLine[] => {
                        const d = activity.distance_km * (idx / Math.max(1, processed.pace.length - 1));
                        return [
                          { label: "Distance", value: `${d.toFixed(1)} km` },
                          { label: "Pace", value: `${formatPace(processed.pace[idx])} /km` },
                        ];
                      }}
                    />
                  )}

                  {processed.hr.some((v) => v > 0) && (
                    <StreamChart
                      label="HEART RATE"
                      labelColor="#c0392b"
                      yLabels={numYLabels(processed.hr)}
                      height={120}
                      data={processed.hr}
                      strokeColor="#c0392b"
                      formatTooltip={(idx: number): TooltipLine[] => {
                        const t = streams!.time[idx] ?? 0;
                        return [
                          { label: "Time", value: fmtElapsed(t) },
                          { label: "HR", value: `${Math.round(processed.hr[idx])} bpm` },
                        ];
                      }}
                    />
                  )}

                  {processed.cadence.some((v) => v > 0) && (
                    <StreamChart
                      label="CADENCE"
                      labelColor="#7c3aed"
                      yLabels={numYLabels(processed.cadence)}
                      height={100}
                      data={processed.cadence}
                      strokeColor="#7c3aed"
                      gradientColors={["#a78bfa", "#ddd6fe"]}
                      gradientId="cadGrad"
                      formatTooltip={(idx: number): TooltipLine[] => {
                        const t = streams!.time[idx] ?? 0;
                        return [
                          { label: "Time", value: fmtElapsed(t) },
                          { label: "Cadence", value: `${Math.round(processed.cadence[idx])} spm` },
                        ];
                      }}
                    />
                  )}

                  {processed.altitude.some((v) => v > 0) && (
                    <StreamChart
                      label="ALTITUDE"
                      labelColor="#16a34a"
                      yLabels={numYLabels(processed.altitude, "m")}
                      height={90}
                      data={processed.altitude}
                      strokeColor="#16a34a"
                      gradientColors={["#86efac", "#dcfce7"]}
                      gradientId="altGrad"
                      lastInSequence
                      formatTooltip={(idx: number): TooltipLine[] => {
                        const d = activity.distance_km * (idx / Math.max(1, processed.altitude.length - 1));
                        return [
                          { label: "Distance", value: `${d.toFixed(1)} km` },
                          { label: "Altitude", value: `${Math.round(processed.altitude[idx])} m` },
                        ];
                      }}
                    />
                  )}

                  <View style={styles.hrAnalysis}>
                    <HRAnalysisCharts
                      heartrate={streams.heartrate}
                      time={streams.time}
                      maxHr={activity.max_hr ?? 190}
                    />
                  </View>
                </View>
              )}
              {(!streams || !processed) && (
                <View
                  style={[
                    styles.noStreams,
                    isDarkPro && { backgroundColor: theme.appBackground },
                  ]}
                >
                  <Text
                    style={[
                      styles.noStreamsText,
                      isDarkPro && { color: theme.textSecondary },
                    ]}
                  >
                    No stream data. Sync from intervals.icu to see charts.
                  </Text>
                </View>
              )}
            </>
          )}

          {/* Data tab */}
          {tab === "data" && (
            <View style={styles.dataSection}>
              {hasHrZones && (
                <View
                  style={[
                    styles.zoneCard,
                    isDarkPro && {
                      backgroundColor: theme.cardBackground,
                      borderColor: theme.cardBorder,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.zoneTitle,
                      isDarkPro && { color: theme.textPrimary },
                    ]}
                  >
                    Heart rate zones
                  </Text>
                  <HeartRateZones
                    times={hrZoneTimes}
                    maxHr={activity.max_hr ?? null}
                  />
                </View>
              )}
              {hasPaceZones && (
                <View
                  style={[
                    styles.zoneCard,
                    isDarkPro && {
                      backgroundColor: theme.cardBackground,
                      borderColor: theme.cardBorder,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.zoneTitle,
                      isDarkPro && { color: theme.textPrimary },
                    ]}
                  >
                    Pace zones
                  </Text>
                  {renderZoneRows(paceZoneTimes, null, PACE_ZONE_NAMES, HR_ZONE_COLORS)}
                </View>
              )}

              <View
                style={[
                  styles.summaryCard,
                  isDarkPro && {
                    backgroundColor: theme.cardBackground,
                    borderColor: theme.cardBorder,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.zoneTitle,
                    isDarkPro && { color: theme.textPrimary },
                  ]}
                >
                  Summary
                </Text>
                <View style={styles.summaryGrid}>
                  {!nonDist && (
                    <SummaryItem
                      label="Distance"
                      value={formatDistance(activity.distance_km).replace(/\s*km$/i, " km")}
                    />
                  )}
                  <SummaryItem
                    label="Duration"
                    value={formatDuration(activity.duration_seconds)}
                  />
                  {!nonDist && activity.avg_pace && (
                    <SummaryItem
                      label="Avg pace"
                      value={activity.avg_pace}
                    />
                  )}
                  {activity.avg_hr != null && (
                    <SummaryItem label="Avg HR" value={`${activity.avg_hr} bpm`} />
                  )}
                  {activity.max_hr != null && (
                    <SummaryItem label="Max HR" value={`${activity.max_hr} bpm`} />
                  )}
                  {activity.avg_hr != null &&
                    activity.max_hr != null &&
                    activity.max_hr > 0 && (
                      <SummaryItem
                        label="HR %"
                        value={`${Math.round(
                          (activity.avg_hr / activity.max_hr) * 100,
                        )}%`}
                      />
                    )}
                  {activity.load != null && (
                    <SummaryItem
                      label="Training load"
                      value={`${Math.round(activity.load)}`}
                    />
                  )}
                  {activity.trimp != null && (
                    <SummaryItem
                      label="TRIMP"
                      value={`${Math.round(activity.trimp)}`}
                    />
                  )}
                  {activity.intensity != null && (
                    <SummaryItem
                      label="Intensity"
                      value={`${Math.round(activity.intensity)}%`}
                    />
                  )}
                  {activity.perceivedExertion != null && (
                    <SummaryItem
                      label="RPE"
                      value={`${Math.round(activity.perceivedExertion)}/10`}
                    />
                  )}
                  {activity.cadence != null && activity.cadence > 0 && (
                    <SummaryItem
                      label="Avg cadence"
                      value={`${Math.round(activity.cadence)} spm`}
                    />
                  )}
                  {activity.elevation_gain != null && activity.elevation_gain > 0 && (
                    <SummaryItem
                      label="Climbing"
                      value={`${Math.round(activity.elevation_gain)} m`}
                    />
                  )}
                  {activity.calories != null && activity.calories > 0 && (
                    <SummaryItem
                      label="Calories"
                      value={`${Math.round(activity.calories)} kcal`}
                    />
                  )}
                </View>
              </View>

              {activity.laps.length > 0 && (
                <View
                  style={[
                    styles.splitsCard,
                    isDarkPro && {
                      backgroundColor: theme.cardBackground,
                      borderColor: theme.cardBorder,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.zoneTitle,
                      isDarkPro && { color: theme.textPrimary },
                    ]}
                  >
                    Splits
                  </Text>
                  <View style={styles.splitsHeaderRow}>
                    <Text style={[styles.splitsHeader, { flex: 1 }]}>#</Text>
                    <Text
                      style={[
                        styles.splitsHeader,
                        { flex: 2, textAlign: "right" },
                      ]}
                    >
                      Time
                    </Text>
                    <Text
                      style={[
                        styles.splitsHeader,
                        { flex: 2, textAlign: "right" },
                      ]}
                    >
                      Pace
                    </Text>
                    <Text
                      style={[
                        styles.splitsHeader,
                        { flex: 2, textAlign: "right" },
                      ]}
                    >
                      HR
                    </Text>
                    <Text
                      style={[
                        styles.splitsHeader,
                        { flex: 1.5, textAlign: "right" },
                      ]}
                    >
                      Zone
                    </Text>
                  </View>
                  {activity.laps.map((lap, idx) => {
                    const zIndex = Number(lap.zone?.replace(/[^\d]/g, "")) || 0;
                    return (
                      <View key={idx} style={styles.splitsRow}>
                        <Text
                          style={[
                            styles.splitsCell,
                            isDarkPro && { color: theme.textPrimary },
                            { flex: 1 },
                          ]}
                        >
                          {idx + 1}
                        </Text>
                        <Text
                          style={[
                            styles.splitsCell,
                            isDarkPro && { color: theme.textPrimary },
                            { flex: 2, textAlign: "right" },
                          ]}
                        >
                          {lap.duration}
                        </Text>
                        <Text
                          style={[
                            styles.splitsCell,
                            isDarkPro && { color: theme.textPrimary },
                            { flex: 2, textAlign: "right" },
                          ]}
                        >
                          {lap.pace}
                        </Text>
                        <Text
                          style={[
                            styles.splitsCell,
                            isDarkPro && { color: theme.textPrimary },
                            { flex: 2, textAlign: "right" },
                          ]}
                        >
                          {lap.hr != null ? `${lap.hr}` : "—"}
                        </Text>
                        <View
                          style={[
                            styles.splitsCell,
                            {
                              flex: 1.5,
                              flexDirection: "row",
                              alignItems: "center",
                              justifyContent: "flex-end",
                            },
                          ]}
                        >
                          {zIndex > 0 && (
                            <>
                              <View
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: 999,
                                  marginRight: 4,
                                  backgroundColor:
                                    HR_ZONE_COLORS[zIndex - 1] ??
                                    lap.zoneColor ??
                                    "#3b82f6",
                                }}
                              />
                              <Text
                                style={[
                                  styles.splitsZoneText,
                                  isDarkPro && { color: theme.textPrimary },
                                ]}
                              >
                                {`Z${zIndex}`}
                              </Text>
                            </>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {/* Notes tab */}
          {tab === "notes" && (
            <View style={styles.notesTab}>
              <View
                style={[
                  styles.notesCard,
                  isDarkPro && {
                    backgroundColor: theme.cardBackground,
                    borderColor: theme.cardBorder,
                  },
                ]}
              >
                <View style={styles.coachHeaderRow}>
                  <Text
                    style={[
                      styles.notesTitle,
                      isDarkPro && { color: theme.textPrimary },
                    ]}
                  >
                    Kipcoachee
                  </Text>
                  {coachLoading && (
                    <ActivityIndicator
                      size="small"
                      color={isDarkPro ? theme.textSecondary : "#6b7280"}
                    />
                  )}
                </View>
                {coachError && !coachNote ? (
                  <Text
                    style={[
                      styles.notesText,
                      isDarkPro && { color: theme.textPrimary },
                    ]}
                  >
                    Could not generate feedback. Tap below to retry.
                  </Text>
                ) : coachNote ? (
                  <Text
                    style={[
                      styles.notesText,
                      isDarkPro && { color: theme.textPrimary },
                    ]}
                  >
                    {coachNote}
                  </Text>
                ) : (
                  <Text
                    style={[
                      styles.notesText,
                      isDarkPro && { color: theme.textPrimary },
                    ]}
                  >
                    Analyzing your activity…
                  </Text>
                )}
                <TouchableOpacity
                  style={[
                    styles.regenButton,
                    isDarkPro && { backgroundColor: theme.cardBorder },
                  ]}
                  onPress={() => generateCoachNote(true)}
                  activeOpacity={0.8}
                  disabled={coachLoading}
                >
                  <Text
                    style={[
                      styles.regenButtonText,
                      isDarkPro && { color: theme.textSecondary },
                    ]}
                  >
                    {coachLoading ? "Generating…" : "Regenerate feedback"}
                  </Text>
                </TouchableOpacity>
              </View>

              <View
                style={[
                  styles.notesCard,
                  isDarkPro && {
                    backgroundColor: theme.cardBackground,
                    borderColor: theme.cardBorder,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.notesTitle,
                    isDarkPro && { color: theme.textPrimary },
                  ]}
                >
                  Training notes
                </Text>
                <Text
                  style={[
                    styles.notesLabel,
                    isDarkPro && { color: theme.textSecondary },
                  ]}
                >
                  How you felt & notes
                </Text>
                <TextInput
                  multiline
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="e.g. Legs felt heavy, good session overall…"
                  style={[
                    styles.notesInput,
                    isDarkPro && {
                      backgroundColor: theme.surfaceElevated,
                      borderColor: theme.cardBorder,
                      color: theme.textPrimary,
                    },
                  ]}
                  textAlignVertical="top"
                />
                <View style={styles.nomioRow}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Text
                      style={[
                        styles.notesLabel,
                        isDarkPro && { color: theme.textSecondary },
                      ]}
                    >
                      Nomio drink before
                    </Text>
                  </View>
                  <Switch value={nomio} onValueChange={setNomio} />
                </View>
                <Text
                  style={[
                    styles.notesLabel,
                    isDarkPro && { color: theme.textSecondary },
                  ]}
                >
                  Lactate levels
                </Text>
                <TextInput
                  multiline
                  value={lactate}
                  onChangeText={setLactate}
                  placeholder="e.g. After each rep: 4.2, 5.1, 4.8 — or post-session: 3.5"
                  style={[
                    styles.notesInput,
                    isDarkPro && {
                      backgroundColor: theme.surfaceElevated,
                      borderColor: theme.cardBorder,
                      color: theme.textPrimary,
                    },
                  ]}
                  textAlignVertical="top"
                />
                {savingNotes && (
                  <Text
                    style={[
                      styles.savingLabel,
                      isDarkPro && { color: theme.textSecondary },
                    ]}
                  >
                    Saving…
                  </Text>
                )}
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
};

const HR_ZONE_COLORS = [
  "#94a3b8",
  "#3b82f6",
  "#22c55e",
  "#f97316",
  "#ef4444",
  "#dc2626",
];

const HR_ZONE_NAMES = [
  "Z1 Recovery",
  "Z2 Aerobic",
  "Z3 Tempo",
  "Z4 Threshold",
  "Z5 VO2max",
  "Z5+ Anaerobic",
];

const PACE_ZONE_NAMES = [
  "Z1 Easy",
  "Z2 Moderate",
  "Z3 Tempo",
  "Z4 Threshold",
  "Z5 Interval",
  "Z6 Sprint",
];

function renderZoneRows(
  times: number[],
  maxHr: number | null,
  names: string[],
  colors: string[],
) {
  if (!times.length) return null;
  const total = times.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  const maxTime = Math.max(...times);
  return times.map((t, i) => {
    const pct = total > 0 ? (t / total) * 100 : 0;
    const barPct = maxTime > 0 ? (t / maxTime) * 100 : 0;
    const mins = Math.round(t / 60);
  const totalSec = Math.round(t);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const timeStr =
    m >= 60
      ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`
      : `${m}:${String(s).padStart(2, "0")}`;
    let hrRange = "";
    if (maxHr && maxHr > 0) {
      const ranges = [
        `0-${Math.round(maxHr * 0.6)}`,
        `${Math.round(maxHr * 0.6)}-${Math.round(maxHr * 0.7)}`,
        `${Math.round(maxHr * 0.7)}-${Math.round(maxHr * 0.8)}`,
        `${Math.round(maxHr * 0.8)}-${Math.round(maxHr * 0.9)}`,
        `${Math.round(maxHr * 0.9)}-${Math.round(maxHr * 0.95)}`,
        `${Math.round(maxHr * 0.95)}-${maxHr}`,
      ];
      hrRange = ranges[i] ?? "";
    }
    return (
      <View key={i} style={styles.zoneRow}>
        <View
          style={{ flex: 2, flexDirection: "row", alignItems: "center", gap: 6 }}
        >
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              backgroundColor: colors[i] ?? colors[colors.length - 1],
            }}
          />
          <Text style={styles.zoneLabel}>{names[i] ?? `Zone ${i + 1}`}</Text>
        </View>
        {maxHr && (
          <Text style={[styles.zoneCell, { flex: 1.4 }]}>{hrRange}</Text>
        )}
        <View style={[styles.zoneBarBackground, { flex: 2.4 }]}>
          <View
            style={[
              styles.zoneBarFill,
              {
                width: `${Math.max(4, Math.min(100, barPct))}%`,
                backgroundColor: colors[i] ?? colors[colors.length - 1],
              },
            ]}
          />
        </View>
        <Text style={[styles.zoneCell, { flex: 1.4, textAlign: "right" }]}>
          {t > 0 ? timeStr : "—"}
        </Text>
        <Text style={[styles.zoneCell, { flex: 1, textAlign: "right" }]}>
          {pct > 0.5 ? `${pct.toFixed(1)}%` : pct > 0 ? "<1%" : "0%"}
        </Text>
      </View>
    );
  });
}

const SummaryItem: FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.summaryItem}>
    <Text style={styles.summaryLabel}>{label}</Text>
    <Text style={styles.summaryValue}>{value}</Text>
  </View>
);

const HeroStatCard: FC<{ label: string; value: string; unit?: string }> = ({
  label,
  value,
  unit,
}) => (
  <View style={styles.heroStatCard}>
    <Text style={styles.heroStatLabel}>{label}</Text>
    <Text style={styles.heroStatValue}>
      {value}
      {unit ? <Text style={styles.heroStatUnit}> {unit}</Text> : null}
    </Text>
  </View>
);

const SecondaryChip: FC<{ label: string }> = ({ label }) => (
  <View style={styles.secondaryChip}>
    <Text style={styles.secondaryChipText}>{label}</Text>
  </View>
);

const GpxDownloadButtonMobile: FC<{ activityId: string; activityName: string }> = ({
  activityId,
  activityName,
}) => {
  const [loading, setLoading] = useState(false);
  const activityIdForApi = activityId.startsWith("icu_")
    ? activityId.replace(/^icu_/, "")
    : activityId;

  const onPress = useCallback(async () => {
    if (!activityIdForApi || loading) return;
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        Alert.alert("GPX unavailable", "You are not logged in.");
        return;
      }
      const { data, error } = await callEdgeFunctionWithRetry({
        functionName: "intervals-proxy",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { action: "gpx", activityId: activityIdForApi },
        timeoutMs: 20000,
        maxRetries: 3,
        logContext: "ActivityDetailScreen:gpx",
      });
      if (error || (data && typeof data === "object" && "error" in (data as object))) {
        Alert.alert("GPX unavailable", "No GPS track for this activity.");
        return;
      }
      const gpx = typeof data === "string" ? data : JSON.stringify(data);
      const safeName = activityName.replace(/[^a-zA-Z0-9-_]/g, "_") || "activity";
      const fileName = `${safeName}-${activityIdForApi}.gpx`;
      const uri = `${FileSystem.cacheDirectory ?? ""}${fileName}`;
      await FileSystem.writeAsStringAsync(uri, gpx, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const sharingAvailable = await Sharing.isAvailableAsync();
      if (sharingAvailable) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/gpx+xml",
          dialogTitle: "Share GPX file",
        });
      } else {
        Alert.alert("GPX saved", `File saved to cache as ${fileName}.`);
      }
    } catch {
      Alert.alert("GPX error", "Unable to download GPX right now.");
    } finally {
      setLoading(false);
    }
  }, [activityIdForApi, activityName, loading]);

  return (
    <TouchableOpacity
      style={styles.gpxIconButton}
      onPress={onPress}
      activeOpacity={0.8}
      disabled={loading}
    >
      <Ionicons
        name="cloud-download-outline"
        size={16}
        color={loading ? "#9ca3af" : "#0f172a"}
      />
    </TouchableOpacity>
  );
};

const MiniRoute: FC<{ latlng: [number, number][] }> = ({ latlng }) => {
  if (latlng.length < 2) return null;
  const lats = latlng.map((p) => p[0]);
  const lngs = latlng.map((p) => p[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const dLat = maxLat - minLat || 1;
  const dLng = maxLng - minLng || 1;

  const pad = 6;
  const width = 120;
  const height = 80;

  const toXY = (lat: number, lng: number) => {
    const x = pad + ((lng - minLng) / dLng) * (width - 2 * pad);
    const y =
      pad + ((maxLat - lat) / dLat) * (height - 2 * pad); // invert lat for screen coords
    return { x, y };
  };

  let d = "";
  latlng.forEach((p, idx) => {
    const { x, y } = toXY(p[0], p[1]);
    d += idx === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  });

  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`}>
      <Rect
        x={0.5}
        y={0.5}
        width={width - 1}
        height={height - 1}
        rx={8}
        ry={8}
        fill="#f3f4f6"
        stroke="#e5e7eb"
      />
      <Path
        d={d}
        stroke="#3b82f6"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
};

const styles = StyleSheet.create({
  screenContent: {
    flex: 1,
    backgroundColor: "#f5f5f0",
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  screen: { flex: 1, backgroundColor: "#f5f5f0" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  content: { padding: 16 },
  scrollContent: { paddingBottom: 40, backgroundColor: "#f5f5f0" },
  inner: { maxWidth: 430, width: "100%", alignSelf: "center" },
  heroCard: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 16,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  heroHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  heroSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: "#6b7280",
  },
  pbPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "#e0f2fe",
    marginLeft: 8,
  },
  pbPillMarathon: {
    backgroundColor: "#fef3c7",
  },
  pbPillText: {
    marginLeft: 4,
    fontSize: 10,
    fontWeight: "600",
    color: "#0f172a",
  },
  heroStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 12,
    rowGap: 12,
    marginTop: 16,
  },
  heroStatCard: {
    flexBasis: "48%",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: "#f3f4f6",
    alignItems: "flex-start",
  },
  heroStatLabel: {
    fontSize: 10,
    color: "#6b7280",
    marginBottom: 2,
  },
  heroStatValue: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
  },
  heroStatUnit: {
    fontSize: 13,
    fontWeight: "400",
    color: "#6b7280",
  },
  secondaryChipsContent: {
    paddingTop: 14,
    paddingBottom: 2,
    paddingRight: 4,
    columnGap: 8,
  },
  secondaryRowWrapper: {
    marginTop: 4,
  },
  secondaryChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
    marginRight: 8,
  },
  secondaryChipText: {
    fontSize: 12,
    color: "#111827",
  },
  secondaryMoreHint: {
    position: "absolute",
    right: 0,
    top: 10,
    bottom: 6,
    justifyContent: "center",
    paddingLeft: 12,
    paddingRight: 8,
    backgroundColor: "rgba(245,245,240,0.9)",
  },
  secondaryMoreHintText: {
    fontSize: 14,
    color: "#9ca3af",
  },
  gpxIconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e5e7eb",
  },
  routeCard: {
    backgroundColor: "#ffffff",
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
  },
  routeTitle: { fontSize: 12, fontWeight: "600", color: "#6b7280", marginBottom: 6 },
  routeMapWrapper: {
    height: 90,
  },
  chartsArea: {
    backgroundColor: "#f8f7f2",
    paddingBottom: 16,
  },
  hrAnalysis: { marginTop: 0 },
  noStreams: { padding: 24, alignItems: "center", backgroundColor: "#f5f5f0" },
  noStreamsText: { fontSize: 13, color: "#999", textAlign: "center", lineHeight: 20 },
  tabBar: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  tabBarPillTrack: {
    flexDirection: "row",
    backgroundColor: "transparent",
    borderRadius: 999,
    padding: 3,
    overflow: "hidden",
    backgroundColor: "rgba(148, 163, 184, 0.25)",
  },
  tabBarPill: {
    position: "absolute",
    top: 3,
    bottom: 3,
    borderRadius: 999,
    backgroundColor: "#ffffff",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  tabText: {
    fontSize: 13,
    color: "#6b7280",
    fontWeight: "500",
  },
  tabTextActive: {
    color: "#111827",
  },
  dataSection: {
    marginTop: 4,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  zoneCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
    marginBottom: 10,
  },
  zoneTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 6,
  },
  zoneRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  zoneLabel: {
    fontSize: 10,
    color: "#111827",
  },
  zoneCell: {
    fontSize: 11,
    color: "#6b7280",
  },
  zoneBarBackground: {
    height: 10,
    borderRadius: 999,
    backgroundColor: "#e5e7eb",
    overflow: "hidden",
    marginHorizontal: 6,
  },
  zoneBarFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#3b82f6",
  },
  summaryCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
    marginBottom: 10,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 6,
  },
  summaryItem: {
    width: "33.3333%",
    paddingRight: 8,
    paddingBottom: 10,
  },
  summaryLabel: {
    fontSize: 11,
    color: "#6b7280",
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
    marginTop: 1,
  },
  splitsCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
    marginBottom: 10,
  },
  splitsHeaderRow: {
    flexDirection: "row",
    marginBottom: 6,
  },
  splitsHeader: {
    fontSize: 11,
    color: "#6b7280",
    fontWeight: "600",
  },
  splitsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#f3f4f6",
  },
  splitsCell: {
    fontSize: 11,
    color: "#111827",
  },
  splitsZoneText: {
    fontSize: 11,
    color: "#111827",
  },
  notesTab: {
    marginTop: 4,
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 12,
  },
  notesCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
  },
  coachHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  notesTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
  },
  notesLabel: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 8,
    marginBottom: 4,
  },
  notesText: {
    fontSize: 13,
    color: "#111827",
    lineHeight: 18,
  },
  regenButton: {
    marginTop: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#e5e7eb",
  },
  regenButtonText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#374151",
  },
  notesInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#d1d5db",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 72,
    fontSize: 13,
    color: "#111827",
    backgroundColor: "#f9fafb",
  },
  nomioRow: {
    marginTop: 10,
    marginBottom: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  savingLabel: {
    marginTop: 4,
    fontSize: 11,
    color: "#6b7280",
  },
  debugText: {
    marginTop: 6,
    fontSize: 11,
    color: "#9ca3af",
  },
});
