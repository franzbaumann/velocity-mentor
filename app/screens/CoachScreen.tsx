import { FC, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { ScreenContainer } from "../components/ScreenContainer";
import { GlassCard } from "../components/GlassCard";
import { useTheme } from "../context/ThemeContext";
import { getLocalDateString } from "../lib/date";
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from "../shared/supabase";
import { useIntervalsIntegration } from "../hooks/useIntervalsIntegration";
import type { AppTabsParamList } from "../navigation/RootNavigator";

type Msg = { role: "user" | "assistant"; content: string };

const QUICK_PROMPTS = [
  "I'd like to describe my history and get a plan",
  "I'll import my Garmin data first",
  "How am I recovering this week?",
  "Build me an adaptive plan for this week",
  "What are my current training zones?",
  "Should I run hard today or take it easy?",
  "Help me peak for my race",
];

const WELCOME = `Hey — I'm **Kipcoachee**, your AI running coach.

Before we build a plan, I need to understand you. We can do this two ways:

1. **Describe your story** — tell me your running history, goals, volume, and I'll create a plan from that.
2. **Import Garmin data first** — upload your Garmin export (in Settings) and I'll use your real activities and wellness data to build a plan tailored to you.

Which path do you want to take? Or tell me your story and we'll figure it out together.`;

const CHAT_URL = `${SUPABASE_URL}/functions/v1/coach-chat`;
const GENERATE_PLAN_URL = `${SUPABASE_URL}/functions/v1/coach-generate-plan`;

const HAS_ALL_DATA_PATTERNS = [
  /i have all the data/i,
  /i have everything i need/i,
  /ready to generate/i,
  /ready for (a |)plan/i,
  /have enough (information|data|context)/i,
  /can (now )?generate (your )?plan/i,
  /have what i need to build/i,
];

function assistantSaysHasAllData(content: string): boolean {
  return HAS_ALL_DATA_PATTERNS.some((p) => p.test(content));
}

function isNutritionMessage(content: string): boolean {
  const lower = content.toLowerCase();
  return (
    (lower.includes("recovery nutrition") || lower.includes("recovery fuel")) &&
    (lower.includes("immediate") || lower.includes("main meal") || lower.includes("hydration"))
  );
}

async function streamChatNative({
  messages,
  intakeAnswers,
  intervalsContext,
  token,
  onDelta,
  onDone,
  onRateLimit,
}: {
  messages: Msg[];
  intakeAnswers: Record<string, string | string[]> | null;
  intervalsContext: { wellness?: unknown[]; activities?: unknown[] } | null;
  token: string | null;
  onDelta: (text: string) => void;
  onDone: () => void;
  onRateLimit?: () => void;
  onError?: (message: string) => void;
}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (SUPABASE_ANON_KEY) {
    headers.apikey = SUPABASE_ANON_KEY;
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (!CHAT_URL || CHAT_URL.includes("undefined")) {
    console.error("[Kipcoachee] CHAT_URL missing - check EXPO_PUBLIC_SUPABASE_URL in app/.env");
  }

  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ messages, intakeAnswers, intervalsContext }),
  });

  if (!resp.ok) {
    let err: { error?: string } | null = null;
    try {
      err = await resp.json();
    } catch {
      // ignore
    }
    console.error("[Kipcoachee]", resp.status, err);
    if (resp.status === 429) {
      onRateLimit?.();
    } else {
      onError?.(err?.error ?? "Kipcoachee is unavailable right now.");
    }
    onDone();
    return;
  }

  // React Native fetch may or may not support getReader; handle both.
  const body: any = resp.body;
  if (!body || typeof body.getReader !== "function") {
    const text = await resp.text();
    // Fallback: parse entire SSE blob once
    const lines = text.split("\n");
    for (const rawLine of lines) {
      let line = rawLine;
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "") continue;
      if (!line.startsWith("data: ")) continue;
      const jsonStr = line.slice(6).trim();
      if (jsonStr === "[DONE]") break;
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) onDelta(content);
      } catch {
        // ignore malformed
      }
    }
  onDone();
  return;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done = false;

  while (!done) {
    const { done: readerDone, value } = await reader.read();
    if (readerDone) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    // eslint-disable-next-line no-cond-assign
    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
      let line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "") continue;
      if (!line.startsWith("data: ")) continue;
      const jsonStr = line.slice(6).trim();
      if (jsonStr === "[DONE]") {
        done = true;
        break;
      }
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) onDelta(content);
      } catch {
        buffer = line + "\n" + buffer;
        break;
      }
    }
  }

  onDone();
}

async function detectAndSavePlan(content: string): Promise<boolean> {
  const jsonMatch =
    content.match(/```json\s*([\s\S]*?)```/) ??
    content.match(/(\{[\s\S]*"action"\s*:\s*"create_plan"[\s\S]*\})/);
  if (!jsonMatch) return false;
  try {
    const parsed = JSON.parse(jsonMatch[1] ?? jsonMatch[0]);
    if (parsed?.action !== "create_plan" || !parsed?.plan) return false;
    const plan = parsed.plan;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const { data: planRow, error: planErr } = await supabase
      .from("training_plan")
      .insert({
        user_id: user.id,
        race_type: plan.name ?? "Training Plan",
        plan_name: plan.name,
        philosophy: plan.philosophy,
        is_active: true,
      })
      .select("id")
      .single();

    if (planErr || !planRow) return false;

    const weeks = plan.weeks ?? [];
    for (const week of weeks) {
      const { data: weekRow } = await supabase
        .from("training_week")
        .insert({
          plan_id: planRow.id,
          week_number: week.week_number ?? 1,
          start_date: getLocalDateString(),
          notes: week.focus ?? null,
        })
        .select("id")
        .single();

      if (!weekRow) continue;

      const workouts = week.workouts ?? [];
      for (let i = 0; i < workouts.length; i++) {
        const w = workouts[i];
        await supabase.from("training_session").insert({
          week_id: weekRow.id,
          day_of_week: w.day_of_week ?? (i + 1),
          session_type: w.type ?? "easy",
          workout_type: w.type ?? "easy",
          description: w.description ?? w.name ?? "",
          distance_km: w.distance_km ?? null,
          duration_min: w.duration_minutes ?? null,
          pace_target: w.target_pace ?? null,
          target_hr_zone: w.target_hr_zone ?? null,
          tss_estimate: w.tss_estimate ?? null,
          order_index: i,
          notes: w.name ?? null,
        });
      }
    }
    return true;
  } catch {
    return false;
  }
}

export const CoachScreen: FC = () => {
  const { colors } = useTheme();
  const navigation = useNavigation<BottomTabNavigationProp<AppTabsParamList, "Coach">>();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [rateLimitUntil, setRateLimitUntil] = useState<number>(0);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [intakeAnswers, setIntakeAnswers] = useState<Record<string, string | string[]> | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);

  const { isConnected } = useIntervalsIntegration();

  const { data: activitiesData } = useQuery({
    queryKey: ["activities", 730],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];
      const oldest = new Date();
      oldest.setDate(oldest.getDate() - 730);
      const { data, error } = await supabase
        .from("activity")
        .select("id, date, type, name, distance_km, duration_seconds, avg_pace, avg_hr, max_hr, source")
        .eq("user_id", user.id)
        .gte("date", oldest.toISOString().slice(0, 10))
        .order("date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: isConnected,
    staleTime: 2 * 60 * 1000,
  });

  const { data: wellnessData } = useQuery({
    queryKey: ["daily_readiness", 730],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];
      const oldest = new Date();
      oldest.setDate(oldest.getDate() - 730);
      const { data, error } = await supabase
        .from("daily_readiness")
        .select("id, date, score, hrv, hrv_baseline, sleep_hours, sleep_quality, resting_hr, ctl, atl, tsb")
        .eq("user_id", user.id)
        .gte("date", oldest.toISOString().slice(0, 10))
        .order("date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: isConnected,
    staleTime: 2 * 60 * 1000,
  });

  const intervalsContext =
    isConnected && (Array.isArray(wellnessData) || Array.isArray(activitiesData))
      ? {
          wellness: Array.isArray(wellnessData) ? wellnessData : undefined,
          activities: Array.isArray(activitiesData) ? activitiesData : undefined,
        }
      : null;

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem("paceiq_intake").then((raw) => {
      if (cancelled) return;
      try {
        setIntakeAnswers(raw ? JSON.parse(raw) : null);
      } catch {
        setIntakeAnswers(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const rateLimitSecs = Math.max(0, Math.ceil((rateLimitUntil - Date.now()) / 1000));
  const [, setTick] = useState(0);

  useEffect(() => {
    if (rateLimitSecs <= 0) return;
    const t = setInterval(() => setTick((c) => c + 1), 1000);
    return () => clearInterval(t);
  }, [rateLimitUntil, rateLimitSecs]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollToEnd({ animated: true });
  }, [messages.length]);

  const showGeneratePlan = messages.some(
    (m) => m.role === "assistant" && assistantSaysHasAllData(m.content),
  );

  const send = useCallback(
    async (input: string) => {
      const trimmed = input.trim();
      if (!trimmed || isLoading) return;
      if (rateLimitUntil > Date.now()) {
        Alert.alert(
          "Rate limit",
          `Please wait ${Math.ceil((rateLimitUntil - Date.now()) / 1000)}s before sending again.`,
        );
        return;
      }

      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? null;

      const userMsg: Msg = { role: "user", content: trimmed };
      const newMessages = [...messages, userMsg];
      setMessages(newMessages);
      setMessage("");
      setIsLoading(true);

      let assistantSoFar = "";
      const upsert = (chunk: string) => {
        assistantSoFar += chunk;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant") {
            return prev.map((m, i) =>
              i === prev.length - 1 ? { ...m, content: assistantSoFar } : m,
            );
          }
          return [...prev, { role: "assistant", content: assistantSoFar }];
        });
      };

      try {
        await streamChatNative({
          messages: newMessages,
          intakeAnswers,
          intervalsContext,
          token,
          onDelta: upsert,
          onDone: () => setIsLoading(false),
            onRateLimit: () => {
            setRateLimitUntil(Date.now() + 90000);
            Alert.alert(
              "Rate limit",
              "Gemini ~15/min. Wait 90s, then try again.",
            );
          },
          onError: (msg) => Alert.alert("Error", msg),
        });

        const finalContent = assistantSoFar;
        if (finalContent.includes('"create_plan"')) {
          const saved = await detectAndSavePlan(finalContent);
          if (saved) {
            Alert.alert("Plan saved", "View it on the Training Plan tab.", [
              { text: "OK", onPress: () => navigation.navigate("Plan") },
            ]);
          }
        }
      } catch (e) {
        console.error("[Kipcoachee] fetch error", e);
        Alert.alert(
          "Error",
          "Failed to reach Kipcoachee. Check connection and that GROQ_API_KEY or GEMINI_API_KEY is set in Supabase.",
        );
        setIsLoading(false);
      }
    },
    [isLoading, messages, intakeAnswers, intervalsContext, rateLimitUntil, navigation],
  );

  const handleStartFresh = () => {
    setMessages([]);
    Alert.alert("Done", "Started a fresh conversation.");
  };

  const handleGeneratePlan = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token ?? null;
    if (!token) {
      Alert.alert("Sign in to generate a plan.");
      return;
    }
    setGeneratingPlan(true);
    try {
      const res = await fetch(GENERATE_PLAN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY } : {}),
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          intakeAnswers: intakeAnswers ?? {},
          conversationContext: messages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const dataRes = await res.json().catch(() => ({}));
      if (!res.ok) {
        Alert.alert("Error", dataRes.error ?? "Failed to generate plan");
        return;
      }
      Alert.alert("Plan generated", "Check the Training Plan tab.", [
        { text: "OK", onPress: () => navigation.navigate("Plan") },
      ]);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to generate plan");
    } finally {
      setGeneratingPlan(false);
    }
  }, [intakeAnswers, messages, navigation]);

  const handleQuickPrompt = (prompt: string) => {
    send(prompt);
  };

  const placeholder =
    rateLimitSecs > 0 ? `Wait ${rateLimitSecs}s (rate limit)` : "Tell Kipcoachee your story...";

  const styles = useMemo(
    () =>
      StyleSheet.create({
        content: { flexGrow: 1, gap: 16 },
        headerRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 4,
        },
        title: { fontSize: 22, fontWeight: "600", color: colors.foreground },
        headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
        importButton: {
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 999,
          backgroundColor: colors.muted,
        },
        importButtonText: { fontSize: 12, fontWeight: "500", color: colors.mutedForeground },
        startFreshText: { fontSize: 14, color: colors.mutedForeground },
        chatCard: {
          flex: 1,
          borderRadius: 24,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          backgroundColor: colors.background,
          overflow: "hidden",
        },
        messagesContainer: { padding: 16, paddingBottom: 8, gap: 8 },
        welcomeText: { fontSize: 14, color: colors.foreground, lineHeight: 22 },
        sectionHeader: {},
        chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
        chip: {
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: 999,
          backgroundColor: colors.muted,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        },
        chipText: { fontSize: 13, color: colors.foreground },
        row: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 8 },
        avatar: {
          width: 28,
          height: 28,
          borderRadius: 999,
          backgroundColor: colors.primary + "20",
          alignItems: "center",
          justifyContent: "center",
        },
        avatarText: { fontSize: 12, fontWeight: "600", color: colors.primary },
        messageRow: { flexDirection: "row", alignItems: "flex-end", marginBottom: 6 },
        messageRowUser: { justifyContent: "flex-end" },
        messageRowAssistant: { justifyContent: "flex-start" },
        bubble: { maxWidth: "80%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
        bubbleUser: { backgroundColor: colors.primary },
        bubbleAssistant: {
          backgroundColor: colors.muted,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        },
        bubbleNutrition: { backgroundColor: "transparent", borderWidth: 0, padding: 0, overflow: "hidden" },
        nutritionCard: {
          borderRadius: 12,
          borderWidth: 1,
          borderColor: "rgba(16, 185, 129, 0.3)",
          backgroundColor: "rgba(16, 185, 129, 0.05)",
          padding: 14,
          gap: 10,
        },
        nutritionHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
        nutritionEmoji: { fontSize: 18 },
        nutritionTitle: { fontSize: 13, fontWeight: "600", color: "#10b981" },
        nutritionBody: { fontSize: 14, color: colors.foreground, lineHeight: 22 },
        messageText: { fontSize: 14, color: colors.foreground },
        messageTextUser: { color: colors.primaryForeground },
        generatePlanBar: {
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          backgroundColor: "rgba(59, 130, 246, 0.08)",
        },
        generatePlanButton: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          borderRadius: 999,
          paddingVertical: 10,
          paddingHorizontal: 16,
          backgroundColor: colors.primary,
        },
        generatePlanButtonDisabled: { opacity: 0.6 },
        generatePlanButtonText: { fontSize: 14, fontWeight: "600", color: colors.primaryForeground },
        inputRow: {
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          backgroundColor: colors.background,
          gap: 8,
        },
        input: {
          flex: 1,
          borderRadius: 999,
          paddingHorizontal: 16,
          paddingVertical: Platform.OS === "ios" ? 12 : 8,
          backgroundColor: colors.muted,
          color: colors.foreground,
        },
        sendButton: {
          borderRadius: 999,
          paddingHorizontal: 16,
          paddingVertical: 10,
          backgroundColor: colors.primary,
          alignItems: "center",
          justifyContent: "center",
        },
        sendButtonDisabled: { opacity: 0.5 },
        sendLabel: { fontSize: 14, fontWeight: "600", color: colors.primaryForeground },
      }),
    [colors]
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={80}
    >
      <ScreenContainer contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Kipcoachee</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.importButton}
              onPress={() => navigation.navigate("Settings")}
              activeOpacity={0.8}
            >
              <Text style={styles.importButtonText}>Import Garmin</Text>
            </TouchableOpacity>
            {messages.length > 0 && (
              <TouchableOpacity onPress={handleStartFresh} activeOpacity={0.8}>
                <Text style={styles.startFreshText}>Start fresh</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.chatCard}>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.messagesContainer}
            keyboardShouldPersistTaps="handled"
          >
            {messages.length === 0 && (
              <View style={styles.row}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>K</Text>
                </View>
                <GlassCard>
                  <Text style={styles.welcomeText}>{WELCOME.replace(/\*\*/g, "")}</Text>
                </GlassCard>
              </View>
            )}

            {messages.map((msg, idx) => {
              const isUser = msg.role === "user";
              return (
                <View
                  key={`${idx}-${msg.role}`}
                  style={[
                    styles.messageRow,
                    isUser ? styles.messageRowUser : styles.messageRowAssistant,
                  ]}
                >
                  {!isUser && (
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>K</Text>
                    </View>
                  )}
                  <View
                    style={[
                      styles.bubble,
                      isUser ? styles.bubbleUser : styles.bubbleAssistant,
                      !isUser && isNutritionMessage(msg.content) && styles.bubbleNutrition,
                    ]}
                  >
                    {!isUser && isNutritionMessage(msg.content) ? (
                      <View style={styles.nutritionCard}>
                        <View style={styles.nutritionHeader}>
                          <Text style={styles.nutritionEmoji}>🥗</Text>
                          <Text style={styles.nutritionTitle}>Recovery Nutrition</Text>
                        </View>
                        <Text style={styles.nutritionBody}>{msg.content}</Text>
                      </View>
                    ) : (
                      <Text
                        style={[
                          styles.messageText,
                          isUser && styles.messageTextUser,
                        ]}
                      >
                        {msg.content}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}

            {isLoading && (messages[messages.length - 1]?.role !== "assistant") && (
              <View style={styles.row}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>K</Text>
                </View>
                <GlassCard>
                  <ActivityIndicator size="small" color={colors.mutedForeground} />
                </GlassCard>
              </View>
            )}
          </ScrollView>

          {messages.length === 0 && (
            <View style={styles.chips}>
              {QUICK_PROMPTS.map((p) => (
                <TouchableOpacity
                  key={p}
                  style={styles.chip}
                  onPress={() => handleQuickPrompt(p)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.chipText} numberOfLines={2}>
                    {p}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {showGeneratePlan && (
            <View style={styles.generatePlanBar}>
              <TouchableOpacity
                style={[styles.generatePlanButton, generatingPlan && styles.generatePlanButtonDisabled]}
                onPress={handleGeneratePlan}
                disabled={generatingPlan}
                activeOpacity={0.8}
              >
                {generatingPlan ? (
                  <>
                    <ActivityIndicator size="small" color={colors.primaryForeground} />
                    <Text style={styles.generatePlanButtonText}>Generating plan…</Text>
                  </>
                ) : (
                  <Text style={styles.generatePlanButtonText}>Generate plan</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={message}
              onChangeText={setMessage}
              placeholder={placeholder}
              placeholderTextColor={colors.mutedForeground}
              editable={!isLoading && rateLimitSecs <= 0}
              returnKeyType="send"
              onSubmitEditing={() => send(message)}
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                (!message.trim() || isLoading || rateLimitSecs > 0) && styles.sendButtonDisabled,
              ]}
              activeOpacity={0.8}
              onPress={() => send(message)}
              disabled={!message.trim() || isLoading || rateLimitSecs > 0}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Text style={styles.sendLabel}>Send</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScreenContainer>
    </KeyboardAvoidingView>
  );
};
