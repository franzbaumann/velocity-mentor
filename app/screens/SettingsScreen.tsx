import { FC, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "../components/ScreenContainer";
import { GlassCard } from "../components/GlassCard";
import { useTheme } from "../context/ThemeContext";
import type { Theme } from "../context/ThemeContext";
import { useSupabaseAuth } from "../SupabaseProvider";
import { typography } from "../theme/theme";
import { useIntervalsIntegration } from "../hooks/useIntervalsIntegration";
import { useIntervalsSync } from "../hooks/useIntervalsSync";

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export const SettingsScreen: FC = () => {
  const { signOut } = useSupabaseAuth();
  const { theme, setTheme, colors } = useTheme();
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

  useEffect(() => {
    if (integration) {
      setAthleteId(integration.athlete_id ?? "");
      setApiKey(integration.api_key ?? "");
    } else {
      setAthleteId("");
      setApiKey("");
    }
  }, [integration?.athlete_id, integration?.api_key]);

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
        <Text style={styles.body}>Max HR and zones can be set here once wired to profile.</Text>
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
        <TouchableOpacity style={styles.signOutBtn} onPress={() => signOut()} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={18} color={colors.foreground} />
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </GlassCard>
    </ScreenContainer>
  );
};

