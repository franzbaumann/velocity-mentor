import { FC, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { ScreenContainer } from "../components/ScreenContainer";
import { GlassCard } from "../components/GlassCard";
import { useTheme } from "../context/ThemeContext";
import { useSupabaseAuth } from "../SupabaseProvider";
import { lightTheme, darkProTheme } from "../theme/themes";
import { spacing, typography } from "../theme/theme";
import { useIntervalsIntegration } from "../hooks/useIntervalsIntegration";
import { useIntervalsSync } from "../hooks/useIntervalsSync";
import { supabase, callEdgeFunctionWithRetry } from "../shared/supabase";
import { callEdgeFunctionWithRetry as callEdgeFetchWithRetry } from "../lib/edgeFunctionWithRetry";
import type { AppTabsParamList } from "../navigation/RootNavigator";
import { useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { useOnboardingStatus } from "../hooks/useOnboardingStatus";
import { useDailyStreak } from "../hooks/useDailyStreak";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAppleHealth } from "../hooks/useAppleHealth";
import { useAppleHealthSync, APPLE_HEALTH_SYNC_STORAGE_KEY } from "../hooks/useAppleHealthSync";
import { getLocalDateString } from "../lib/date";

const APPEARANCE_OPTIONS: { name: "light" | "darkPro"; label: string; emoji: string; previewTheme: typeof lightTheme }[] = [
  { name: "light", label: "Light", emoji: "☀️", previewTheme: lightTheme },
  { name: "darkPro", label: "Dark Pro", emoji: "🌑", previewTheme: darkProTheme },
];

export const SettingsScreen: FC = () => {
  const { signOut } = useSupabaseAuth();
  const { themeName, theme, setTheme, colors } = useTheme();
  const navigation = useNavigation<BottomTabNavigationProp<AppTabsParamList, "Settings">>();
  const queryClient = useQueryClient();
  const {
    integration,
    isConnected,
    isLoading: intervalsLoading,
    save,
    isSaving,
    disconnect,
    errorMessage,
  } = useIntervalsIntegration();

  const { runSync, runQuickSync, syncing: isSyncing, progress: syncProgress } = useIntervalsSync();
  const { resetForTesting: resetTutorial } = useOnboardingStatus();
  const streak = useDailyStreak();
  const appleHealth = useAppleHealth();
  const { syncNow: syncAppleHealthNow, syncing: appleHealthSyncing } = useAppleHealthSync();

  const [athleteId, setAthleteId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [maxHr, setMaxHr] = useState("");
  const [restingHr, setRestingHr] = useState("");
  const [savingHr, setSavingHr] = useState(false);
  const [hrLoaded, setHrLoaded] = useState(false);
  const [labSummary, setLabSummary] = useState<{
    vo2max?: number | null;
    lactate_threshold_hr?: number | null;
    lactate_threshold_pace?: string | null;
    vlamax?: number | null;
    max_hr_measured?: number | null;
    lab_test_date?: string | null;
    lab_name?: string | null;
    lt1_hr?: number | null;
    lt1_pace?: string | null;
    zone_source?: string | null;
  } | null>(null);
  const [isClearingMemories, setIsClearingMemories] = useState(false);
  const [clearAllVisible, setClearAllVisible] = useState(false);
  const [showAdvancedIntervals, setShowAdvancedIntervals] = useState(false);

  const [isTestingIntervals, setIsTestingIntervals] = useState(false);
  const [streamsSyncing, setStreamsSyncing] = useState(false);
  const [pbsSyncing, setPbsSyncing] = useState(false);
  const [labExtracting, setLabExtracting] = useState(false);
  const [labExtractAttempt, setLabExtractAttempt] = useState(1);
  const [labSaving, setLabSaving] = useState(false);
  const [labConfirmVisible, setLabConfirmVisible] = useState(false);
  const [labForm, setLabForm] = useState<{
    vo2max?: string;
    ltHr?: string;
    ltPace?: string;
    lt1Hr?: string;
    lt1Pace?: string;
    vlamax?: string;
    maxHrMeasured?: string;
  }>({});

  const [coachingMemories, setCoachingMemories] = useState<
    {
      id: string;
      category: string | null;
      content: string;
      created_at: string;
      importance: number | null;
      expires_at: string | null;
    }[]
  >([]);
  const [memoriesLoaded, setMemoriesLoaded] = useState(false);
  const [memoriesLoading, setMemoriesLoading] = useState(false);

  useEffect(() => {
    if (integration) {
      setAthleteId(integration.athlete_id ?? "");
      setApiKey(integration.api_key ?? "");
    } else {
      setAthleteId("");
      setApiKey("");
    }
  }, [integration?.athlete_id, integration?.api_key]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setHrLoaded(true);
        return;
      }
      const { data, error } = await supabase
        .from("athlete_profile")
        .select(
          "max_hr, resting_hr, vo2max, lactate_threshold_hr, lactate_threshold_pace, vlamax, max_hr_measured, lab_test_date, lab_name, lt1_hr, lt1_pace, zone_source",
        )
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled || error) {
        setHrLoaded(true);
        return;
      }
      if (data) {
        setMaxHr(data.max_hr != null ? String(data.max_hr) : "");
        setRestingHr(data.resting_hr != null ? String(data.resting_hr) : "");
        setLabSummary({
          vo2max: (data as any).vo2max,
          lactate_threshold_hr: (data as any).lactate_threshold_hr,
          lactate_threshold_pace: (data as any).lactate_threshold_pace,
          vlamax: (data as any).vlamax,
          max_hr_measured: (data as any).max_hr_measured,
          lab_test_date: (data as any).lab_test_date,
          lab_name: (data as any).lab_name,
          lt1_hr: (data as any).lt1_hr,
          lt1_pace: (data as any).lt1_pace,
          zone_source: (data as any).zone_source,
        });
      }
      setHrLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!labSummary) return;
    setLabForm({
      vo2max: labSummary.vo2max != null ? String(labSummary.vo2max) : "",
      ltHr: labSummary.lactate_threshold_hr != null ? String(labSummary.lactate_threshold_hr) : "",
      ltPace: labSummary.lactate_threshold_pace ?? "",
      lt1Hr: labSummary.lt1_hr != null ? String(labSummary.lt1_hr) : "",
      lt1Pace: labSummary.lt1_pace ?? "",
      vlamax: labSummary.vlamax != null ? String(labSummary.vlamax) : "",
      maxHrMeasured: labSummary.max_hr_measured != null ? String(labSummary.max_hr_measured) : "",
    });
  }, [labSummary]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setMemoriesLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || cancelled) {
          setCoachingMemories([]);
          setMemoriesLoaded(true);
          setMemoriesLoading(false);
          return;
        }
        const { data, error } = await supabase
          .from("coaching_memory")
          .select("id, category, content, created_at, importance, expires_at")
          .eq("user_id", user.id)
          .order("importance", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false });
        if (error || cancelled) {
          setCoachingMemories([]);
        } else {
          setCoachingMemories((data ?? []) as any);
        }
      } catch (e) {
        console.error(e);
        setCoachingMemories([]);
      } finally {
        if (!cancelled) {
          setMemoriesLoaded(true);
          setMemoriesLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSaveHr = async () => {
    const maxVal = maxHr.trim() ? parseInt(maxHr.trim(), 10) : null;
    const restVal = restingHr.trim() ? parseInt(restingHr.trim(), 10) : null;
    if (maxVal != null && (maxVal < 100 || maxVal > 250)) {
      Alert.alert("Invalid max HR", "Max HR should be between 100 and 250 bpm.");
      return;
    }
    if (restVal != null && (restVal < 30 || restVal > 120)) {
      Alert.alert("Invalid resting HR", "Resting HR should be between 30 and 120 bpm.");
      return;
    }
    setSavingHr(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert("Not signed in", "Sign in again and try saving your heart rate settings.");
        return;
      }
      const { data: existing } = await supabase
        .from("athlete_profile")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      const payload = { max_hr: maxVal, resting_hr: restVal };
      const { error } = existing
        ? await supabase.from("athlete_profile").update(payload).eq("user_id", user.id)
        : await supabase.from("athlete_profile").insert({ user_id: user.id, name: "Athlete", ...payload });
      if (error) throw error;
      Alert.alert("Saved", "Heart rate settings updated.");
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Failed to save heart rate settings.");
    } finally {
      setSavingHr(false);
    }
  };

  const handleDeletePlan = async () => {
    Alert.alert(
      "Delete training plan?",
      "Delete your current training plan and start onboarding again?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const {
                data: { user },
              } = await supabase.auth.getUser();
              if (!user) {
                Alert.alert("Not signed in", "Sign in again and try deleting the plan.");
                return;
              }
              const { data: plans } = await supabase
                .from("training_plan")
                .select("id")
                .eq("user_id", user.id);
              for (const p of plans ?? []) {
                // eslint-disable-next-line no-await-in-loop
                await supabase.from("training_plan").delete().eq("id", (p as any).id);
              }
              await supabase.from("athlete_profile").upsert(
                {
                  user_id: user.id,
                  onboarding_complete: false,
                  onboarding_answers: null,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: "user_id" },
              );
              queryClient.invalidateQueries({ queryKey: ["training-plan"] });
              Toast.show({ type: "neutral", text1: "Plan removed", position: "bottom", visibilityTime: 2500 });
              Alert.alert("Plan deleted", "Starting fresh onboarding on the Plan tab.");
              navigation.navigate("Plan");
            } catch (e) {
              console.error(e);
              Alert.alert("Error", "Failed to delete training plan.");
            }
          },
        },
      ],
    );
  };

  const handleClearData = async () => {
    Alert.alert(
      "Clear imported data?",
      "Delete all imported activities and wellness data? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const {
                data: { user },
              } = await supabase.auth.getUser();
              if (!user) {
                Alert.alert("Not signed in", "Sign in again and try clearing data.");
                return;
              }
              await supabase.from("activity").delete().eq("user_id", user.id);
              await supabase.from("daily_readiness").delete().eq("user_id", user.id);
              queryClient.invalidateQueries({ queryKey: ["activities-dashboard"] });
              queryClient.invalidateQueries({ queryKey: ["daily_readiness-dashboard"] });
              Alert.alert("Done", "All imported data cleared.");
            } catch (e) {
              console.error(e);
              Alert.alert("Error", "Failed to clear imported data.");
            }
          },
        },
      ],
    );
  };

  const handleTestConnection = async () => {
    setIsTestingIntervals(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        Alert.alert("Not signed in", "Sign out and sign back in, then try again.");
        return;
      }
      const { data, error } = await callEdgeFunctionWithRetry({
        functionName: "intervals-proxy",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { action: "test_connection" },
        timeoutMs: 30000,
        maxRetries: 3,
        logContext: "SettingsScreen:test_connection",
      });
      if (error) {
        const msg = error.message ?? "Connection failed";
        const hint =
          msg.includes("Refresh Token") || msg.includes("401") || msg.includes("403")
            ? " Try signing out and signing back in first."
            : "";
        Alert.alert("intervals.icu", msg + hint);
        return;
      }
      const result = data as { ok?: boolean; error?: string } | null;
      if (result?.ok === false && result.error) {
        Alert.alert("intervals.icu", result.error);
        return;
      }
      if (result?.ok === true) {
        Alert.alert("intervals.icu", "Connection works! API key is valid.");
      } else {
        Alert.alert("intervals.icu", "Connection failed.");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Connection failed";
      const hint =
        msg.includes("Refresh Token") || msg.includes("401") || msg.includes("403")
          ? " Sign out and sign back in, then verify your intervals.icu API key."
          : "";
      Alert.alert("intervals.icu", msg + hint);
    } finally {
      setIsTestingIntervals(false);
    }
  };

  const handleSyncStreams = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        Alert.alert("Not signed in", "Sign in again and try syncing streams.");
        return;
      }
      setStreamsSyncing(true);
      const { data, error } = await callEdgeFunctionWithRetry({
        functionName: "intervals-proxy",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { action: "sync_streams" },
        timeoutMs: 60000,
        maxRetries: 3,
        logContext: "SettingsScreen:sync_streams",
      });
      if (error) {
        Alert.alert("Error", error.message ?? "Failed to sync chart data.");
        return;
      }
      const res = data as { ok?: number; failed?: number; total?: number } | null;
      const ok = res?.ok ?? 0;
      const total = res?.total ?? 0;
      Alert.alert("Done", `Chart data synced for ${ok} of ${total} activities.`);
      queryClient.invalidateQueries({ queryKey: ["activities-dashboard"] });
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to sync chart data.");
    } finally {
      setStreamsSyncing(false);
    }
  };

  const handleSyncPRs = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        Alert.alert("Not signed in", "Sign in again and try syncing PRs.");
        return;
      }
      setPbsSyncing(true);
      const { data, error } = await callEdgeFunctionWithRetry({
        functionName: "intervals-proxy",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { action: "sync_pbs" },
        timeoutMs: 60000,
        maxRetries: 3,
        logContext: "SettingsScreen:sync_pbs",
      });
      if (error) {
        Alert.alert("Error", error.message ?? "Failed to sync PRs.");
        return;
      }
      const res = data as { pbs?: number } | null;
      Alert.alert("Done", `Synced ${res?.pbs ?? 0} personal records.`);
      queryClient.invalidateQueries({ queryKey: ["personal_records-mobile"] });
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to sync PRs.");
    } finally {
      setPbsSyncing(false);
    }
  };

  const handleUploadLabPdf = async () => {
    try {
      const pickResult = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
      });
      if (pickResult.canceled || !pickResult.assets || pickResult.assets.length === 0) {
        return;
      }
      const asset = pickResult.assets[0];
      if (!asset.uri) {
        Alert.alert("Error", "Could not read selected file.");
        return;
      }
      setLabExtracting(true);
      setLabExtractAttempt(1);
      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? null;
      if (!token) {
        Alert.alert("Sign in required", "Please sign in again to analyze lab results.");
        return;
      }
      const json = await callEdgeFetchWithRetry<{ extracted?: Record<string, unknown>; error?: string }>(
        "lab-extract",
        { pdf: base64 },
        {
          authToken: token,
          maxRetries: 3,
          timeout: 30000,
          onRetry: (attempt) => setLabExtractAttempt(attempt),
        },
      );
      const extracted = json?.extracted ?? {};
      setLabForm((prev) => ({
        vo2max: extracted.vo2max != null ? String(extracted.vo2max) : prev.vo2max ?? "",
        ltHr: extracted.lactate_threshold_hr != null ? String(extracted.lactate_threshold_hr) : prev.ltHr ?? "",
        ltPace:
          extracted.lactate_threshold_pace != null ? String(extracted.lactate_threshold_pace) : prev.ltPace ?? "",
        vlamax: extracted.vlamax != null ? String(extracted.vlamax) : prev.vlamax ?? "",
        maxHrMeasured:
          extracted.max_hr_measured != null ? String(extracted.max_hr_measured) : prev.maxHrMeasured ?? "",
      }));
      setLabSummary((prev) => ({
        ...(prev ?? {}),
        vo2max: extracted.vo2max ?? (prev?.vo2max ?? null),
        lactate_threshold_hr: extracted.lactate_threshold_hr ?? (prev?.lactate_threshold_hr ?? null),
        lactate_threshold_pace: extracted.lactate_threshold_pace ?? (prev?.lactate_threshold_pace ?? null),
        vlamax: extracted.vlamax ?? (prev?.vlamax ?? null),
        max_hr_measured: extracted.max_hr_measured ?? (prev?.max_hr_measured ?? null),
        lab_test_date: extracted.test_date ?? prev?.lab_test_date ?? null,
        lab_name: extracted.lab_name ?? prev?.lab_name ?? null,
      }));
      Alert.alert("Done", "Lab results extracted. Review and save to apply.");
    } catch (e) {
      console.error(e);
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to analyze lab PDF.");
    } finally {
      setLabExtracting(false);
      setLabExtractAttempt(1);
    }
  };

  const performSaveLab = async () => {
    if (labSaving) return;
    setLabSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert("Not signed in", "Sign in again and try saving lab results.");
        return;
      }
      const vo2 =
        labForm.vo2max && labForm.vo2max.trim() ? Number.parseFloat(labForm.vo2max.trim()) : null;
      const ltHr =
        labForm.ltHr && labForm.ltHr.trim() ? Number.parseInt(labForm.ltHr.trim(), 10) : null;
      const vlamax =
        labForm.vlamax && labForm.vlamax.trim() ? Number.parseFloat(labForm.vlamax.trim()) : null;
      const maxHr =
        labForm.maxHrMeasured && labForm.maxHrMeasured.trim()
          ? Number.parseInt(labForm.maxHrMeasured.trim(), 10)
          : null;
      const ltPace = labForm.ltPace && labForm.ltPace.trim() ? labForm.ltPace.trim() : null;
      const lt1Hr =
        labForm.lt1Hr && labForm.lt1Hr.trim() ? Number.parseInt(labForm.lt1Hr.trim(), 10) : null;
      const lt1Pace = labForm.lt1Pace && labForm.lt1Pace.trim() ? labForm.lt1Pace.trim() : null;

      const updates: Record<string, unknown> = {
        user_id: user.id,
        updated_at: new Date().toISOString(),
      };
      updates.vo2max = vo2;
      updates.lactate_threshold_hr = ltHr;
      updates.lactate_threshold_pace = ltPace;
      updates.lt1_hr = lt1Hr;
      updates.lt1_pace = lt1Pace;
      updates.zone_source = (lt1Hr || lt1Pace || ltHr || ltPace) ? "lab_test" : "hr_formula";
      updates.vlamax = vlamax;
      updates.max_hr_measured = maxHr;

      const { error } = await supabase
        .from("athlete_profile")
        .upsert(updates, { onConflict: "user_id" });
      if (error) throw error;

      setLabSummary((prev) => ({
        ...(prev ?? {}),
        vo2max: vo2,
        lactate_threshold_hr: ltHr,
        lactate_threshold_pace: ltPace,
        lt1_hr: lt1Hr,
        lt1_pace: lt1Pace,
        zone_source: updates.zone_source as string,
        vlamax,
        max_hr_measured: maxHr,
      }));
      Alert.alert("Saved", "Lab results updated.");
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Failed to save lab results.");
    } finally {
      setLabSaving(false);
      setLabConfirmVisible(false);
    }
  };

  const handleDeleteMemory = async (id: string) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert("Not signed in", "Sign in again and try deleting this memory.");
        return;
      }
      const { error } = await supabase.from("coaching_memory").delete().eq("id", id).eq("user_id", user.id);
      if (error) throw error;
      setCoachingMemories((prev) => prev.filter((m) => m.id !== id));
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Failed to delete coaching memory.");
    }
  };

  const handleClearAllMemories = async () => {
    setIsClearingMemories(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert("Not signed in", "Sign in again and try clearing memories.");
        return;
      }
      const { error } = await supabase.from("coaching_memory").delete().eq("user_id", user.id);
      if (error) throw error;
      setCoachingMemories([]);
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Failed to clear memories.");
    } finally {
      setIsClearingMemories(false);
      setClearAllVisible(false);
    }
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        content: { gap: 16 },
        title: { fontSize: 22, fontWeight: "600", color: colors.foreground },
        sectionHeader: {},
        row: { flexDirection: "row", alignItems: "center", gap: 12 },
        iconWrap: {
          width: 32,
          height: 32,
          borderRadius: 8,
          backgroundColor: theme.accentOrange + "26",
          alignItems: "center",
          justifyContent: "center",
        },
        rowText: { flex: 1 },
        rowTitle: { fontSize: 14, fontWeight: "500", color: colors.foreground },
        rowSubtitle: { fontSize: 12, color: colors.mutedForeground },
        connectBtn: {
          paddingHorizontal: 16,
          paddingVertical: 9,
          borderRadius: 999,
          backgroundColor: "#FC4C02",
        },
        connectBtnText: { fontSize: 13, fontWeight: "600", color: "#ffffff" },
        divider: { height: 1, backgroundColor: colors.border, marginVertical: 12 },
        hint: { fontSize: 12, color: colors.mutedForeground, lineHeight: 18 },
        body: { fontSize: 14, color: colors.mutedForeground, lineHeight: 20 },
        signOutBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 },
        signOutText: { fontSize: 14, fontWeight: "500", color: colors.foreground },
        intervalIconText: { fontSize: 13, fontWeight: "600", color: colors.mutedForeground },
        intervalForm: { marginTop: 8, gap: 8 },
        input: {
          borderRadius: 999,
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          backgroundColor: colors.background,
          color: colors.foreground,
          fontSize: 13,
        },
        intervalButtons: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
        primaryBtn: {
          paddingHorizontal: 16,
          paddingVertical: 9,
          borderRadius: 999,
          backgroundColor: colors.primary,
        },
        primaryBtnDisabled: { opacity: 0.5 },
        primaryBtnText: { fontSize: 13, fontWeight: "600", color: colors.primaryForeground },
        secondaryBtn: {
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 999,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        },
        secondaryBtnText: { fontSize: 13, fontWeight: "500", color: colors.mutedForeground },
        secondaryBtnDisabled: { opacity: 0.5 },
        syncNowBtn: {
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          alignSelf: "flex-start",
          marginLeft: 46,
          marginTop: 6,
          marginBottom: 2,
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: theme.accentBlue,
        },
        syncNowText: { fontSize: 13, fontWeight: "500", color: theme.accentBlue },
        errorText: { marginTop: 4, fontSize: 12, color: theme.negative },
        syncStatus: { marginTop: 6, fontSize: 12 },
        syncStatusRunning: { color: colors.mutedForeground },
        syncStatusDone: { color: theme.positive },
        syncStatusError: { color: theme.negative },
        advancedToggleRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 10,
          backgroundColor: colors.muted,
          borderRadius: 999,
          paddingHorizontal: 14,
          paddingVertical: 10,
        },
        advancedToggleText: { fontSize: 12, color: colors.mutedForeground, fontWeight: "500" },
        advancedGrid: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          marginTop: 8,
        },
        advancedBtn: {
          flexBasis: "48%",
          borderRadius: 999,
          paddingVertical: 8,
          paddingHorizontal: 10,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
        },
        advancedBtnText: { fontSize: 12, color: colors.mutedForeground, fontWeight: "500" },
        syncProgressCard: {
          marginTop: 10,
          borderRadius: 12,
          padding: 10,
          backgroundColor: colors.background,
        },
        syncProgressTitle: { fontSize: 12, fontWeight: "600", marginBottom: 4, color: colors.foreground },
        syncProgressText: { fontSize: 12, color: colors.mutedForeground },
        syncProgressMeta: { fontSize: 11, color: colors.mutedForeground, marginTop: 4 },
        uploadBtn: {
          marginTop: 8,
          paddingVertical: 12,
          borderRadius: 999,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        },
        uploadBtnText: { fontSize: 14, fontWeight: "500", color: colors.foreground },
        labRow: { marginTop: 10, gap: 4 },
        labRowLabel: { fontSize: 13, fontWeight: "500", color: colors.mutedForeground },
        labRowInput: {
          borderRadius: 999,
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          backgroundColor: colors.background,
          color: colors.foreground,
          fontSize: 13,
        },
        labSaveBtn: {
          marginTop: 12,
          paddingVertical: 10,
          borderRadius: 999,
          backgroundColor: colors.primary,
          alignItems: "center",
        },
        labSaveText: {
          fontSize: 14,
          fontWeight: "600",
          color: colors.primaryForeground,
        },
        themeRow: { flexDirection: "row", gap: 10, marginTop: 8 },
        themeBtn: {
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 999,
          borderWidth: StyleSheet.hairlineWidth,
        },
        themeBtnText: { fontSize: 13, fontWeight: "500" },
        appearanceCard: { flex: 1, alignItems: "center", minWidth: 0 },
        appearancePreview: { flexDirection: "row", gap: 4, marginBottom: 8 },
        previewRect: { width: 24, height: 16, borderRadius: 4 },
        appearanceLabel: { fontSize: 13, fontWeight: "600" },
        appearanceCheck: { marginTop: 4 },
        memoryCard: {
          borderRadius: 12,
          padding: 12,
          backgroundColor: colors.background,
          marginBottom: 8,
        },
        memoryCategory: { fontSize: 11, fontWeight: "600", color: colors.mutedForeground, marginBottom: 4 },
        memoryContent: { fontSize: 13, color: colors.foreground, lineHeight: 18 },
        memoryDate: { fontSize: 11, color: colors.mutedForeground, marginTop: 6 },
        memoryDeleteAction: {
          backgroundColor: theme.negative,
          justifyContent: "center",
          alignItems: "flex-end",
          paddingHorizontal: 16,
          marginBottom: 8,
          borderRadius: 12,
        },
        memoryDeleteText: { color: theme.textOnNegative, fontWeight: "600", fontSize: 13 },
        memoryEmptyWrap: {
          alignItems: "center",
          justifyContent: "center",
          paddingVertical: 12,
          gap: 6,
        },
        memoryClearAllBtn: {
          marginTop: 8,
          paddingVertical: 10,
          borderRadius: 999,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          alignItems: "center",
        },
        memoryClearAllText: {
          fontSize: 13,
          fontWeight: "500",
          color: theme.negative,
        },
        sheetBackdrop: {
          flex: 1,
          backgroundColor: "#00000088",
          justifyContent: "flex-end",
        },
        sheetContainer: {
          backgroundColor: colors.card,
          padding: 16,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
        },
        sheetTitle: {
          fontSize: 16,
          fontWeight: "600",
          color: colors.foreground,
          marginBottom: 8,
        },
        sheetText: { fontSize: 13, color: colors.mutedForeground, marginBottom: 16 },
        sheetButtons: {
          flexDirection: "row",
          justifyContent: "flex-end",
          gap: 12,
        },
        sheetBtn: {
          paddingHorizontal: 16,
          paddingVertical: 8,
          borderRadius: 999,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        },
        sheetBtnDanger: {
          backgroundColor: theme.negative,
          borderColor: theme.negative,
        },
        sheetBtnText: { fontSize: 13, fontWeight: "500", color: colors.foreground },
        sheetBtnTextDanger: { color: theme.textOnNegative },
        streakRow: {
          marginTop: 8,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        },
        streakTextBlock: {
          flex: 1,
          marginRight: 12,
        },
        streakTitle: { fontSize: 14, fontWeight: "500", color: colors.foreground },
        streakSubtitle: { fontSize: 12, color: colors.mutedForeground, marginTop: 2 },
        streakCalendarRow: {
          marginTop: 12,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-end",
        },
        streakCalendarDay: { alignItems: "center", flex: 1 },
        streakCalendarLabel: { fontSize: 10, color: colors.mutedForeground, marginBottom: 4 },
        streakCalendarDot: {
          width: 10,
          height: 10,
          borderRadius: 999,
          backgroundColor: theme.cardBorder,
        },
        streakCalendarDotActive: {
          backgroundColor: theme.textPrimary,
        },
        streakCalendarDotTodayWrapper: {
          borderWidth: 1,
          borderColor: colors.mutedForeground,
          borderRadius: 999,
          padding: 2,
        },
      }),
    [colors, theme]
  );

  return (
    <ScreenContainer contentContainerStyle={{ ...styles.content, paddingBottom: spacing.screenBottom + 120 }}>
      <Text style={styles.title}>Settings</Text>

      <GlassCard>
        <Text style={[styles.sectionHeader, typography.sectionHeader, { color: colors.mutedForeground }]}>
          Streak
        </Text>
        <View style={styles.streakRow}>
          <View style={styles.streakTextBlock}>
            <Text style={styles.streakTitle}>
              Current streak: {streak.currentStreak} day{streak.currentStreak === 1 ? "" : "s"}
            </Text>
            <Text style={styles.streakSubtitle}>
              Longest streak: {streak.longestStreak} day{streak.longestStreak === 1 ? "" : "s"}
            </Text>
          </View>
        </View>
        <View style={styles.streakCalendarRow}>
          {Array.from({ length: 7 }).map((_, idx) => {
            const offset = 6 - idx;
            const labelDate = new Date();
            labelDate.setDate(labelDate.getDate() - offset);
            const label = labelDate.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 3);
            const dateKey = getLocalDateString(labelDate);
            const todayKey = getLocalDateString();
            const diffDays = Math.round(
              (new Date(`${todayKey}T00:00:00`).getTime() - new Date(`${dateKey}T00:00:00`).getTime()) / 86400000,
            );
            const isActive = diffDays >= 0 && diffDays < streak.currentStreak;
            const isToday = dateKey === todayKey;
            const dot = (
              <View
                style={[
                  styles.streakCalendarDot,
                  isActive && styles.streakCalendarDotActive,
                ]}
              />
            );
            return (
              <View key={dateKey} style={styles.streakCalendarDay}>
                <Text style={styles.streakCalendarLabel}>{label}</Text>
                {isToday ? <View style={styles.streakCalendarDotTodayWrapper}>{dot}</View> : dot}
              </View>
            );
          })}
        </View>
      </GlassCard>

      <GlassCard>
        <Text style={[styles.sectionHeader, typography.sectionHeader, { color: theme.textLabel }]}>
          APPEARANCE
        </Text>
        <Text style={[styles.body, { color: theme.textMuted }]}>Theme</Text>
        <View style={[styles.themeRow, { flexDirection: "row", gap: spacing.gap, marginTop: 8 }]}>
          {APPEARANCE_OPTIONS.map((opt) => {
            const isActive = themeName === opt.name;
            const t = opt.previewTheme;
            return (
              <Pressable
                key={opt.name}
                onPress={() => setTheme(opt.name)}
                style={[
                  styles.appearanceCard,
                  {
                    backgroundColor: t.cardBackground,
                    borderRadius: t.cardRadius,
                    padding: t.cardPadding,
                    borderWidth: isActive ? 2 : 1,
                    borderColor: isActive ? theme.accentBlue : theme.cardBorder,
                  },
                ]}
              >
                <View style={styles.appearancePreview}>
                  <View style={[styles.previewRect, { backgroundColor: t.cardBackground }]} />
                  <View style={[styles.previewRect, { backgroundColor: t.surfaceElevated }]} />
                  <View style={[styles.previewRect, { backgroundColor: t.accentBlue }]} />
                </View>
                <Text style={[styles.appearanceLabel, { color: t.textPrimary }]}>
                  {opt.emoji} {opt.label}
                </Text>
                {isActive && (
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={theme.accentBlue}
                    style={styles.appearanceCheck}
                  />
                )}
              </Pressable>
            );
          })}
        </View>
      </GlassCard>

      <GlassCard>
        <Text style={[styles.sectionHeader, typography.sectionHeader, { color: colors.mutedForeground }]}>
          Coaching Memory
        </Text>
        {memoriesLoading && !memoriesLoaded ? (
          <View style={{ paddingVertical: 8 }}>
            <ActivityIndicator size="small" color={colors.mutedForeground} />
          </View>
        ) : coachingMemories.length === 0 ? (
          <View style={styles.memoryEmptyWrap}>
            <Text style={{ fontSize: 24 }}>🧠</Text>
            <Text style={[styles.body, { fontWeight: "600", color: colors.foreground }]}>No memories yet</Text>
            <Text style={[styles.hint, { textAlign: "center" }]}>Cade will remember important things about your training here</Text>
          </View>
        ) : (
          <View>
            {coachingMemories.map((m) => {
              const created = new Date(m.created_at);
              const dateLabel = created.toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              });
              return (
                <Swipeable
                  key={m.id}
                  renderRightActions={() => (
                    <TouchableOpacity
                      style={styles.memoryDeleteAction}
                      activeOpacity={0.8}
                      onPress={() => handleDeleteMemory(m.id)}
                    >
                      <Text style={styles.memoryDeleteText}>Delete</Text>
                    </TouchableOpacity>
                  )}
                >
                  <View style={styles.memoryCard}>
                    {m.category && (
                      <Text style={styles.memoryCategory}>{m.category.toUpperCase()}</Text>
                    )}
                    <Text style={styles.memoryContent}>{m.content}</Text>
                    <Text style={styles.memoryDate}>{dateLabel}</Text>
                  </View>
                </Swipeable>
              );
            })}
          </View>
        )}
        {coachingMemories.length > 0 && (
          <TouchableOpacity
            style={styles.memoryClearAllBtn}
            activeOpacity={0.8}
            onPress={() => setClearAllVisible(true)}
            disabled={isClearingMemories}
          >
            {isClearingMemories ? (
              <ActivityIndicator size="small" color={theme.negative} />
            ) : (
              <Text style={styles.memoryClearAllText}>Clear all memories</Text>
            )}
          </TouchableOpacity>
        )}
      </GlassCard>

      <GlassCard>
        <Text style={[styles.sectionHeader, typography.sectionHeader, { color: colors.mutedForeground }]}>
          Connected Accounts
        </Text>
        <View style={styles.row}>
          <View style={styles.iconWrap}>
            <Ionicons name="bicycle" size={18} color={theme.accentOrange} />
          </View>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Strava</Text>
            <Text style={styles.rowSubtitle}>Not connected</Text>
          </View>
          <TouchableOpacity style={styles.connectBtn} activeOpacity={0.8}>
            <Text style={styles.connectBtnText}>Connect Strava</Text>
          </TouchableOpacity>
        </View>
        {Platform.OS === "ios" && (
          <>
            <View style={styles.divider} />
            <View style={styles.row}>
              <View style={styles.iconWrap}>
                <Ionicons name="heart" size={18} color={theme.accentBlue} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>Apple Health</Text>
                <Text style={styles.rowSubtitle}>
                  {appleHealth.loading
                    ? "Checking…"
                    : !appleHealth.kitAvailable
                    ? "Not available on this device"
                    : appleHealth.hasBeenPrompted
                    ? "Connected — syncs automatically"
                    : appleHealth.shouldShowSystemPrompt
                    ? "Not connected"
                    : "Tap to connect"}
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.connectBtn,
                  (!appleHealth.kitAvailable || appleHealth.connecting) && styles.secondaryBtnDisabled,
                ]}
                activeOpacity={0.8}
                disabled={!appleHealth.kitAvailable || appleHealth.connecting || appleHealth.loading}
                onPress={() => {
                  if (appleHealth.hasBeenPrompted) {
                    Linking.openURL("x-apple-health://").catch(() => Linking.openSettings());
                  } else {
                    appleHealth.connect().then(() => {
                      AsyncStorage.removeItem(APPLE_HEALTH_SYNC_STORAGE_KEY);
                    });
                  }
                }}
              >
                {appleHealth.connecting ? (
                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                ) : (
                  <Text style={styles.connectBtnText}>
                    {appleHealth.hasBeenPrompted ? "Settings" : "Connect"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
            {appleHealth.hasBeenPrompted && appleHealth.kitAvailable && (
              <TouchableOpacity
                style={[styles.syncNowBtn, appleHealthSyncing && styles.secondaryBtnDisabled]}
                activeOpacity={0.8}
                disabled={appleHealthSyncing}
                onPress={syncAppleHealthNow}
              >
                {appleHealthSyncing ? (
                  <ActivityIndicator size="small" color={theme.accentBlue} />
                ) : (
                  <Ionicons name="sync" size={14} color={theme.accentBlue} />
                )}
                <Text style={styles.syncNowText}>
                  {appleHealthSyncing ? "Syncing…" : "Sync Now"}
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}
        <View style={styles.divider} />
        <View style={styles.row}>
          <View style={styles.iconWrap}>
            <Text style={styles.intervalIconText}>I</Text>
          </View>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>intervals.icu</Text>
            <Text style={styles.rowSubtitle}>
              {intervalsLoading
                ? "Checking..."
                : isConnected
                ? "Connected"
                : "Not connected"}
            </Text>
          </View>
        </View>
        <View style={styles.intervalForm}>
          <Text style={styles.hint}>
            Paste your API key from intervals.icu → Settings → API. Athlete ID is optional
            (numbers only, used for display – leave blank if unsure).
          </Text>
          {errorMessage && (
            <Text style={styles.errorText}>
              {errorMessage}
            </Text>
          )}
          <TextInput
            style={styles.input}
            placeholder="Athlete ID (e.g. 123456, optional)"
            placeholderTextColor={colors.mutedForeground}
            value={athleteId}
            onChangeText={setAthleteId}
            onBlur={() => {
              // Normalize common "i123456" → "123456" so what you see matches what we save.
              const digits = athleteId.replace(/\D/g, "");
              if (digits !== athleteId) setAthleteId(digits);
            }}
            editable={!isSaving}
          />
          <TextInput
            style={styles.input}
            placeholder="API key"
            placeholderTextColor={colors.mutedForeground}
            value={apiKey}
            onChangeText={setApiKey}
            secureTextEntry
            editable={!isSaving}
          />
          <View style={styles.intervalButtons}>
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                (!apiKey.trim() || isSaving) && styles.primaryBtnDisabled,
              ]}
              activeOpacity={0.8}
              onPress={() => save({ athleteId: athleteId.trim(), apiKey: apiKey.trim() })}
              disabled={!apiKey.trim() || isSaving}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Text style={styles.primaryBtnText}>{isConnected ? "Update" : "Connect"}</Text>
              )}
            </TouchableOpacity>
            {isConnected && (
              <>
                <TouchableOpacity
                  style={[styles.secondaryBtn, isSyncing && styles.secondaryBtnDisabled]}
                  activeOpacity={0.8}
                  disabled={isSyncing}
                  onPress={runSync}
                >
                  {isSyncing ? (
                    <ActivityIndicator size="small" color={colors.foreground} />
                  ) : (
                    <Text style={styles.secondaryBtnText}>Sync now</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  activeOpacity={0.8}
                  onPress={() => disconnect()}
                >
                  <Text style={styles.secondaryBtnText}>Disconnect</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
          {isConnected && (
            <>
              <TouchableOpacity
                style={styles.advancedToggleRow}
                activeOpacity={0.8}
                onPress={() => setShowAdvancedIntervals(!showAdvancedIntervals)}
              >
                <Text style={styles.advancedToggleText}>
                  {showAdvancedIntervals ? "Hide advanced sync options" : "Show advanced sync options"}
                </Text>
                <Ionicons
                  name={showAdvancedIntervals ? "chevron-up-outline" : "chevron-down-outline"}
                  size={16}
                  color={colors.mutedForeground}
                />
              </TouchableOpacity>
              {showAdvancedIntervals && (
                <>
                  <View style={styles.advancedGrid}>
                    <TouchableOpacity
                      style={styles.advancedBtn}
                      activeOpacity={0.8}
                      onPress={handleTestConnection}
                      disabled={isTestingIntervals || isSyncing}
                    >
                      {isTestingIntervals ? (
                        <ActivityIndicator size="small" color={colors.mutedForeground} />
                      ) : (
                        <Ionicons name="checkmark-circle-outline" size={16} color={colors.mutedForeground} />
                      )}
                      <Text style={styles.advancedBtnText}>Test connection</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.advancedBtn}
                      activeOpacity={0.8}
                      onPress={handleSyncStreams}
                      disabled={streamsSyncing || isSyncing}
                    >
                      {streamsSyncing ? (
                        <ActivityIndicator size="small" color={colors.mutedForeground} />
                      ) : (
                        <Ionicons name="pulse-outline" size={16} color={colors.mutedForeground} />
                      )}
                      <Text style={styles.advancedBtnText}>Sync streams</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.advancedBtn}
                      activeOpacity={0.8}
                      onPress={handleSyncPRs}
                      disabled={pbsSyncing || isSyncing}
                    >
                      {pbsSyncing ? (
                        <ActivityIndicator size="small" color={colors.mutedForeground} />
                      ) : (
                        <Ionicons name="trophy-outline" size={16} color={colors.mutedForeground} />
                      )}
                      <Text style={styles.advancedBtnText}>Sync PRs</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.advancedBtn}
                      activeOpacity={0.8}
                      onPress={runQuickSync}
                      disabled={isSyncing}
                    >
                      {isSyncing && syncProgress?.stage === "quick_sync" ? (
                        <ActivityIndicator size="small" color={colors.mutedForeground} />
                      ) : (
                        <Image
                          source={require("../assets/cade-runner-blue.png")}
                          style={{ width: 24, height: 24, tintColor: "#2563eb" }}
                        />
                      )}
                      <Text style={styles.advancedBtnText}>Quick sync (30d)</Text>
                    </TouchableOpacity>
                  </View>
                  {syncProgress && syncProgress.stage !== "idle" && (
                    <View
                      style={[
                        styles.syncProgressCard,
                        syncProgress.done && syncProgress.stage !== "error"
                          ? { backgroundColor: theme.positive + "14" }
                          : syncProgress.stage === "error"
                          ? { backgroundColor: theme.negative + "14" }
                          : { backgroundColor: colors.card },
                      ]}
                    >
                      <Text style={styles.syncProgressTitle}>Sync progress</Text>
                      <Text style={styles.syncProgressText}>{syncProgress.detail || "Working..."}</Text>
                      {(syncProgress.yearsCompleted || syncProgress.streamsProgress) && (
                        <Text style={styles.syncProgressMeta}>
                          {syncProgress.yearsCompleted &&
                            Object.entries(syncProgress.yearsCompleted)
                              .sort(([a], [b]) => a.localeCompare(b))
                              .map(([yr, n]) => `✓ ${yr} — ${n} runs`)
                              .join(" · ")}
                          {syncProgress.streamsProgress &&
                            ` ${syncProgress.yearsCompleted ? "· " : ""}Streams ${
                              syncProgress.streamsProgress.done
                            }/${syncProgress.streamsProgress.total}`}
                        </Text>
                      )}
                    </View>
                  )}
                </>
              )}
            </>
          )}
        </View>
      </GlassCard>

      <GlassCard>
        <Text style={[styles.sectionHeader, typography.sectionHeader, { color: colors.mutedForeground }]}>
          Heart Rate
        </Text>
        {hrLoaded ? (
          <>
            <Text style={styles.body}>
              Max and resting HR are used for zones and smart activity naming (Easy vs Tempo, etc.).
            </Text>
            <View style={{ marginTop: 8, gap: 8 }}>
              <TextInput
                style={styles.input}
                placeholder="Max HR (e.g. 190)"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="number-pad"
                value={maxHr}
                onChangeText={setMaxHr}
                editable={!savingHr}
              />
              <TextInput
                style={styles.input}
                placeholder="Resting HR (e.g. 50)"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="number-pad"
                value={restingHr}
                onChangeText={setRestingHr}
                editable={!savingHr}
              />
              <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                <TouchableOpacity
                  style={[
                    styles.primaryBtn,
                    savingHr && styles.primaryBtnDisabled,
                  ]}
                  activeOpacity={0.8}
                  disabled={savingHr}
                  onPress={handleSaveHr}
                >
                  {savingHr ? (
                    <ActivityIndicator size="small" color={colors.primaryForeground} />
                  ) : (
                    <Text style={styles.primaryBtnText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </>
        ) : (
          <View style={{ paddingVertical: 8 }}>
            <ActivityIndicator size="small" color={colors.mutedForeground} />
          </View>
        )}
      </GlassCard>

      <GlassCard>
        <Text style={[styles.sectionHeader, typography.sectionHeader, { color: colors.mutedForeground }]}>
          Lab Results
        </Text>
        <TouchableOpacity
          style={styles.uploadBtn}
          activeOpacity={0.85}
          onPress={handleUploadLabPdf}
          disabled={labExtracting}
        >
          {labExtracting ? (
            <ActivityIndicator size="small" color={colors.mutedForeground} />
          ) : (
            <Ionicons name="document-text-outline" size={18} color={colors.mutedForeground} />
          )}
          <Text style={styles.uploadBtnText}>{labExtracting ? `Analyzing... (attempt ${labExtractAttempt} of 3)` : "Upload lab PDF"}</Text>
        </TouchableOpacity>
        <View style={{ marginTop: 10 }}>
          <View style={styles.labRow}>
            <Text style={styles.labRowLabel}>VO2max (ml/kg/min)</Text>
            <TextInput
              style={styles.labRowInput}
              keyboardType="decimal-pad"
              value={labForm.vo2max ?? ""}
              onChangeText={(v) => setLabForm((prev) => ({ ...prev, vo2max: v }))}
              placeholder="e.g. 60.5"
              placeholderTextColor={colors.mutedForeground}
            />
          </View>
          <View style={styles.labRow}>
            <Text style={styles.labRowLabel}>LT1 Heart Rate (bpm)</Text>
            <TextInput
              style={styles.labRowInput}
              keyboardType="number-pad"
              value={labForm.lt1Hr ?? ""}
              onChangeText={(v) => setLabForm((prev) => ({ ...prev, lt1Hr: v }))}
              placeholder="e.g. 150"
              placeholderTextColor={colors.mutedForeground}
            />
          </View>
          <View style={styles.labRow}>
            <Text style={styles.labRowLabel}>LT1 Pace (aerobic threshold)</Text>
            <TextInput
              style={styles.labRowInput}
              value={labForm.lt1Pace ?? ""}
              onChangeText={(v) => setLabForm((prev) => ({ ...prev, lt1Pace: v }))}
              placeholder="e.g. 5:00/km"
              placeholderTextColor={colors.mutedForeground}
            />
          </View>
          <View style={styles.labRow}>
            <Text style={styles.labRowLabel}>LT2 Heart Rate (threshold, bpm)</Text>
            <TextInput
              style={styles.labRowInput}
              keyboardType="number-pad"
              value={labForm.ltHr ?? ""}
              onChangeText={(v) => setLabForm((prev) => ({ ...prev, ltHr: v }))}
              placeholder="e.g. 170"
              placeholderTextColor={colors.mutedForeground}
            />
          </View>
          <View style={styles.labRow}>
            <Text style={styles.labRowLabel}>LT2 Pace (threshold)</Text>
            <TextInput
              style={styles.labRowInput}
              value={labForm.ltPace ?? ""}
              onChangeText={(v) => setLabForm((prev) => ({ ...prev, ltPace: v }))}
              placeholder="e.g. 4:00/km"
              placeholderTextColor={colors.mutedForeground}
            />
          </View>
          <View style={styles.labRow}>
            <Text style={styles.labRowLabel}>VLamax (mmol/L/s)</Text>
            <TextInput
              style={styles.labRowInput}
              keyboardType="decimal-pad"
              value={labForm.vlamax ?? ""}
              onChangeText={(v) => setLabForm((prev) => ({ ...prev, vlamax: v }))}
              placeholder="e.g. 0.40"
              placeholderTextColor={colors.mutedForeground}
            />
          </View>
          <View style={styles.labRow}>
            <Text style={styles.labRowLabel}>Max HR (measured, bpm)</Text>
            <TextInput
              style={styles.labRowInput}
              keyboardType="number-pad"
              value={labForm.maxHrMeasured ?? ""}
              onChangeText={(v) => setLabForm((prev) => ({ ...prev, maxHrMeasured: v }))}
              placeholder="e.g. 192"
              placeholderTextColor={colors.mutedForeground}
            />
          </View>
          {(labSummary?.lab_name || labSummary?.lab_test_date) && (
            <Text style={[styles.hint, { marginTop: 6 }]}>
              Source:{" "}
              {[
                labSummary?.lab_name ?? undefined,
                labSummary?.lab_test_date ?? undefined,
              ]
                .filter(Boolean)
                .join(" — ")}
            </Text>
          )}
          <Text style={[styles.hint, { marginTop: 4 }]}>
            Zones based on:{" "}
            {labSummary?.zone_source === "lab_test"
              ? `Lab test${labSummary?.lab_name ? ` (${labSummary.lab_name})` : ""}`
              : "HR formula"}
          </Text>
          <TouchableOpacity
            style={styles.labSaveBtn}
            activeOpacity={0.85}
            onPress={() => {
              const hasExisting =
                !!(
                  labSummary?.vo2max ||
                  labSummary?.lactate_threshold_hr ||
                  labSummary?.lactate_threshold_pace ||
                  labSummary?.vlamax ||
                  labSummary?.max_hr_measured
                );
              if (hasExisting) {
                setLabConfirmVisible(true);
              } else {
                performSaveLab();
              }
            }}
            disabled={labSaving}
          >
            {labSaving ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Text style={styles.labSaveText}>Save lab results</Text>
            )}
          </TouchableOpacity>
        </View>
      </GlassCard>

      <GlassCard>
        <Text style={[styles.sectionHeader, typography.sectionHeader, { color: colors.mutedForeground }]}>
          Account
        </Text>
        <TouchableOpacity
          style={styles.signOutBtn}
          onPress={handleDeletePlan}
          activeOpacity={0.8}
        >
          <Ionicons name="trash-outline" size={18} color={colors.foreground} />
          <Text style={styles.signOutText}>Delete training plan & restart onboarding</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.signOutBtn}
          onPress={handleClearData}
          activeOpacity={0.8}
        >
          <Ionicons name="trash-bin-outline" size={18} color={colors.foreground} />
          <Text style={styles.signOutText}>Clear imported data</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.signOutBtn} onPress={() => signOut()} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={18} color={colors.foreground} />
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
        {__DEV__ && (
          <TouchableOpacity
            style={styles.signOutBtn}
            onPress={() => {
              resetTutorial();
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="refresh-outline" size={18} color={colors.foreground} />
            <Text style={styles.signOutText}>Reset tutorial (dev only)</Text>
          </TouchableOpacity>
        )}
      </GlassCard>
      <Modal
        visible={clearAllVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setClearAllVisible(false)}
      >
        <TouchableOpacity
          style={styles.sheetBackdrop}
          activeOpacity={1}
          onPress={() => !isClearingMemories && setClearAllVisible(false)}
        >
          <View style={styles.sheetContainer}>
            <Text style={styles.sheetTitle}>Clear all memories?</Text>
            <Text style={styles.sheetText}>
              This will permanently delete all AI coaching memories linked to your account.
            </Text>
            <View style={styles.sheetButtons}>
              <TouchableOpacity
                style={styles.sheetBtn}
                activeOpacity={0.8}
                onPress={() => setClearAllVisible(false)}
                disabled={isClearingMemories}
              >
                <Text style={styles.sheetBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sheetBtn, styles.sheetBtnDanger]}
                activeOpacity={0.8}
                onPress={handleClearAllMemories}
                disabled={isClearingMemories}
              >
                {isClearingMemories ? (
                  <ActivityIndicator size="small" color={theme.textOnNegative} />
                ) : (
                  <Text style={styles.sheetBtnTextDanger}>Clear all</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
      <Modal
        visible={labConfirmVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setLabConfirmVisible(false)}
      >
        <TouchableOpacity
          style={styles.sheetBackdrop}
          activeOpacity={1}
          onPress={() => !labSaving && setLabConfirmVisible(false)}
        >
          <View style={styles.sheetContainer}>
            <Text style={styles.sheetTitle}>Overwrite existing lab results?</Text>
            <Text style={styles.sheetText}>
              This will replace any existing VO2max, lactate threshold, VLamax, and max HR values in your profile.
            </Text>
            <View style={styles.sheetButtons}>
              <TouchableOpacity
                style={styles.sheetBtn}
                activeOpacity={0.8}
                onPress={() => setLabConfirmVisible(false)}
                disabled={labSaving}
              >
                <Text style={styles.sheetBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sheetBtn, styles.sheetBtnDanger]}
                activeOpacity={0.8}
                onPress={performSaveLab}
                disabled={labSaving}
              >
                {labSaving ? (
                  <ActivityIndicator size="small" color={theme.textOnNegative} />
                ) : (
                  <Text style={styles.sheetBtnTextDanger}>Overwrite & save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </ScreenContainer>
  );
};

