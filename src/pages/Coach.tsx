import { AppLayout } from "@/components/AppLayout";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Send, Loader2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { GarminImportBlock } from "@/components/GarminImportBlock";
import { OnboardingFlow } from "@/components/OnboardingFlow";
import type { Components } from "react-markdown";
import { toast } from "sonner";
import { useIntervalsIntegration } from "@/hooks/useIntervalsIntegration";
import { useActivities } from "@/hooks/useActivities";
import { useReadiness } from "@/hooks/useReadiness";
import { useAthleteProfile } from "@/hooks/useAthleteProfile";
import { useTrainingPlan } from "@/hooks/use-training-plan";
import { format, addDays, isToday } from "date-fns";

type Msg = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/coach-chat`;

const KIPCOACH_WELCOME = `Hey — I'm **Kipcoachee**, your AI running coach.

Before we build a plan, I need to understand you. We can do this two ways:

1. **Describe your story** — tell me your running history, goals, volume, and I’ll create a plan from that.
2. **Import Garmin data first** — upload your Garmin export (button above) and I’ll use your real activities and wellness data to build a plan tailored to you.

Which path do you want to take? Or tell me your story and we’ll figure it out together.`;

const fmt = (d: Date) => format(d, "yyyy-MM-dd");
const now = new Date();

const markdownComponents: Components = {
  p: ({ children }) => <p className="mb-3 last:mb-0 text-foreground leading-relaxed">{children}</p>,
  h2: ({ children }) => <h2 className="mt-4 mb-2 text-base font-semibold text-foreground first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-3 mb-1.5 text-sm font-semibold text-foreground first:mt-0">{children}</h3>,
  ul: ({ children }) => <ul className="my-3 space-y-1.5 list-disc list-inside text-foreground pl-1 marker:text-primary">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 space-y-1.5 list-decimal list-inside text-foreground pl-1 marker:font-medium">{children}</ol>,
  li: ({ children }) => <li className="py-0.5 text-foreground pl-1">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  code: ({ children }) => (
    <code className="px-1.5 py-0.5 rounded-md bg-secondary text-foreground text-xs font-medium">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="my-3 p-4 rounded-xl bg-secondary/80 overflow-x-auto text-sm text-foreground whitespace-pre-wrap">{children}</pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 pl-4 border-l-2 border-primary/30 text-muted-foreground italic">{children}</blockquote>
  ),
};

function NutritionCard({ content }: { content: string }) {
  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
      <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
        <span className="text-lg">🥗</span>
        <span className="text-sm font-semibold">Recovery Nutrition</span>
      </div>
      <div className="text-sm text-foreground leading-relaxed">
        <ReactMarkdown components={markdownComponents}>{content}</ReactMarkdown>
      </div>
    </div>
  );
}

function isNutritionMessage(content: string): boolean {
  const lower = content.toLowerCase();
  return (
    (lower.includes("recovery nutrition") || lower.includes("recovery fuel")) &&
    (lower.includes("immediate") || lower.includes("main meal") || lower.includes("hydration"))
  );
}

const quickPrompts = [
  "I'd like to describe my history and get a plan",
  "I'll import my Garmin data first",
  "How am I recovering this week?",
  "Build me an adaptive plan for this week",
  "What are my current training zones?",
  "Should I run hard today or take it easy?",
  "Help me peak for my race",
];

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

const GENERATE_PLAN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/coach-generate-plan`;

async function streamChat({
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
}) {
  const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(apikey ? { apikey } : {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  if (!CHAT_URL || CHAT_URL.includes("undefined")) {
    console.error("[Kipcoachee] CHAT_URL missing - check VITE_SUPABASE_URL in .env");
  }

  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ messages, intakeAnswers, intervalsContext }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Request failed" }));
    console.error("[Kipcoachee]", resp.status, err);
    if (resp.status === 429) {
      onRateLimit?.();
      toast.error("Rate limit (Gemini ~15/min). Wait 90s, then try again.");
    } else {
      toast.error(err.error || "Kipcoachee is unavailable right now.");
    }
    onDone();
    return;
  }

  if (!resp.body) { onDone(); return; }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done = false;

  while (!done) {
    const { done: readerDone, value } = await reader.read();
    if (readerDone) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
      let line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "") continue;
      if (!line.startsWith("data: ")) continue;
      const jsonStr = line.slice(6).trim();
      if (jsonStr === "[DONE]") { done = true; break; }
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
  const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) ?? content.match(/(\{[\s\S]*"action"\s*:\s*"create_plan"[\s\S]*\})/);
  if (!jsonMatch) return false;
  try {
    const parsed = JSON.parse(jsonMatch[1] ?? jsonMatch[0]);
    if (parsed?.action !== "create_plan" || !parsed?.plan) return false;
    const plan = parsed.plan;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data: planRow, error: planErr } = await supabase.from("training_plan").insert({
      user_id: user.id,
      race_type: plan.name ?? "Training Plan",
      plan_name: plan.name,
      philosophy: plan.philosophy,
      is_active: true,
    }).select("id").single();

    if (planErr || !planRow) return false;

    const weeks = plan.weeks ?? [];
    for (const week of weeks) {
      const { data: weekRow } = await supabase.from("training_week").insert({
        plan_id: planRow.id,
        week_number: week.week_number ?? 1,
        start_date: new Date().toISOString().slice(0, 10),
        notes: week.focus ?? null,
      }).select("id").single();

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

export default function Coach() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [rateLimitUntil, setRateLimitUntil] = useState<number>(0);
  const [importSheetOpen, setImportSheetOpen] = useState(false);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [onboardingAnswers, setOnboardingAnswers] = useState<Record<string, unknown>>({});
  const [onboardingPhase, setOnboardingPhase] = useState<"active" | "done">("active");
  const [intakeAnswers] = useState<Record<string, string | string[]> | null>(() => {
    try { return JSON.parse(localStorage.getItem("paceiq_intake") || "null"); } catch { return null; }
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  const { onboardingComplete, update: updateProfile } = useAthleteProfile();

  useEffect(() => {
    if (searchParams.get("import") === "1") {
      setImportSheetOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const { isConnected } = useIntervalsIntegration();
  const { data: activitiesData } = useActivities(730);
  const { data: wellnessData } = useReadiness(730);
  const { data: planData } = useTrainingPlan();
  const workoutContext = searchParams.get("context");

  useEffect(() => {
    if (workoutContext && !message && messages.length === 0) {
      setMessage(`Tell me about this workout: ${decodeURIComponent(workoutContext)}`);
    }
  }, [workoutContext, message, messages.length]);

  const contextAwareOpener = useMemo(() => {
    if (workoutContext) {
      return `You're asking about this workout — ${decodeURIComponent(workoutContext)}. What would you like to know?`;
    }
    const activities = Array.isArray(activitiesData) ? activitiesData : [];
    const runs = activities.filter((a) => (a.distance_km ?? 0) > 0 && (a.type?.toLowerCase().includes("run") || !a.type));
    const lastRun = runs[runs.length - 1];
    const today = new Date();
    const yesterday = addDays(today, -1);
    if (lastRun?.date) {
      const d = new Date(lastRun.date);
      if (isToday(d) || (d.getTime() === yesterday.getTime())) {
        const when = isToday(d) ? "today" : "yesterday";
        const km = lastRun.distance_km ? `${Math.round(lastRun.distance_km * 10) / 10}km` : "a run";
        return `I see you ran ${km} ${when}. How did it feel?`;
      }
    }
    const weeks = planData?.weeks ?? [];
    const tomorrow = addDays(today, 1);
    const tomorrowStr = format(tomorrow, "yyyy-MM-dd");
    for (const w of weeks) {
      const sessions = w.sessions ?? [];
      for (const s of sessions) {
        const sd = s.scheduled_date ? String(s.scheduled_date).slice(0, 10) : "";
        if (sd === tomorrowStr) {
          return `You've got ${s.description ?? "a workout"} tomorrow. Ready for it?`;
        }
      }
    }
    const readiness = Array.isArray(wellnessData) ? wellnessData : [];
    const latest = readiness[readiness.length - 1];
    if (latest?.hrv != null && latest?.hrv_baseline != null && latest.hrv < latest.hrv_baseline * 0.9) {
      return `Your HRV has been a bit low lately. How are you feeling?`;
    }
    return `Here's your week. What's on your mind?`;
  }, [workoutContext, activitiesData, planData, wellnessData]);

  const showGeneratePlan = messages.some((m) => m.role === "assistant" && assistantSaysHasAllData(m.content));

  const intervalsContext = isConnected
    ? { wellness: Array.isArray(wellnessData) ? wellnessData : undefined, activities: Array.isArray(activitiesData) ? activitiesData : undefined }
    : null;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const rateLimitSecs = Math.max(0, Math.ceil((rateLimitUntil - Date.now()) / 1000));
  const [, setTick] = useState(0);
  useEffect(() => {
    if (rateLimitSecs <= 0) return;
    const t = setInterval(() => setTick((c) => c + 1), 1000);
    return () => clearInterval(t);
  }, [rateLimitUntil]);

  const send = useCallback(async (input: string) => {
    if (!input.trim() || isLoading) return;
    if (rateLimitUntil > Date.now()) {
      toast.error(`Please wait ${Math.ceil((rateLimitUntil - Date.now()) / 1000)}s (rate limit).`);
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? null;

    const userMsg: Msg = { role: "user", content: input.trim() };
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
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      await streamChat({
        messages: newMessages,
        intakeAnswers,
        intervalsContext,
        token,
        onDelta: upsert,
        onDone: () => setIsLoading(false),
        onRateLimit: () => setRateLimitUntil(Date.now() + 90000),
      });

      const finalContent = assistantSoFar;
      if (finalContent.includes('"create_plan"')) {
        const saved = await detectAndSavePlan(finalContent);
        if (saved) {
          toast.success("Plan saved! View it on the Training Plan page.", {
            action: { label: "View Plan", onClick: () => window.location.href = "/plan" },
          });
        }
      }
    } catch (e) {
      console.error("[Kipcoachee] fetch error", e);
      toast.error("Failed to reach Kipcoachee. Check console and ensure GROQ_API_KEY or GEMINI_API_KEY is set in Supabase.");
      setIsLoading(false);
    }
  }, [messages, isLoading, intakeAnswers, intervalsContext, rateLimitUntil]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(message);
    }
  };

  const handleStartFresh = () => {
    setMessages([]);
    toast.success("Started a fresh conversation.");
  };

  const handleOnboardingComplete = useCallback(
    (
      finalAnswers: Record<string, unknown>,
      planResult?: { plan_id: string },
      action?: "view_plan" | "chat"
    ) => {
      setOnboardingAnswers(finalAnswers);
      updateProfile({ onboarding_complete: true, onboarding_answers: finalAnswers });
      setOnboardingPhase("done");
      if (action === "view_plan" && planResult?.plan_id) {
        toast.success("Your plan is ready!");
        window.location.href = "/plan";
      } else {
        toast.success("Welcome! Chat with Kipcoachee whenever you're ready.");
      }
    },
    [updateProfile]
  );

  const handleGeneratePlan = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? null;
    if (!token) {
      toast.error("Sign in to generate a plan.");
      return;
    }
    setGeneratingPlan(true);
    try {
      const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(GENERATE_PLAN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apikey ? { apikey } : {}),
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          intakeAnswers: intakeAnswers ?? {},
          conversationContext: messages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to generate plan");
        return;
      }
      toast.success("Plan generated! Check Training Plan.");
      window.location.href = "/plan";
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate plan");
    } finally {
      setGeneratingPlan(false);
    }
  }, [intakeAnswers, messages]);

  const showOnboarding = !onboardingComplete && onboardingPhase !== "done";

  if (showOnboarding) {
    return (
      <OnboardingFlow
        answers={onboardingAnswers as import("@/hooks/useAthleteProfile").OnboardingAnswers}
        onAnswersChange={(a) => setOnboardingAnswers(a)}
        onStepComplete={() => {}}
        onComplete={handleOnboardingComplete}
      />
    );
  }

  return (
    <AppLayout>
      <div className="animate-fade-in flex flex-col h-[calc(100vh-6rem)]">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold text-foreground">Kipcoachee</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setImportSheetOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
              title="Import Garmin data"
            >
              <Upload className="h-3.5 w-3.5" />
              Import Garmin
            </button>
            {messages.length > 0 && (
              <button
                onClick={handleStartFresh}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Start fresh
              </button>
            )}
          </div>
        </div>

        <Sheet open={importSheetOpen} onOpenChange={setImportSheetOpen}>
          <SheetContent side="right" className="w-full max-w-lg overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Import Garmin Data</SheetTitle>
            </SheetHeader>
            <div className="mt-6">
              <GarminImportBlock />
            </div>
          </SheetContent>
        </Sheet>

        <div className="flex-1 glass-card rounded-2xl flex flex-col overflow-hidden">
          {/* Messages */}
          <div ref={scrollRef} className="flex-1 p-6 overflow-y-auto space-y-4">
            {messages.length === 0 && (
              <div className="flex gap-3 max-w-lg">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-semibold text-primary">K</span>
                </div>
                <div className="glass-card p-4 text-sm text-foreground leading-relaxed">
                  <ReactMarkdown components={markdownComponents}>{contextAwareOpener}</ReactMarkdown>
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""} max-w-2xl ${msg.role === "user" ? "ml-auto" : ""}`}>
                {msg.role === "assistant" && (
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-semibold text-primary">K</span>
                  </div>
                )}
                <div className={`p-4 text-sm leading-relaxed rounded-2xl ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "glass-card text-foreground"
                }`}>
                  {msg.role === "assistant" ? (
                    <div className="coach-message text-sm text-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                      {isNutritionMessage(msg.content) ? (
                        <NutritionCard content={msg.content} />
                      ) : (
                        <ReactMarkdown components={markdownComponents}>{msg.content}</ReactMarkdown>
                      )}
                    </div>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}

            {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex gap-3 max-w-lg">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-semibold text-primary">K</span>
                </div>
                <div className="glass-card p-4">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>

          {/* Quick chips */}
          {messages.length === 0 && (
            <div className="px-6 pb-2 flex flex-wrap gap-2">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => send(prompt)}
                  className="pill-button bg-secondary text-secondary-foreground text-xs hover:bg-primary/10 hover:text-primary"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          {showGeneratePlan && (
            <div className="px-6 py-3 border-t border-border bg-primary/5">
              <button
                onClick={handleGeneratePlan}
                disabled={generatingPlan}
                className="w-full rounded-full px-4 py-2.5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {generatingPlan ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating plan…
                  </>
                ) : (
                  "Generate plan"
                )}
              </button>
            </div>
          )}

          {/* Input */}
          <div className="p-4 border-t border-border">
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={rateLimitSecs > 0 ? `Wait ${rateLimitSecs}s (rate limit)` : "Tell Kipcoachee your story..."}
                disabled={isLoading || rateLimitSecs > 0}
                className="flex-1 bg-secondary rounded-full px-5 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
              />
              <button
                onClick={() => send(message)}
                disabled={isLoading || !message.trim() || rateLimitSecs > 0}
                className="w-10 h-10 rounded-full bg-primary flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-primary-foreground" />
                ) : (
                  <Send className="w-4 h-4 text-primary-foreground" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
