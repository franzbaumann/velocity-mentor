import { FC, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { ScreenContainer } from "../components/ScreenContainer";
import { GlassCard } from "../components/GlassCard";
import { useTheme } from "../context/ThemeContext";
import type { Theme } from "../context/ThemeContext";
import { useSupabaseAuth } from "../SupabaseProvider";
import { typography } from "../theme/theme";
import { useIntervalsIntegration } from "../hooks/useIntervalsIntegration";
import { useIntervalsSync } from "../hooks/useIntervalsSync";
import { supabase } from "../shared/supabase";
import type { AppTabsParamList } from "../navigation/RootNavigator";
import { useQueryClient } from "@tanstack/react-query";

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export const SettingsScreen: FC = () => {
  const { signOut } = useSupabaseAuth();
  const { theme, setTheme, colors } = useTheme();
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

  const { runSync, isSyncing, status: syncStatus, message: syncMessage } = useIntervalsSync();

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
  } | null>(null);

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
          "max_hr, resting_hr, vo2max, lactate_threshold_hr, lactate_threshold_pace, vlamax, max_hr_measured, lab_test_date, lab_name",
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
        });
      }
      setHrLoaded(true);
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
          backgroundColor: "rgba(252,76,2,0.15)",
          alignItems: "center",
          justifyContent: "center",
        },
        rowText: { flex: 1 },
        rowTitle: { fontSize: 14, fontWeight: "500", color: colors.foreground },
        rowSubtitle: { fontSize: 12, color: colors.mutedForeground },
        connectBtn: {
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 999,
          backgroundColor: "#fc4c02",
        },
        connectBtnText: { fontSize: 13, fontWeight: "600", color: "#fff" },
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
        errorText: { marginTop: 4, fontSize: 12, color: "#dc2626" },
        syncStatus: { marginTop: 6, fontSize: 12 },
        syncStatusRunning: { color: colors.mutedForeground },
        syncStatusDone: { color: "#16a34a" },
        syncStatusError: { color: "#dc2626" },
        themeRow: { flexDirection: "row", gap: 10, marginTop: 8 },
        themeBtn: {
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 999,
          borderWidth: StyleSheet.hairlineWidth,
        },
        themeBtnText: { fontSize: 13, fontWeight: "500" },
      }),
    [colors]
  );

  return (
    <ScreenContainer contentContainerStyle={styles.content}>
      <Text style={styles.title}>Settings</Text>

      <GlassCard>
        <Text style={[styles.sectionHeader, typography.sectionHeader, { color: colors.mutedForeground }]}>
          Connected Accounts
        </Text>
        <View style={styles.row}>
          <View style={styles.iconWrap}>
            <Ionicons name="bicycle" size={18} color="#fc4c02" />
          </View>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Strava</Text>
            <Text style={styles.rowSubtitle}>Not connected</Text>
          </View>
          <TouchableOpacity style={styles.connectBtn} activeOpacity={0.8}>
            <Text style={styles.connectBtnText}>Connect Strava</Text>
          </TouchableOpacity>
        </View>
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
            Klistra in din API‑nyckel från intervals.icu → Settings → API. Athlete ID är valfri
            (siffror, används bara för visning – lämna tomt om du är osäker).
          </Text>
          {errorMessage && (
            <Text style={styles.errorText}>
              {errorMessage}
            </Text>
          )}
          <TextInput
            style={styles.input}
            placeholder="Athlete ID (t.ex. 123456, valfri)"
            placeholderTextColor={colors.mutedForeground}
            value={athleteId}
            onChangeText={setAthleteId}
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
          {isConnected && syncStatus !== "idle" && syncMessage && (
            <Text
              style={[
                styles.syncStatus,
                syncStatus === "error"
                  ? styles.syncStatusError
                  : syncStatus === "done"
                  ? styles.syncStatusDone
                  : styles.syncStatusRunning,
              ]}
            >
              {syncMessage}
            </Text>
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
        <Text style={styles.body}>
          Lab metrics (VO2max, lactate threshold, etc.) are read from your profile. Upload lab PDFs on the web to
          update these values; they will appear here.
        </Text>
        {labSummary && (
          <View style={{ marginTop: 10, gap: 8 }}>
            {labSummary.vo2max != null && (
              <View>
                <Text style={[styles.rowTitle, { fontSize: 13 }]}>VO2max</Text>
                <Text style={styles.body}>
                  {Number(labSummary.vo2max).toFixed(1)} ml/kg/min
                </Text>
              </View>
            )}
            {labSummary.lactate_threshold_hr != null && (
              <View>
                <Text style={[styles.rowTitle, { fontSize: 13 }]}>LT Heart Rate</Text>
                <Text style={styles.body}>
                  {Math.round(labSummary.lactate_threshold_hr)} bpm
                </Text>
              </View>
            )}
            {labSummary.lactate_threshold_pace && (
              <View>
                <Text style={[styles.rowTitle, { fontSize: 13 }]}>LT Pace</Text>
                <Text style={styles.body}>{labSummary.lactate_threshold_pace}</Text>
              </View>
            )}
            {labSummary.vlamax != null && (
              <View>
                <Text style={[styles.rowTitle, { fontSize: 13 }]}>VLamax</Text>
                <Text style={styles.body}>
                  {Number(labSummary.vlamax).toFixed(2)} mmol/L/s
                </Text>
              </View>
            )}
            {labSummary.max_hr_measured != null && (
              <View>
                <Text style={[styles.rowTitle, { fontSize: 13 }]}>Max HR (measured)</Text>
                <Text style={styles.body}>{labSummary.max_hr_measured} bpm</Text>
              </View>
            )}
            {(labSummary.lab_name || labSummary.lab_test_date) && (
              <Text style={[styles.hint, { marginTop: 4 }]}>
                Source:{" "}
                {[
                  labSummary.lab_name ?? undefined,
                  labSummary.lab_test_date ?? undefined,
                ]
                  .filter(Boolean)
                  .join(" — ")}
              </Text>
            )}
          </View>
        )}
      </GlassCard>

      <GlassCard>
        <Text style={[styles.sectionHeader, typography.sectionHeader, { color: colors.mutedForeground }]}>
          Appearance
        </Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>Theme (same as web)</Text>
        <View style={styles.themeRow}>
          {THEME_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.themeBtn,
                { borderColor: colors.border },
                theme === opt.value && { backgroundColor: colors.primary },
              ]}
              onPress={() => setTheme(opt.value)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.themeBtnText,
                  { color: theme === opt.value ? colors.primaryForeground : colors.foreground },
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
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
      </GlassCard>
    </ScreenContainer>
  );
};

