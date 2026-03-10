import { FC, useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { ScreenContainer } from "../components/ScreenContainer";
import { GlassCard } from "../components/GlassCard";
import { colors, typography } from "../theme/theme";
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from "../shared/supabase";

type Msg = { role: "user" | "assistant"; content: string };

const QUICK_PROMPTS = [
  "I'd like to describe my history and get a plan",
  "I'll import my Garmin data first",
  "How am I recovering this week?",
  "Build me an adaptive plan for this week",
  "What are my current training zones?",
  "Should I run hard today or take it easy?",
];

const WELCOME = `Hey — I'm **Kipcoachee**, your AI running coach.

Before we build a plan, I need to understand you. We can do this two ways:

1. **Describe your story** — tell me your running history, goals, volume, and I'll create a plan from that.
2. **Import Garmin data first** — upload your Garmin export and I'll use your real activities and wellness data to build a plan tailored to you.

Which path do you want to take?`;

const CHAT_URL = `${SUPABASE_URL}/functions/v1/coach-chat`;

async function streamChatNative({
  messages,
  token,
  onDelta,
  onDone,
  onRateLimit,
}: {
  messages: Msg[];
  token: string | null;
  onDelta: (text: string) => void;
  onDone: () => void;
  onRateLimit?: () => void;
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
    body: JSON.stringify({ messages, intakeAnswers: null, intervalsContext: null }),
  });

  if (!resp.ok) {
    let err: any = null;
    try {
      err = await resp.json();
    } catch {
      // ignore
    }
    console.error("[Kipcoachee]", resp.status, err);
    if (resp.status === 429) {
      onRateLimit?.();
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

export const CoachScreen: FC = () => {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [rateLimitUntil, setRateLimitUntil] = useState<number>(0);
  const scrollRef = useRef<ScrollView | null>(null);

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

  const send = useCallback(
    async (input: string) => {
      const trimmed = input.trim();
      if (!trimmed || isLoading) return;
      if (rateLimitUntil > Date.now()) {
        console.warn(
          `[Kipcoachee] Rate limited, wait ${Math.ceil((rateLimitUntil - Date.now()) / 1000)}s`,
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
          token,
          onDelta: upsert,
          onDone: () => setIsLoading(false),
          onRateLimit: () => setRateLimitUntil(Date.now() + 90_000),
        });
      } catch (e) {
        console.error("[Kipcoachee] fetch error", e);
        setIsLoading(false);
      }
    },
    [isLoading, messages, rateLimitUntil],
  );

  const handleQuickPrompt = (prompt: string) => {
    send(prompt);
  };

  const placeholder =
    rateLimitSecs > 0 ? `Wait ${rateLimitSecs}s (rate limit)` : "Tell Kipcoachee your story...";

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={80}
    >
      <ScreenContainer contentContainerStyle={styles.content}>
        <Text style={styles.title}>Kipcoachee</Text>

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
                    ]}
                  >
                    <Text
                      style={[
                        styles.messageText,
                        isUser && styles.messageTextUser,
                      ]}
                    >
                      {msg.content}
                    </Text>
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

const styles = StyleSheet.create({
  content: { flexGrow: 1, gap: 16 },
  title: { fontSize: 22, fontWeight: "600", color: colors.foreground },
  chatCard: {
    flex: 1,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.background,
    overflow: "hidden",
  },
  messagesContainer: {
    padding: 16,
    paddingBottom: 8,
    gap: 8,
  },
  welcomeText: {
    fontSize: 14,
    color: colors.foreground,
    lineHeight: 22,
  },
  sectionHeader: {},
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
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
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 8,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: colors.primary + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.primary,
  },
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: 6,
  },
  messageRowUser: {
    justifyContent: "flex-end",
  },
  messageRowAssistant: {
    justifyContent: "flex-start",
  },
  bubble: {
    maxWidth: "80%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  bubbleUser: {
    backgroundColor: colors.primary,
  },
  bubbleAssistant: {
    backgroundColor: colors.muted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  messageText: {
    fontSize: 14,
    color: colors.foreground,
  },
  messageTextUser: {
    color: colors.primaryForeground,
  },
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
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.primaryForeground,
  },
});
