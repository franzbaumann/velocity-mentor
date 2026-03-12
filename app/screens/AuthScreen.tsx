import { FC, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTheme } from "../context/ThemeContext";
import { useSupabaseAuth } from "../SupabaseProvider";
import { GlassCard } from "../components/GlassCard";
import * as SecureStore from "expo-secure-store";
import { AUTH_STORAGE_KEY } from "../shared/supabase";
import type { AuthStackParamList } from "../navigation/RootNavigator";

export const AuthScreen: FC = () => {
  const { colors } = useTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<AuthStackParamList, "Auth">>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signup");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(true);
  const { signInWithPassword, signUpWithPassword } = useSupabaseAuth();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        inner: { flex: 1, paddingHorizontal: 24, paddingTop: 80, paddingBottom: 32, justifyContent: "flex-start" },
        logoRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 32 },
        logoIcon: {
          width: 36,
          height: 36,
          borderRadius: 12,
          backgroundColor: colors.primary,
          alignItems: "center",
          justifyContent: "center",
        },
        logoTitle: { fontSize: 20, fontWeight: "600", color: colors.foreground, letterSpacing: -0.5 },
        cardTitle: { fontSize: 18, fontWeight: "600", color: colors.foreground, marginBottom: 4 },
        cardSubtitle: { fontSize: 14, color: colors.mutedForeground, marginBottom: 20 },
        label: {
          fontSize: 12,
          fontWeight: "500",
          color: colors.mutedForeground,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 6,
        },
        input: {
          height: 44,
          borderRadius: 12,
          paddingHorizontal: 14,
          backgroundColor: colors.muted,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          color: colors.foreground,
          fontSize: 14,
          marginBottom: 14,
        },
        primaryButton: {
          height: 44,
          borderRadius: 999,
          backgroundColor: colors.primary,
          alignItems: "center",
          justifyContent: "center",
          marginTop: 4,
          marginBottom: 8,
        },
        primaryButtonDisabled: { opacity: 0.6 },
        primaryButtonText: { color: colors.primaryForeground, fontSize: 15, fontWeight: "600" },
        secondaryPrimaryButton: { marginTop: 8, backgroundColor: colors.foreground },
        linkButton: { paddingVertical: 4, alignItems: "center", justifyContent: "center" },
        linkButtonText: {
          color: colors.mutedForeground,
          fontSize: 13,
          fontWeight: "500",
          textDecorationLine: "underline",
        },
        secondaryButton: {
          height: 40,
          borderRadius: 999,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          alignItems: "center",
          justifyContent: "center",
          marginTop: 4,
          marginBottom: 4,
        },
        secondaryButtonText: { color: colors.mutedForeground, fontSize: 13, fontWeight: "500" },
        helperText: { fontSize: 12, color: colors.mutedForeground },
        rememberRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
        rememberLabel: { fontSize: 13, color: colors.mutedForeground },
        successText: { marginTop: 8, fontSize: 12, color: colors.accent },
        errorText: { marginTop: 8, fontSize: 12, color: colors.warning },
        footerText: { fontSize: 11, color: colors.mutedForeground, marginTop: 16 },
      }),
    [colors]
  );
  const emailInputRef = useRef<TextInput | null>(null);
  const passwordInputRef = useRef<TextInput | null>(null);

  const onSubmitPassword = async () => {
    if (!email.trim()) {
      setError("Please enter your email first.");
      emailInputRef.current?.focus();
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      passwordInputRef.current?.focus();
      return;
    }
    try {
      setStatus("sending");
      setError(null);
      await signInWithPassword(email.trim(), password);
      if (!rememberMe) {
        await SecureStore.deleteItemAsync(AUTH_STORAGE_KEY);
      }
      setStatus("idle"); // auth listener byter screen
    } catch (e) {
      setStatus("error");
      const message =
        e && typeof e === "object" && "message" in e && typeof (e as any).message === "string"
          ? (e as any).message
          : "Could not sign in. Please try again.";
      setError(message);
    }
  };

  const onSubmitSignUp = async () => {
    if (!email.trim()) {
      setError("Please enter your email first.");
      emailInputRef.current?.focus();
      return;
    }
    if (!password) {
      setError("Please choose a password.");
      passwordInputRef.current?.focus();
      return;
    }
    try {
      setStatus("sending");
      setError(null);
      await signUpWithPassword(email.trim(), password);
      // Logga in direkt efter lyckad signup
      await signInWithPassword(email.trim(), password);
      if (!rememberMe) {
        await SecureStore.deleteItemAsync(AUTH_STORAGE_KEY);
      }
      setStatus("idle");
    } catch (e) {
      setStatus("error");
      const message =
        e && typeof e === "object" && "message" in e && typeof (e as any).message === "string"
          ? (e as any).message
          : "Could not create account. Please try again.";
      setError(message);
    }
  };

  const isSignInMode = authMode === "signin";
  const handlePrimarySubmit = isSignInMode ? onSubmitPassword : onSubmitSignUp;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.inner}>
        {/* Logo – matches web PaceIQ header */}
        <View style={styles.logoRow}>
          <View style={styles.logoIcon}>
            <Ionicons name="flash" size={22} color={colors.primaryForeground} />
          </View>
          <Text style={styles.logoTitle}>PaceIQ</Text>
        </View>

        <GlassCard padding={28}>
          <Text style={styles.cardTitle}>Welcome back</Text>
          <Text style={styles.cardSubtitle}>
            {isSignInMode ? "Sign in to your PaceIQ account" : "Create your PaceIQ account"}
          </Text>

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="email-address"
            autoCapitalize="none"
            ref={emailInputRef}
            value={email}
            onChangeText={setEmail}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Min 8 characters"
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry
            ref={passwordInputRef}
            value={password}
            onChangeText={setPassword}
          />

          <View style={styles.rememberRow}>
            <Text style={styles.rememberLabel}>Keep me logged in</Text>
            <Switch
              value={rememberMe}
              onValueChange={setRememberMe}
              thumbColor={rememberMe ? colors.primaryForeground : colors.background}
              trackColor={{ false: colors.muted, true: colors.primary }}
            />
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, status === "sending" && styles.primaryButtonDisabled]}
            activeOpacity={0.85}
            onPress={handlePrimarySubmit}
            disabled={status === "sending" || !email.trim() || password.length < 8}
          >
            <Text style={styles.primaryButtonText}>
              {status === "sending"
                ? "Please wait…"
                : isSignInMode
                ? "Sign in"
                : "Sign up"}
            </Text>
          </TouchableOpacity>
          {!isSignInMode && (
            <TouchableOpacity
              style={styles.linkButton}
              activeOpacity={0.7}
              onPress={() => {
                setError(null);
                setStatus("idle");
                setAuthMode("signin");
              }}
            >
              <Text style={styles.linkButtonText}>Already have an account? Sign in</Text>
            </TouchableOpacity>
          )}
          {isSignInMode && (
            <TouchableOpacity
              style={styles.linkButton}
              activeOpacity={0.7}
              onPress={() => {
                setError(null);
                setStatus("idle");
                setAuthMode("signup");
              }}
            >
              <Text style={styles.linkButtonText}>Need an account? Sign up</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.secondaryButton}
            activeOpacity={0.85}
            onPress={() => navigation.navigate("Pricing")}
          >
            <Text style={styles.secondaryButtonText}>Skip login for now</Text>
          </TouchableOpacity>

          <Text style={styles.helperText}>
            {isSignInMode
              ? "Sign in with your email and password."
              : "Pick an email and password. We'll create your account and sign you in immediately."}
          </Text>
          {error && <Text style={styles.errorText}>{error}</Text>}
        </GlassCard>

        <Text style={styles.footerText}>
          By continuing you agree to our terms. Authentication is handled by Supabase using
          passwordless magic links.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
};


