import { FC, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { BottomTabNavigationProp, RouteProp } from "@react-navigation/bottom-tabs";
import { ScreenContainer } from "../components/ScreenContainer";
import { GlassCard } from "../components/GlassCard";
import { useTheme } from "../context/ThemeContext";
import { useDashboardData } from "../hooks/useDashboardData";
import { getLocalDateString } from "../lib/date";
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase, callEdgeFunctionWithRetry } from "../shared/supabase";
import { callEdgeFunctionWithRetry as callEdgeFetchWithRetry } from "../lib/edgeFunctionWithRetry";

const CHAT_URL = `${SUPABASE_URL}/functions/v1/coach-chat`;
import { useIntervalsIntegration } from "../hooks/useIntervalsIntegration";
import { useTrainingPlan } from "../hooks/useTrainingPlan";
import { extractPlanJson, stripPlanJson } from "../lib/coach-plan";
import { savePlanFromChat } from "../lib/kipcoachee/plan";
import type { AppTabsParamList } from "../navigation/RootNavigator";
import { addDays, format, startOfWeek, isToday } from "date-fns";
import Toast from "react-native-toast-message";
import { ChatStatChartsMobile } from "../components/ChatStatChartsMobile";
import { NutritionCard } from "../components/mobile/NutritionCard";

type Msg = { role: "user" | "assistant"; content: string };

type StoredMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  message_type: string;
  activity_id: string | null;
  created_at: string;
};

const DEFAULT_QUICK_PROMPTS = [
  "I'd like to describe my history and get a plan",
  "I'll import my Garmin data first",
  "How am I recovering this week?",
  "Build me an adaptive plan for this week",
  "What are my current training zones?",
  "Should I run hard today or take it easy?",
  "Help me peak for my race",
];

const PREMIUM_PROMPTS = [
  "🏃 How was my last run (6.1km)?",
  "📋 Am I on track with my plan?",
  "💪 Should I run hard today?",
  "📈 How is my fitness trending?",
  "🎯 What are my training zones?",
  "🏁 Help me peak for my race",
];

type FromSource = "plan" | "training" | "activities" | "activity" | "stats" | "dashboard" | null;

type ChatFilter = "all" | "analyses" | "chat";

function buildQuickPrompts({
  from,
  hasPlan,
  isConnected,
  lastRun,
  hasUpcomingWorkout,
  upcomingDesc,
  hrvLow,
}: {
  from: FromSource;
  hasPlan: boolean;
  isConnected: boolean;
  lastRun: { km: number; type: string } | null;
  hasUpcomingWorkout: boolean;
  upcomingDesc: string;
  hrvLow: boolean;
}): string[] {
  const prompts: string[] = [];

  if (from === "plan" || from === "training") {
    prompts.push("Am I on track with my plan this week?");
    if (hasUpcomingWorkout) prompts.push(`What should I focus on for ${upcomingDesc || "my next session"}?`);
    prompts.push("Can we adjust my plan for this week?");
    prompts.push("What's the purpose of my current training phase?");
    prompts.push("Should I skip or modify tomorrow's workout?");
  } else if (from === "activities" || from === "activity") {
    if (lastRun) prompts.push(`How was my ${lastRun.km}km ${lastRun.type.toLowerCase()}?`);
    prompts.push("Analyze my recent training load");
    prompts.push("Am I running too much or too little?");
    prompts.push("What do my pace trends say about my fitness?");
    prompts.push("Compare my last few weeks of training");
  } else if (from === "stats") {
    prompts.push("What does my CTL/TSB trend mean?");
    prompts.push("How is my fitness progressing?");
    prompts.push("Am I recovering well between sessions?");
    prompts.push("What do my HR zones tell you about my training?");
    prompts.push("Is my weekly volume appropriate?");
  } else if (from === "dashboard") {
    if (hrvLow) prompts.push("My HRV is low — should I take it easy today?");
    prompts.push("Should I run hard today or take it easy?");
    if (hasUpcomingWorkout) prompts.push(`Tell me about ${upcomingDesc || "today's workout"}`);
    prompts.push("How am I recovering this week?");
    prompts.push("Give me a quick training summary");
  } else {
    if (!hasPlan) {
      prompts.push("Build me a training plan");
      prompts.push("I'd like to describe my history and goals");
    }
    if (!isConnected) {
      prompts.push("How do I connect my data?");
    }
    if (hrvLow) prompts.push("My HRV is low — what should I do?");
    if (lastRun) prompts.push(`How was my last run (${lastRun.km}km)?`);
    if (hasPlan) {
      prompts.push("Am I on track with my plan?");
      prompts.push("Should I run hard today or take it easy?");
    }
    prompts.push("How is my fitness trending?");
    prompts.push("What are my current training zones?");
    prompts.push("Help me peak for my race");
  }

  return prompts.slice(0, 6);
}

const WELCOME = `Hey — I'm Cade, your AI running coach.

Before we build a plan, I need to understand you. Tell me your running history, goals, weekly volume, and what you’re training for — and I’ll create a personalized plan from that.

Make sure you’ve connected intervals.icu in Settings so I can see your real activities and wellness data.`;


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

function isRunningActivity(type: string | null | undefined): boolean {
  if (!type) return true;
  const t = type.toLowerCase();
  return t.includes("run");
}

function renderMarkdownLike(text: string, color: string): JSX.Element {
  const paragraphs = text.split(/\n{2,}/g);

  return (
    <>
      {paragraphs.map((para, idx) => {
        const parts = para.split("**");
        return (
          <Text key={idx} style={{ color, fontSize: 14, lineHeight: 22 }}>
            {parts.map((part, i) => {
              const isBold = i % 2 === 1;
              if (!isBold) return part;
              return (
                <Text key={i} style={{ fontWeight: "600" }}>
                  {part}
                </Text>
              );
            })}
            {idx < paragraphs.length - 1 ? "\n\n" : ""}
          </Text>
        );
      })}
    </>
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
  onError,
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
    console.error("[Cade] CHAT_URL missing - check EXPO_PUBLIC_SUPABASE_URL in app/.env");
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
    console.error("[Cade]", resp.status, err);
    if (resp.status === 429) {
      onRateLimit?.();
    } else {
      onError?.(err?.error ?? "Cade is unavailable right now.");
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

async function extractMemories(msgs: Msg[]) {
  const userMsgCount = msgs.filter((m) => m.role === "user").length;
  if (userMsgCount < 3) return;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    await callEdgeFunctionWithRetry({
      functionName: "coach-chat",
      body: { action: "extract_memories", messages: msgs },
      timeoutMs: 15000,
      maxRetries: 3,
      logContext: "CoachScreen:extract_memories",
    });
  } catch {
    // best-effort
  }
}

export const CoachScreen: FC = () => {
  const { colors, theme } = useTheme();
  const navigation = useNavigation<BottomTabNavigationProp<AppTabsParamList, "Coach">>();
  const route = useRoute<RouteProp<AppTabsParamList, "Coach">>();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const messagesRef = useRef<Msg[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [rateLimitUntil, setRateLimitUntil] = useState<number>(0);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [generatingPlanMessage, setGeneratingPlanMessage] = useState("Generating plan... (this may take a moment)");
  const [generatePlanFailed, setGeneratePlanFailed] = useState(false);
  const [intakeAnswers, setIntakeAnswers] = useState<Record<string, string | string[]> | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const { activities, readinessRows, readiness, todaysWorkout } = useDashboardData();

  const { isConnected } = useIntervalsIntegration();
  const { plan: planData } = useTrainingPlan();
  const queryClient = useQueryClient();
  const [applyingPlan, setApplyingPlan] = useState(false);
  const [openingMessage, setOpeningMessage] = useState<string | null>(null);
  const [openingLoading, setOpeningLoading] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [loadingTipIdx, setLoadingTipIdx] = useState(0);
  const onlinePulse = useRef(new Animated.Value(0)).current;
  const thinkingDots = useRef(new Animated.Value(0)).current;

  messagesRef.current = messages;

  // Use dashboard data for intervalsContext instead of duplicate queries
  const intervalsContext =
    isConnected && (readinessRows?.length > 0 || (activities?.length ?? 0) > 0)
      ? {
          wellness: readinessRows?.length ? readinessRows : undefined,
          activities: activities?.length ? activities : undefined,
        }
      : null;

  const intervalsContextRef = useRef(intervalsContext);
  const activitiesRef = useRef(activities);
  useEffect(() => {
    intervalsContextRef.current = intervalsContext;
  }, [intervalsContext]);
  useEffect(() => {
    activitiesRef.current = activities;
  }, [activities]);

  const { data: chatHistory = [] } = useQuery({
    queryKey: ["coach_history"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase
        .from("coach_message")
        .select("id, role, content, message_type, activity_id, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) return [];
      return (data ?? []) as StoredMsg[];
    },
  });

  const analyses = useMemo(
    () => chatHistory.filter((m) => m.message_type === "post_workout_analysis"),
    [chatHistory],
  );

  const chatOnly = useMemo(
    () =>
      [...chatHistory]
        .filter((m) => m.message_type !== "post_workout_analysis")
        .reverse(),
    [chatHistory],
  );

  const [chatFilter, setChatFilter] = useState<ChatFilter>("all");

  const contextAwareOpener = useMemo(() => {
    const acts = Array.isArray(activities) ? activities : [];
    const runs = acts.filter(
      (a) =>
        isRunningActivity(a.type) &&
        (a.distance_km ?? 0) > 0 &&
        (a.distance_km ?? 0) <= 150,
    );
    const last = runs[runs.length - 1];

    const today = new Date();
    const yesterday = addDays(today, -1);

    if (last?.date) {
      const d = new Date(last.date);
      if (isToday(d) || d.toDateString() === yesterday.toDateString()) {
        const when = isToday(d) ? "today" : "yesterday";
        const km = last.distance_km ? `${Math.round(last.distance_km * 10) / 10}km` : "a run";
        return `I see you ran ${km} ${when}. How did it feel?`;
      }
    }

    const weeks = planData?.weeks ?? [];
    const tomorrow = addDays(today, 1);
    const tomorrowStr = format(tomorrow, "yyyy-MM-dd");
    for (const w of weeks as { sessions?: { scheduled_date?: string; description?: string; session_type?: string }[] }[]) {
      for (const s of w.sessions ?? []) {
        const sd = s.scheduled_date ? String(s.scheduled_date).slice(0, 10) : "";
        if (sd === tomorrowStr) {
          return `You've got ${s.description ?? "a workout"} tomorrow. Ready for it?`;
        }
      }
    }

    const readinessArr = Array.isArray(readinessRows) ? readinessRows : [];
    const latest = readinessArr[readinessArr.length - 1];
    if (
      latest?.hrv != null &&
      latest?.hrv_baseline != null &&
      latest.hrv < latest.hrv_baseline * 0.9
    ) {
      return "Your HRV has been a bit low lately. How are you feeling?";
    }

    return "Here's your week. What's on your mind?";
  }, [activities, planData, readinessRows]);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem("paceiq_intake")
      .then((raw) => {
        if (cancelled) return;
        try {
          setIntakeAnswers(raw ? JSON.parse(raw) : null);
        } catch (e) {
          console.warn("[CoachScreen] Failed to parse intake from storage", e);
          setIntakeAnswers(null);
        }
      })
      .catch((e) => {
        console.warn("[CoachScreen] Failed to read intake from storage", e);
        setIntakeAnswers(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const OPENING_CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours

  const loadOpening = useCallback(
    async (forceRefresh: boolean) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const cacheKey = `coach_opening_${user.id}`;
      type CacheEntry = { message: string; timestamp: number; lastActivityDate: string | null };
      if (!forceRefresh) {
        try {
          const raw = await AsyncStorage.getItem(cacheKey);
          if (raw) {
            const cached = JSON.parse(raw) as CacheEntry;
            if (
              cached?.message &&
              Date.now() - cached.timestamp < OPENING_CACHE_TTL
            ) {
              const acts = activitiesRef.current ?? [];
              const currentNewest =
                acts.length > 0 ? (acts[acts.length - 1]?.date ?? null) : null;
              const noNewActivitySinceCache =
                (cached.lastActivityDate == null && !currentNewest) ||
                (cached.lastActivityDate != null &&
                  currentNewest != null &&
                  currentNewest <= cached.lastActivityDate);
              if (noNewActivitySinceCache) {
                setOpeningMessage(cached.message);
                return;
              }
            }
          }
        } catch {
          // ignore cache errors
        }
      }

      setOpeningLoading(true);
      try {
        await supabase.auth.refreshSession();
        const { data, error } = await callEdgeFunctionWithRetry({
          functionName: "coach-opening",
          body: {
            intervalsContext: intervalsContextRef.current,
          },
          timeoutMs: 15000,
          maxRetries: 3,
          logContext: "CoachScreen:coach-opening",
        });
        if (!error && (data as any)?.message) {
          const msg = (data as any).message as string;
          setOpeningMessage(msg);
          const acts = activitiesRef.current ?? [];
          const lastActivityDate =
            acts.length > 0 ? (acts[acts.length - 1]?.date ?? null) : null;
          try {
            await AsyncStorage.setItem(
              cacheKey,
              JSON.stringify({
                message: msg,
                timestamp: Date.now(),
                lastActivityDate,
              } as CacheEntry),
            );
          } catch {
            // ignore cache write errors
          }
        }
      } catch {
        // ignore — fall back to contextAwareOpener/WELCOME
      } finally {
        setOpeningLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (messages.length > 0) return;
    loadOpening(false);
  }, [messages.length, loadOpening]);

  const handleRefreshOpening = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await AsyncStorage.removeItem(`coach_opening_${user.id}`).catch(() => {});
    }
    await loadOpening(true);
  }, [loadOpening]);

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

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(onlinePulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(onlinePulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [onlinePulse]);

  useEffect(() => {
    if (!isLoading) return;
    const loop = Animated.loop(
      Animated.timing(thinkingDots, { toValue: 1, duration: 1000, useNativeDriver: true }),
    );
    loop.start();
    const id = setInterval(() => setLoadingTipIdx((v) => (v + 1) % 3), 1600);
    return () => {
      loop.stop();
      thinkingDots.setValue(0);
      clearInterval(id);
    };
  }, [isLoading, thinkingDots]);

  useEffect(() => {
    return () => {
      extractMemories(messagesRef.current);
    };
  }, []);

  const showGeneratePlan = messages.some(
    (m) => m.role === "assistant" && assistantSaysHasAllData(m.content),
  );

  const send = useCallback(
    async (input: string) => {
      const trimmed = input.trim();
      if (!trimmed || isLoading) return;
      setChatFilter("all");
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

        // Plan JSON (create_plan/adjust_plan) is now shown with Apply/Tweak UI instead of auto-saving.
        const _finalContent = assistantSoFar;
      } catch (e) {
        console.error("[Cade] fetch error", e);
        Alert.alert("Error", "Failed to reach Cade. Check connection and that ANTHROPIC_API_KEY, GROQ_API_KEY, or GEMINI_API_KEY is set in Supabase.");
        setIsLoading(false);
      }
    },
    [isLoading, messages, intakeAnswers, intervalsContext, rateLimitUntil, navigation],
  );

  const handleStartFresh = async () => {
    extractMemories(messages);
    setMessages([]);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await AsyncStorage.removeItem(`coach_opening_${user.id}`).catch(() => {});
    }
    Alert.alert("Done", "Started a fresh conversation.");
  };

  const handleGeneratePlan = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token ?? null;
    if (!token) {
      Alert.alert("Sign in to generate a plan.");
      return;
    }
    setGeneratePlanFailed(false);
    setGeneratingPlan(true);
    setGeneratingPlanMessage("Generating plan... (this may take a moment)");
    try {
      await callEdgeFetchWithRetry<{ plan_id?: string; error?: string }>(
        "coach-generate-plan",
        {
          intakeAnswers: intakeAnswers ?? {},
          conversationContext: messages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
        },
        {
          authToken: token,
          maxRetries: 3,
          timeout: 45000,
          onRetry: () => setGeneratingPlanMessage("Taking longer than expected, retrying..."),
        },
      );
      Alert.alert("Plan generated", "Check the Training Plan tab.", [
        { text: "OK", onPress: () => navigation.navigate("Plan") },
      ]);
    } catch (e) {
      setGeneratePlanFailed(true);
      Alert.alert(
        "Plan generation failed",
        "Try again?",
        [
          { text: "Retry", onPress: () => handleGeneratePlan() },
          { text: "OK", style: "cancel" },
        ],
      );
    } finally {
      setGeneratingPlan(false);
      setGeneratingPlanMessage("Generating plan... (this may take a moment)");
    }
  }, [intakeAnswers, messages, navigation]);

  const handleQuickPrompt = (prompt: string) => {
    send(prompt);
  };

  const placeholder =
    rateLimitSecs > 0 ? `Wait ${rateLimitSecs}s (rate limit)` : "Tell Cade your story...";

  const handleApplyPlan = useCallback(
    async (plan: Record<string, unknown>, isAdjustment: boolean) => {
      if (applyingPlan) return;
      setApplyingPlan(true);
      try {
        let adjustmentReason: string | undefined;
        if (isAdjustment && messages.length > 0) {
          const recentUserMsgs = messages.filter((m) => m.role === "user").slice(-3);
          adjustmentReason = recentUserMsgs.map((m) => m.content).join(" | ").slice(0, 300);
        }
        const ok = await savePlanFromChat(plan, isAdjustment, adjustmentReason);
        if (ok) {
          queryClient.invalidateQueries({ queryKey: ["training-plan"] });
          Toast.show({ type: "success", text1: "✓ Plan applied successfully", position: "bottom", visibilityTime: 2500 });
          Alert.alert("Plan updated", "View it on the Training Plan tab.", [
            { text: "OK", onPress: () => navigation.navigate("Plan") },
          ]);
        } else {
          Alert.alert("Error", "Failed to save plan");
        }
      } catch (e) {
        Alert.alert("Error", e instanceof Error ? e.message : "Failed to save plan");
      } finally {
        setApplyingPlan(false);
      }
    },
    [applyingPlan, messages, navigation, queryClient],
  );

  const weekDays = useMemo(() => {
    const weeks = planData?.weeks ?? [];
    if (!weeks.length && !Array.isArray(activities)) return [];

    const mon = startOfWeek(new Date(), { weekStartsOn: 1 });
    const monStr = format(mon, "yyyy-MM-dd");
    const sunStr = format(addDays(mon, 6), "yyyy-MM-dd");

    const planByDate = new Map<
      string,
      { type: string; description: string; distance_km?: number | null }
    >();

    for (const week of weeks as { sessions?: { scheduled_date?: string; session_type?: string; description?: string; distance_km?: number | null }[] }[]) {
      for (const s of week.sessions ?? []) {
        const d = s.scheduled_date ? String(s.scheduled_date).slice(0, 10) : null;
        if (d && d >= monStr && d <= sunStr && !planByDate.has(d)) {
          planByDate.set(d, {
            type: (s.session_type ?? "easy").toLowerCase(),
            description: s.description ?? "",
            distance_km: s.distance_km ?? null,
          });
        }
      }
    }

    const acts = Array.isArray(activities) ? activities : [];

    return [0, 1, 2, 3, 4, 5, 6].map((i) => {
      const d = addDays(mon, i);
      const dateStr = format(d, "yyyy-MM-dd");
      const today = isToday(d);

      const act = acts.find(
        (a: any) =>
          isRunningActivity(a.type) &&
          a.date === dateStr &&
          (a.distance_km ?? 0) >= 0.01,
      ) as any | undefined;

      const planned = planByDate.get(dateStr);
      const hasSession = !!act || !!planned;

      const type = (act
        ? (act.type ?? "run").toLowerCase()
        : planned?.type ?? "rest") as
        | "easy"
        | "tempo"
        | "interval"
        | "long"
        | "recovery"
        | "rest";

      const distance = act
        ? Math.round((act.distance_km ?? 0) * 10) / 10
        : planned?.distance_km ?? 0;

      const title = act
        ? (act.name as string) ??
          `${act.type ?? "Run"} ${distance ? `${distance} km` : ""}`.trim()
        : planned
        ? planned.description || (distance ? `Run ${distance} km` : planned.type || "Run")
        : "Rest";

      return {
        key: dateStr,
        dayLabel: format(d, "EEE"),
        dateLabel: format(d, "d"),
        type,
        title,
        distance,
        today,
        done: !!act,
        hasSession,
      };
    });
  }, [activities, planData]);

  const hasWeekPlan = weekDays.some((d) => d.hasSession);

  const fromSource: FromSource =
    (route.params as any)?.from && typeof (route.params as any).from === "string"
      ? ((route.params as any).from as FromSource)
      : null;

  const lastRun = useMemo(() => {
    const acts = activities.filter((a) => a.type && isRunningActivity(a.type));
    if (!acts.length) return null;
    const last = acts[acts.length - 1];
    return {
      km: Math.round((last.distance_km ?? 0) * 10) / 10,
      type: last.type ?? "Run",
    };
  }, [activities]);

  const quickPrompts = useMemo(() => {
    const prompts = buildQuickPrompts({
      from: fromSource,
      hasPlan: !!planData?.plan,
      isConnected,
      lastRun,
      hasUpcomingWorkout: !!todaysWorkout && !!todaysWorkout.title,
      upcomingDesc: todaysWorkout?.title ?? "",
      hrvLow: (readiness?.score ?? 100) < 40,
    });
    return prompts.length ? prompts : DEFAULT_QUICK_PROMPTS;
  }, [fromSource, planData?.plan, isConnected, lastRun, todaysWorkout, readiness?.score]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
      content: { flex: 1, flexGrow: 1, gap: 16 },
        headerRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 4,
        },
        titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
        onlineDot: { width: 8, height: 8, borderRadius: 999, backgroundColor: "#22c55e" },
        onlineText: { fontSize: 12, color: "#16a34a", fontWeight: "600" },
        tabBar: {
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          marginBottom: 12,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        tab: {
          paddingVertical: 10,
          paddingHorizontal: 12,
          marginBottom: -1,
        },
        tabSelected: {
          borderBottomWidth: 2,
          borderBottomColor: theme.textPrimary,
        },
        tabLabel: { fontSize: 14, fontWeight: "500" },
        tabLabelSelected: { color: theme.textPrimary, fontWeight: "600" },
        tabLabelUnselected: { color: colors.mutedForeground },
        title: { fontSize: 22, fontWeight: "600", color: colors.foreground },
        headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
        importButton: {
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 999,
          backgroundColor: colors.muted,
        },
        overflowButton: {
          width: 28,
          height: 28,
          borderRadius: 999,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.muted,
        },
        overflowMenu: {
          position: "absolute",
          top: 34,
          right: 0,
          borderRadius: 12,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          backgroundColor: colors.card,
          minWidth: 140,
          zIndex: 5,
          paddingVertical: 4,
        },
        overflowMenuItem: { paddingHorizontal: 12, paddingVertical: 10 },
        overflowMenuText: { fontSize: 13, color: colors.foreground },
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
        chips: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          paddingHorizontal: 16,
          paddingBottom: 8,
          paddingTop: 8,
        },
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
        messageText: { fontSize: 14, color: colors.foreground },
        messageTextUser: { color: colors.primaryForeground },
        weekStripCard: {
          borderRadius: 16,
          padding: 12,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          backgroundColor: colors.card,
          marginBottom: 8,
        },
        weekStripRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        },
        weekStripTitle: {
          fontSize: 14,
          fontWeight: "500",
          color: colors.foreground,
        },
        weekStripSubtitle: {
          fontSize: 12,
          color: colors.mutedForeground,
        },
        weekStripDaysRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          gap: 4,
        },
        weekDayCard: {
          flex: 1,
          borderRadius: 10,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          paddingVertical: 6,
          paddingHorizontal: 4,
          minHeight: 80,
          backgroundColor: colors.background,
        },
        weekDayHeader: {
          fontSize: 11,
          marginBottom: 2,
        },
        weekDayHeaderToday: {
          color: colors.primary,
          fontWeight: "600",
        },
        weekDayHeaderNormal: {
          color: colors.mutedForeground,
        },
        weekDayTitle: {
          fontSize: 11,
          color: colors.foreground,
        },
        weekDayTitleMuted: {
          color: colors.mutedForeground,
        },
        weekDayPill: {
          marginTop: 4,
          alignSelf: "flex-start",
          paddingHorizontal: 6,
          paddingVertical: 2,
          borderRadius: 999,
        },
        weekDayPillText: {
          fontSize: 10,
          fontWeight: "500",
        },
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
        loadingCard: {
          borderRadius: 12,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          backgroundColor: colors.card,
          padding: 10,
          marginTop: 8,
        },
        loadingTitle: { fontSize: 13, fontWeight: "600", color: colors.foreground },
        loadingTip: { marginTop: 4, fontSize: 12, color: colors.mutedForeground },
        promptCard: {
          flexDirection: "row",
          alignItems: "center",
          borderRadius: 12,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          backgroundColor: colors.card,
          paddingHorizontal: 12,
          height: 52,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 4,
          elevation: 2,
        },
        promptCardText: { flex: 1, fontSize: 13, color: colors.foreground, textAlign: "left" },
        promptCardChevron: { fontSize: 14, color: colors.mutedForeground, marginLeft: 8 },
        inputRow: {
          flexDirection: "row",
          alignItems: "center",
          marginHorizontal: 12,
          marginVertical: 8,
          paddingHorizontal: 14,
          paddingVertical: Platform.OS === "ios" ? 10 : 8,
          borderRadius: 24,
          backgroundColor: "#FFFFFF",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 4,
          elevation: 2,
          gap: 8,
        },
        input: {
          flex: 1,
          paddingHorizontal: 0,
          paddingVertical: 0,
          color: colors.foreground,
        },
        sendButton: {
          width: 32,
          height: 32,
          borderRadius: 16,
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
      behavior="padding"
      keyboardVerticalOffset={80}
    >
      <ScreenContainer contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Cade</Text>
            <Animated.View
              style={[
                styles.onlineDot,
                {
                  opacity: onlinePulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
                  transform: [
                    {
                      scale: onlinePulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.15] }),
                    },
                  ],
                },
              ]}
            />
            <Text style={styles.onlineText}>Online</Text>
          </View>
          <View style={styles.headerActions}>
            <View style={{ position: "relative" }}>
              <TouchableOpacity style={styles.overflowButton} onPress={() => setShowHeaderMenu((v) => !v)} activeOpacity={0.85}>
                <Text style={{ color: colors.mutedForeground, fontSize: 16 }}>⋮</Text>
              </TouchableOpacity>
              {showHeaderMenu && (
                <View style={styles.overflowMenu}>
                  <TouchableOpacity
                    style={styles.overflowMenuItem}
                    onPress={() => {
                      setShowHeaderMenu(false);
                      navigation.navigate("Settings");
                    }}
                  >
                    <Text style={styles.overflowMenuText}>Import Garmin</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
            {messages.length > 0 && (
              <TouchableOpacity onPress={handleStartFresh} activeOpacity={0.8}>
                <Text style={styles.startFreshText}>Start fresh</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.tabBar}>
          {(["all", "analyses", "chat"] as const).map((key) => (
            <TouchableOpacity
              key={key}
              style={[styles.tab, chatFilter === key && styles.tabSelected]}
              onPress={() => setChatFilter(key)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.tabLabel,
                  chatFilter === key ? styles.tabLabelSelected : styles.tabLabelUnselected,
                ]}
              >
                {key === "all" ? "All" : key === "analyses" ? "Analyses" : "Chat"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {hasWeekPlan && (
          <View>
            <View style={styles.weekStripCard}>
              <View style={styles.weekStripRow}>
                <Text style={styles.weekStripTitle}>This week</Text>
                <Text style={styles.weekStripSubtitle}>Plan + completed runs</Text>
              </View>
              <View style={styles.weekStripDaysRow}>
                {weekDays.map((d) => {
                  const pillColors: Record<string, { bg: string; fg: string }> = {
                    easy: { bg: colors.accent, fg: theme.primaryForeground },
                    tempo: { bg: colors.primary, fg: colors.primaryForeground },
                    interval: { bg: colors.destructive, fg: "#fff" },
                    intervals: { bg: colors.destructive, fg: "#fff" },
                    long: { bg: colors.primary, fg: colors.primaryForeground },
                    recovery: { bg: colors.muted, fg: colors.mutedForeground },
                    rest: { bg: "transparent", fg: colors.mutedForeground },
                  };
                  const pill = pillColors[d.type] ?? pillColors.rest;
                  return (
                    <TouchableOpacity
                      key={d.key}
                      style={styles.weekDayCard}
                      activeOpacity={d.hasSession ? 0.85 : 1}
                      onPress={
                        d.hasSession
                          ? () =>
                              send(
                                `Tell me about ${
                                  d.today ? "today's" : `${d.dayLabel}'s`
                                } session: ${d.title}`,
                              )
                          : undefined
                      }
                    >
                      <Text
                        style={[
                          styles.weekDayHeader,
                          d.today
                            ? styles.weekDayHeaderToday
                            : styles.weekDayHeaderNormal,
                        ]}
                      >
                        {d.today ? "Today" : d.dayLabel} {d.dateLabel}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.weekDayTitle,
                          !d.hasSession && styles.weekDayTitleMuted,
                        ]}
                      >
                        {d.hasSession
                          ? d.type === "interval" || d.type === "intervals" ? "Interval"
                            : d.type === "tempo" || d.type === "threshold" ? "Tempo"
                            : d.type === "long" ? "Long"
                            : d.type === "recovery" ? "Easy"
                            : d.type === "easy" ? "Easy"
                            : d.type.charAt(0).toUpperCase() + d.type.slice(1)
                          : "Rest"}
                      </Text>
                      {d.hasSession && (
                        <View
                          style={[
                            styles.weekDayPill,
                            { backgroundColor: pill.bg + "33" },
                          ]}
                        >
                          <Text
                            style={[
                              styles.weekDayPillText,
                              { color: pill.fg },
                            ]}
                          >
                            {d.done ? "Done" : d.type}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  right: 0,
                  top: 0,
                  bottom: 0,
                  width: 24,
                  backgroundColor: colors.card + "00",
                }}
              />
            </View>
            <Text style={{ marginTop: 4, fontSize: 11, color: colors.mutedForeground, textAlign: "right" }}>
              swipe →
            </Text>
          </View>
        )}

        <View style={styles.chatCard}>
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={[styles.messagesContainer, { flexGrow: 1, justifyContent: "flex-end" }]}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={openingLoading}
                onRefresh={handleRefreshOpening}
              />
            }
          >
            {chatFilter === "all" && messages.length === 0 && (
              <View style={styles.row}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>K</Text>
                </View>
                <GlassCard>
                  {openingLoading ? (
                    <View style={styles.loadingCard}>
                      <Animated.View style={{
                        height: 14, borderRadius: 7, width: "70%", marginBottom: 8,
                        backgroundColor: colors.muted,
                        opacity: onlinePulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.8] }),
                      }} />
                      <Animated.View style={{
                        height: 12, borderRadius: 6, width: "90%", marginBottom: 6,
                        backgroundColor: colors.muted,
                        opacity: onlinePulse.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] }),
                      }} />
                      <Animated.View style={{
                        height: 12, borderRadius: 6, width: "50%",
                        backgroundColor: colors.muted,
                        opacity: onlinePulse.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.6] }),
                      }} />
                    </View>
                  ) : (
                    <Text style={styles.welcomeText}>{openingMessage || contextAwareOpener || WELCOME}</Text>
                  )}
                </GlassCard>
              </View>
            )}

            {chatFilter === "all" && messages.length === 0 && analyses.length > 0 && (
              <View style={{ marginTop: 8, gap: 6 }}>
                <Text
                  style={{
                    fontSize: 11,
                    color: colors.mutedForeground,
                    marginLeft: 36,
                    marginBottom: 2,
                  }}
                >
                  Recent analyses
                </Text>
                {analyses.slice(0, 5).map((a) => (
                  <View key={a.id} style={styles.row}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>K</Text>
                    </View>
                    <GlassCard>
                      <View style={{ padding: 10 }}>
                        <Text
                          style={{
                            fontSize: 11,
                            color: colors.mutedForeground,
                            marginBottom: 4,
                          }}
                        >
                          {format(new Date(a.created_at), "MMM d, HH:mm")}
                        </Text>
                        {renderMarkdownLike(a.content, colors.foreground)}
                      </View>
                    </GlassCard>
                  </View>
                ))}
              </View>
            )}

            {chatFilter === "analyses" && analyses.length > 0 && (
              <View style={{ gap: 6 }}>
                <Text
                  style={{
                    fontSize: 11,
                    color: colors.mutedForeground,
                    marginLeft: 36,
                    marginBottom: 2,
                  }}
                >
                  Post-workout analyses
                </Text>
                {analyses.slice(0, 20).map((a) => (
                  <View key={a.id} style={styles.row}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>K</Text>
                    </View>
                    <GlassCard>
                      <View style={{ padding: 10 }}>
                        <Text
                          style={{
                            fontSize: 11,
                            color: colors.mutedForeground,
                            marginBottom: 4,
                          }}
                        >
                          {format(new Date(a.created_at), "MMM d, HH:mm")}
                        </Text>
                        {renderMarkdownLike(a.content, colors.foreground)}
                      </View>
                    </GlassCard>
                  </View>
                ))}
              </View>
            )}

            {chatFilter === "analyses" && analyses.length === 0 && (
              <View style={styles.row}>
                <Text style={[styles.welcomeText, { color: colors.mutedForeground }]}>
                  No post-workout analyses yet.
                </Text>
              </View>
            )}

            {chatFilter === "chat" && chatOnly.length > 0 &&
              chatOnly.map((m) => {
                const isNutrition = m.role === "assistant" && (m.message_type === "nutrition" || isNutritionMessage(m.content));
                return (
                  <View
                    key={m.id}
                    style={[
                      styles.messageRow,
                      m.role === "user" ? styles.messageRowUser : styles.messageRowAssistant,
                    ]}
                  >
                    {m.role === "assistant" && (
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>K</Text>
                      </View>
                    )}
                    <View
                      style={[
                        styles.bubble,
                        m.role === "user" ? styles.bubbleUser : styles.bubbleAssistant,
                        isNutrition && styles.bubbleNutrition,
                      ]}
                    >
                      {isNutrition ? (
                        <NutritionCard content={m.content} />
                      ) : (
                        renderMarkdownLike(m.content, m.role === "user" ? colors.primaryForeground : colors.foreground)
                      )}
                    </View>
                  </View>
                );
              })}

            {chatFilter === "chat" && chatOnly.length === 0 && (
              <View style={styles.row}>
                <Text style={[styles.welcomeText, { color: colors.mutedForeground }]}>
                  No chat messages yet.
                </Text>
              </View>
            )}

            {chatFilter === "all" && messages.map((msg, idx) => {
              const isUser = msg.role === "user";
              const extractedPlan = !isUser ? extractPlanJson(msg.content) : null;
              const displayText =
                !isUser && extractedPlan ? stripPlanJson(msg.content) || "Here are the suggested changes:" : msg.content;

              return (
                <View key={`${idx}-${msg.role}`}>
                  <View
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
                        !isUser && isNutritionMessage(displayText) && styles.bubbleNutrition,
                      ]}
                    >
                      {!isUser && isNutritionMessage(displayText) ? (
                        <NutritionCard content={displayText} />
                      ) : (
                        renderMarkdownLike(
                          displayText,
                          (isUser ? styles.messageTextUser : styles.messageText).color,
                        )
                      )}
                    </View>
                  </View>

                  {!isUser && !isLoading && (
                    <View style={{ marginLeft: 40, marginTop: 4 }}>
                      <ChatStatChartsMobile
                        content={msg.content}
                        readiness={Array.isArray(readinessRows) ? readinessRows : []}
                        activities={Array.isArray(activities) ? activities : []}
                      />
                    </View>
                  )}

                  {!isUser && extractedPlan && (
                    <View style={{ marginLeft: 40, marginTop: 6 }}>
                      <GlassCard>
                        <View style={{ padding: 10 }}>
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: "600",
                              color: colors.foreground,
                              marginBottom: 4,
                            }}
                          >
                            Plan suggestion
                          </Text>
                          <Text
                            style={{
                              fontSize: 11,
                              color: colors.mutedForeground,
                              marginBottom: 8,
                            }}
                          >
                            Apply this plan to your calendar or ask to tweak it further.
                          </Text>
                          <View
                            style={{
                              flexDirection: "row",
                              justifyContent: "flex-start",
                              gap: 8,
                            }}
                          >
                            <TouchableOpacity
                              onPress={() =>
                                handleApplyPlan(
                                  extractedPlan.plan,
                                  extractedPlan.action === "adjust_plan",
                                )
                              }
                              activeOpacity={0.85}
                              style={{
                                paddingHorizontal: 12,
                                paddingVertical: 8,
                                borderRadius: 999,
                                backgroundColor: colors.primary,
                                opacity: applyingPlan ? 0.7 : 1,
                              }}
                              disabled={applyingPlan}
                            >
                              <Text
                                style={{
                                  fontSize: 12,
                                  fontWeight: "600",
                                  color: colors.primaryForeground,
                                }}
                              >
                                {applyingPlan ? "Applying…" : "Apply to my plan"}
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() =>
                                setMessage("I'd like to make some changes to the plan")
                              }
                              activeOpacity={0.85}
                              style={{
                                paddingHorizontal: 12,
                                paddingVertical: 8,
                                borderRadius: 999,
                                borderWidth: StyleSheet.hairlineWidth,
                                borderColor: colors.border,
                              }}
                              disabled={applyingPlan}
                            >
                              <Text
                                style={{
                                  fontSize: 12,
                                  fontWeight: "500",
                                  color: colors.mutedForeground,
                                }}
                              >
                                No, let’s tweak
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </GlassCard>
                    </View>
                  )}
                </View>
              );
            })}

            {chatFilter === "all" && isLoading && (messages[messages.length - 1]?.role !== "assistant") && (
              <View style={styles.row}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>K</Text>
                </View>
                <GlassCard>
                  <View style={styles.loadingCard}>
                    <Animated.View style={{
                      height: 12, borderRadius: 6, width: "65%", marginBottom: 6,
                      backgroundColor: colors.muted,
                      opacity: onlinePulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.8] }),
                    }} />
                    <Animated.View style={{
                      height: 12, borderRadius: 6, width: "80%",
                      backgroundColor: colors.muted,
                      opacity: onlinePulse.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] }),
                    }} />
                  </View>
                </GlassCard>
              </View>
            )}
          </ScrollView>

          {chatFilter === "all" && messages.length === 0 && (
            <View style={styles.chips}>
              {(PREMIUM_PROMPTS.length ? PREMIUM_PROMPTS : quickPrompts).map((p) => (
                <TouchableOpacity
                  key={p}
                  style={styles.chip}
                  onPress={() => handleQuickPrompt(p)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.chipText} numberOfLines={2}>
                    {p}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {chatFilter === "all" && showGeneratePlan && (
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
                    <Text style={styles.generatePlanButtonText}>{generatingPlanMessage}</Text>
                  </>
                ) : (
                  <Text style={styles.generatePlanButtonText}>{generatePlanFailed ? "Try again?" : "Generate plan"}</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={message}
              onChangeText={setMessage}
              placeholder={rateLimitSecs > 0 ? `Wait ${rateLimitSecs}s (rate limit)` : "Message Cade..."}
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
                <Text style={[styles.sendLabel, { fontSize: 16 }]}>↗</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScreenContainer>
    </KeyboardAvoidingView>
  );
};
