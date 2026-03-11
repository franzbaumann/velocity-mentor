import { AppLayout } from "@/components/AppLayout";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Send, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";
import { OnboardingFlow } from "@/components/OnboardingFlow";
import type { Components } from "react-markdown";
import { toast } from "sonner";
import { useIntervalsIntegration } from "@/hooks/useIntervalsIntegration";
import { useActivities } from "@/hooks/useActivities";
import { useReadiness } from "@/hooks/useReadiness";
import { useAthleteProfile } from "@/hooks/useAthleteProfile";
import { useTrainingPlan } from "@/hooks/use-training-plan";
import { useQueryClient } from "@tanstack/react-query";
import { format, addDays, isToday, startOfWeek } from "date-fns";
import { isRunningActivity } from "@/lib/analytics";
import { formatDistance } from "@/lib/format";

type Msg = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/coach-chat`;

const KIPCOACH_WELCOME = `Hey — I'm **Kipcoachee**, your AI running coach.

Before we build a plan, I need to understand you. Tell me your running history, goals, weekly volume, and what you’re training for — and I’ll create a personalized plan from that.

Make sure you’ve connected **intervals.icu** in Settings so I can see your real activities and wellness data.`;

const fmt = (d: Date) => format(d, "yyyy-MM-dd");
const now = new Date();

const markdownComponents: Components = {
  p: ({ children }) => <p className="mb-3 last:mb-0 text-foreground leading-relaxed">{children}</p>,
  h2: ({ children }) => <p className="mt-4 mb-1.5 text-sm font-semibold text-foreground first:mt-0">{children}</p>,
  h3: ({ children }) => <p className="mt-3 mb-1 text-sm font-semibold text-foreground first:mt-0">{children}</p>,
  ul: ({ children }) => <ul className="my-2 space-y-1 list-disc list-inside text-foreground pl-1 marker:text-primary/60">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 space-y-1 list-decimal list-inside text-foreground pl-1 marker:text-muted-foreground">{children}</ol>,
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

/** Strip JSON code blocks from display — user sees only the explanation */
function stripPlanJson(content: string): string {
  return content
    .replace(/```json\s*[\s\S]*?```/gi, "")
    .replace(/```\s*\{[\s\S]*?"action"\s*:\s*"(?:create_plan|adjust_plan)"[\s\S]*?\}\s*```?/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Extract plan JSON for Apply button */
function extractPlanJson(content: string): { action: string; plan: Record<string, unknown> } | null {
  const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) ?? content.match(/\{[\s\S]*?"action"\s*:\s*"(?:create_plan|adjust_plan)"[\s\S]*?\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[1] ?? jsonMatch[0]);
    if ((parsed?.action === "create_plan" || parsed?.action === "adjust_plan") && parsed?.plan) {
      return { action: parsed.action, plan: parsed.plan };
    }
  } catch {
    // ignore
  }
  return null;
}

function PlanAdjustmentCard({
  plan,
  onApply,
  onTweak,
  applying,
}: {
  plan: Record<string, unknown>;
  onApply: () => void;
  onTweak: () => void;
  applying: boolean;
}) {
  const name = String(plan.name ?? plan.plan_name ?? "Training Plan");
  const philosophy = String(plan.philosophy ?? "80/20").replace(/\|/g, " + ");
  const weeks = Array.isArray(plan.weeks) ? plan.weeks : [];
  const workoutCount = weeks.reduce((s: number, w: { workouts?: unknown[] }) => s + (w.workouts?.length ?? 0), 0);

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-4 mt-3">
      <div className="flex items-center gap-2 text-primary">
        <span className="text-lg">📋</span>
        <span className="text-sm font-semibold">Plan: {name}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {weeks.length} weeks · {workoutCount} sessions · {philosophy}
      </p>
      <div className="flex gap-2">
        <button
          onClick={onApply}
          disabled={applying}
          className="rounded-full px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {applying ? "Applying…" : "Apply to my plan"}
        </button>
        <button
          onClick={onTweak}
          disabled={applying}
          className="rounded-full px-4 py-2 text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80"
        >
          No, let&apos;s tweak
        </button>
      </div>
    </div>
  );
}

function buildQuickPrompts({
  from,
  hasPlan,
  isConnected,
  lastRun,
  hasUpcomingWorkout,
  upcomingDesc,
  hrvLow,
}: {
  from: string | null;
  hasPlan: boolean;
  isConnected: boolean;
  lastRun: { km: number; date: string; type: string } | null;
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
    if (lastRun) prompts.push(`How was my ${lastRun.km}km ${lastRun.type?.toLowerCase() || "run"}?`);
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

function getNextMonday(): Date {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

const INTENSE_TYPES = new Set(["interval", "intervals", "tempo", "long", "race"]);

async function savePlanFromChat(plan: Record<string, unknown>, isAdjustment: boolean, adjustmentReason?: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const aiWeeks = Array.isArray(plan.weeks) ? plan.weeks : [];

  if (isAdjustment) {
    return applyAdjustmentToExistingPlan(user.id, aiWeeks, plan, adjustmentReason);
  }

  const startDate = getNextMonday();
  const mergedWeeks = aiWeeks.map((wk: Record<string, unknown>) => ({
    week_number: (wk.week_number as number) ?? 1,
    phase: wk.phase as string | undefined,
    workouts: (wk.workouts as Record<string, unknown>[]) ?? [],
  }));

  const totalWeeks = (plan.total_weeks as number) ?? Math.max(...mergedWeeks.map((w) => w.week_number), 1);

  await supabase.from("training_plan").update({ is_active: false }).eq("user_id", user.id);

  const { data: planRow, error: planErr } = await supabase.from("training_plan").insert({
    user_id: user.id,
    plan_name: plan.plan_name ?? plan.name ?? "Training Plan",
    philosophy: String(plan.philosophy ?? "80_20").split("|")[0],
    goal_race: plan.goal_race ?? null,
    goal_date: plan.goal_date ?? null,
    goal_time: plan.goal_time ?? null,
    start_date: startDate.toISOString().slice(0, 10),
    end_date: (() => {
      const end = new Date(startDate);
      end.setDate(end.getDate() + totalWeeks * 7 - 1);
      return end.toISOString().slice(0, 10);
    })(),
    total_weeks: totalWeeks,
    peak_weekly_km: plan.peak_weekly_km ?? null,
    is_active: true,
  }).select("id").single();

  if (planErr || !planRow) return false;

  for (const wk of mergedWeeks) {
    const weekStart = new Date(startDate);
    weekStart.setDate(weekStart.getDate() + ((wk.week_number ?? 1) - 1) * 7);
    for (const w of wk.workouts) {
      const dow = (w.day_of_week as number) ?? 1;
      const workoutDate = new Date(weekStart);
      workoutDate.setDate(workoutDate.getDate() + (dow - 1));
      await supabase.from("training_plan_workout").insert({
        user_id: user.id,
        plan_id: planRow.id,
        date: workoutDate.toISOString().slice(0, 10),
        week_number: wk.week_number ?? 1,
        phase: wk.phase ?? "base",
        day_of_week: dow,
        type: (w.type as string) ?? "easy",
        name: (w.name as string) ?? (w.description as string) ?? "",
        description: (w.description as string) ?? "",
        key_focus: (w.key_focus as string | null) ?? null,
        distance_km: (w.distance_km as number | null) ?? null,
        duration_minutes: (w.duration_minutes as number | null) ?? null,
        target_pace: (w.target_pace as string | null) ?? null,
        target_hr_zone: (w.target_hr_zone as number | null) ?? null,
        tss_estimate: (w.tss_estimate as number | null) ?? null,
        completed: (w.completed as boolean) ?? false,
      });
    }
  }
  return true;
}

async function applyAdjustmentToExistingPlan(
  userId: string,
  aiWeeks: Record<string, unknown>[],
  _plan: Record<string, unknown>,
  adjustmentReason?: string,
): Promise<boolean> {
  const { data: currentPlan } = await supabase
    .from("training_plan")
    .select("id, start_date")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!currentPlan) return false;

  const planStart = currentPlan.start_date ? new Date(currentPlan.start_date) : getNextMonday();
  const planStartMon = new Date(planStart);
  planStartMon.setDate(planStartMon.getDate() - ((planStartMon.getDay() + 6) % 7));

  const adjustedDates: string[] = [];
  const newWorkouts: Array<{ date: string; week_number: number; phase: string; dow: number; w: Record<string, unknown> }> = [];

  for (const wk of aiWeeks) {
    const wn = (wk.week_number as number) ?? 1;
    const weekStart = new Date(planStartMon);
    weekStart.setDate(weekStart.getDate() + (wn - 1) * 7);
    const workouts = (wk.workouts as Record<string, unknown>[]) ?? [];

    for (const w of workouts) {
      const dow = (w.day_of_week as number) ?? 1;
      const workoutDate = new Date(weekStart);
      workoutDate.setDate(workoutDate.getDate() + (dow - 1));
      const dateStr = workoutDate.toISOString().slice(0, 10);
      adjustedDates.push(dateStr);
      newWorkouts.push({
        date: dateStr,
        week_number: wn,
        phase: (wk.phase as string) ?? "recovery",
        dow,
        w,
      });
    }
  }

  if (adjustedDates.length === 0) return false;

  adjustedDates.sort();
  const lastAdjustedDate = adjustedDates[adjustedDates.length - 1];

  for (const dateStr of adjustedDates) {
    await supabase
      .from("training_plan_workout")
      .delete()
      .eq("plan_id", currentPlan.id)
      .eq("date", dateStr);
  }

  for (const { date, week_number, phase, dow, w } of newWorkouts) {
    await supabase.from("training_plan_workout").insert({
      user_id: userId,
      plan_id: currentPlan.id,
      date,
      week_number,
      phase,
      day_of_week: dow,
      type: (w.type as string) ?? "easy",
      name: (w.name as string) ?? (w.description as string) ?? "",
      description: (w.description as string) ?? "",
      key_focus: (w.key_focus as string | null) ?? null,
      distance_km: (w.distance_km as number | null) ?? null,
      duration_minutes: (w.duration_minutes as number | null) ?? null,
      target_pace: (w.target_pace as string | null) ?? null,
      target_hr_zone: (w.target_hr_zone as number | null) ?? null,
      tss_estimate: (w.tss_estimate as number | null) ?? null,
      completed: false,
      notes: adjustmentReason ? `[Adjustment] ${adjustmentReason}` : null,
    });
  }

  const { data: nextWorkouts } = await supabase
    .from("training_plan_workout")
    .select("id, date, type, name, description, distance_km, duration_minutes")
    .eq("plan_id", currentPlan.id)
    .gt("date", lastAdjustedDate)
    .order("date", { ascending: true })
    .limit(3);

  if (nextWorkouts?.length) {
    const first = nextWorkouts[0];
    const firstType = (first.type ?? "easy").toLowerCase();

    if (INTENSE_TYPES.has(firstType)) {
      const origDesc = first.description || first.name || firstType;
      const bridgeNote = adjustmentReason
        ? `[Transition] After adjustment: ${adjustmentReason}. Originally: ${origDesc}.`
        : `[Transition] Originally: ${origDesc}. Easing back after plan adjustment.`;
      await supabase
        .from("training_plan_workout")
        .update({
          type: "easy",
          name: "Return-to-training easy run",
          description: `Easy bridge run — originally: ${origDesc}. Easing back before resuming full intensity.`,
          distance_km: Math.min(first.distance_km ?? 6, 6),
          duration_minutes: Math.min(first.duration_minutes ?? 35, 40),
          target_pace: null,
          target_hr_zone: 2,
          tss_estimate: null,
          notes: bridgeNote,
        })
        .eq("id", first.id);

      if (nextWorkouts.length >= 2) {
        const second = nextWorkouts[1];
        const secondType = (second.type ?? "easy").toLowerCase();
        if (INTENSE_TYPES.has(secondType)) {
          const origDesc2 = second.description || second.name || secondType;
          await supabase
            .from("training_plan_workout")
            .update({
              type: "easy",
              name: "Gradual return easy run",
              description: `Building back — originally: ${origDesc2}. Second session back, keeping it easy.`,
              distance_km: Math.min(second.distance_km ?? 7, 8),
              duration_minutes: Math.min(second.duration_minutes ?? 40, 45),
              target_pace: null,
              target_hr_zone: 2,
              tss_estimate: null,
              notes: bridgeNote,
            })
            .eq("id", second.id);
        }
      }
    }
  }

  return true;
}

export default function Coach() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [rateLimitUntil, setRateLimitUntil] = useState<number>(0);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [applyingPlan, setApplyingPlan] = useState(false);
  const [onboardingAnswers, setOnboardingAnswers] = useState<Record<string, unknown>>({});
  const [onboardingPhase, setOnboardingPhase] = useState<"active" | "done">("active");
  const [intakeAnswers] = useState<Record<string, string | string[]> | null>(() => {
    try { return JSON.parse(localStorage.getItem("paceiq_intake") || "null"); } catch { return null; }
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const queryClient = useQueryClient();
  const { onboardingComplete, update: updateProfile } = useAthleteProfile();
  const { plan: planData, isLoading: planLoading } = useTrainingPlan();

  useEffect(() => {
    if (searchParams.get("import") === "1") {
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const { isConnected } = useIntervalsIntegration();
  const { data: activitiesData } = useActivities(730);
  const { data: wellnessData } = useReadiness(730);
  const workoutContext = searchParams.get("context");
  const sessionParam = searchParams.get("session");
  const planMetaParam = searchParams.get("planMeta");

  const autoSentRef = useRef(false);
  const pendingAutoSend = useRef<string | null>(null);
  useEffect(() => {
    if (autoSentRef.current || messages.length > 0) return;
    if (sessionParam) {
      autoSentRef.current = true;
      let planMeta: { planName?: string; weekNumber?: number; sessionType?: string; adjustmentNotes?: string } | null = null;
      try { planMeta = planMetaParam ? JSON.parse(decodeURIComponent(planMetaParam)) : null; } catch { /* ignore */ }
      const prefix = planMeta
        ? `This is a ${planMeta.sessionType ?? ""} session from Week ${planMeta.weekNumber ?? "?"} of my plan "${planMeta.planName ?? ""}". `
        : "";
      const adjustCtx = planMeta?.adjustmentNotes
        ? ` Context for this session: ${planMeta.adjustmentNotes}.`
        : "";
      pendingAutoSend.current = `${prefix}Tell me about this workout: ${decodeURIComponent(sessionParam)} — why is it in my plan and what does it do for me?${adjustCtx}`;
    } else if (workoutContext && !message) {
      setMessage(`Tell me about this workout: ${decodeURIComponent(workoutContext)}`);
    }
  }, [sessionParam, planMetaParam, workoutContext, message, messages.length]);

  const contextAwareOpener = useMemo(() => {
    if (workoutContext) {
      return `Let's talk about: **${decodeURIComponent(workoutContext)}**`;
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

  const fromParam = searchParams.get("from");

  const quickPrompts = useMemo(() => {
    const activities = Array.isArray(activitiesData) ? activitiesData : [];
    const runs = activities.filter((a) => (a.distance_km ?? 0) > 0 && (a.type?.toLowerCase().includes("run") || !a.type));
    const lastRun = runs.length > 0 ? runs[runs.length - 1] : null;
    const lastRunInfo = lastRun ? { km: Math.round((lastRun.distance_km ?? 0) * 10) / 10, date: lastRun.date, type: lastRun.type ?? "Run" } : null;

    const hasPlan = (planData?.weeks?.length ?? 0) > 0;

    const readiness = Array.isArray(wellnessData) ? wellnessData : [];
    const latest = readiness[readiness.length - 1];
    const hrvLow = latest?.hrv != null && latest?.hrv_baseline != null && latest.hrv < latest.hrv_baseline * 0.9;

    const today = new Date();
    const todayStr = format(today, "yyyy-MM-dd");
    const tomorrowStr = format(addDays(today, 1), "yyyy-MM-dd");
    let upcomingDesc = "";
    let hasUpcomingWorkout = false;
    for (const w of planData?.weeks ?? []) {
      for (const s of w.sessions ?? []) {
        const sd = s.scheduled_date ? String(s.scheduled_date).slice(0, 10) : "";
        if (sd === todayStr || sd === tomorrowStr) {
          hasUpcomingWorkout = true;
          upcomingDesc = s.description ?? s.session_type ?? "my next session";
          break;
        }
      }
      if (hasUpcomingWorkout) break;
    }

    return buildQuickPrompts({ from: fromParam, hasPlan, isConnected, lastRun: lastRunInfo, hasUpcomingWorkout, upcomingDesc, hrvLow });
  }, [fromParam, activitiesData, planData, wellnessData, isConnected]);

  const showGeneratePlan = messages.some((m) => m.role === "assistant" && assistantSaysHasAllData(m.content));

  const intervalsContext = isConnected
    ? { wellness: Array.isArray(wellnessData) ? wellnessData : undefined, activities: Array.isArray(activitiesData) ? activitiesData : undefined }
    : null;

  const weekDays = useMemo(() => {
    const mon = startOfWeek(new Date(), { weekStartsOn: 1 });
    const monStr = format(mon, "yyyy-MM-dd");
    const sunStr = format(addDays(mon, 6), "yyyy-MM-dd");
    const activities = Array.isArray(activitiesData) ? activitiesData : [];

    const planByDate = new Map<string, { type: string; description: string; distance_km?: number; pace_target?: string }>();
    for (const week of (planData?.weeks ?? []) as { sessions?: { scheduled_date?: string; session_type?: string; description?: string; distance_km?: number; pace_target?: string }[] }[]) {
      for (const s of week.sessions ?? []) {
        const d = s.scheduled_date ? String(s.scheduled_date).slice(0, 10) : null;
        if (d && d >= monStr && d <= sunStr && !planByDate.has(d)) {
          planByDate.set(d, {
            type: (s.session_type ?? "easy").toLowerCase(),
            description: s.description ?? "",
            distance_km: s.distance_km,
            pace_target: s.pace_target,
          });
        }
      }
    }

    return [0, 1, 2, 3, 4, 5, 6].map((i) => {
      const d = addDays(mon, i);
      const dateStr = format(d, "yyyy-MM-dd");
      const act = activities.find((a) => isRunningActivity(a.type) && a.date === dateStr && (a.distance_km ?? 0) >= 0.01);
      const planned = planByDate.get(dateStr);
      const today = isToday(d);
      const done = !!act;

      const type = (act ? (act.type ?? "run").toLowerCase() : planned?.type ?? "rest") as "easy" | "tempo" | "interval" | "long" | "recovery" | "rest";
      const title = act
        ? `${act.type ?? "Run"} ${formatDistance(act.distance_km ?? 0)} km`
        : planned
          ? (planned.description?.trim() || (planned.distance_km ? `Run ${formatDistance(planned.distance_km)} km` : planned.type || "Run"))
          : "Rest";
      const distance = act ? Math.round((act.distance_km ?? 0) * 10) / 10 : (planned?.distance_km ?? 0);

      return { day: format(d, "EEE"), date: format(d, "d"), type, title, distance, today, done };
    });
  }, [activitiesData, planData]);

  const hasWeekPlan = weekDays.some((d) => d.type !== "rest");

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

      // Plan JSON is shown in PlanAdjustmentCard — user clicks Apply to save
    } catch (e) {
      console.error("[Kipcoachee] fetch error", e);
      toast.error("Failed to reach Kipcoachee. Check console and ensure GROQ_API_KEY or GEMINI_API_KEY is set in Supabase.");
      setIsLoading(false);
    }
  }, [messages, isLoading, intakeAnswers, intervalsContext, rateLimitUntil]);

  useEffect(() => {
    if (pendingAutoSend.current && !isLoading) {
      const msg = pendingAutoSend.current;
      pendingAutoSend.current = null;
      send(msg);
    }
  }, [send, isLoading]);

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

  const handleApplyPlan = useCallback(
    async (plan: Record<string, unknown>, isAdjustment: boolean) => {
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
          toast.success("Plan updated! View it on the Training Plan page.", {
            action: { label: "View Plan", onClick: () => window.location.href = "/plan" },
          });
        } else {
          toast.error("Failed to save plan");
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save plan");
      } finally {
        setApplyingPlan(false);
      }
    },
    [queryClient]
  );

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

  const hasPlan = !!planData?.plan;
  const showOnboarding =
    !planLoading &&
    !hasPlan &&
    !onboardingComplete &&
    onboardingPhase !== "done";

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

        {hasWeekPlan && (
          <div className="grid grid-cols-7 gap-1.5 mb-3">
            {weekDays.map((d) => {
              const pillColor: Record<string, string> = {
                easy: "bg-accent text-accent-foreground",
                tempo: "bg-primary text-primary-foreground",
                interval: "bg-destructive text-destructive-foreground",
                intervals: "bg-destructive text-destructive-foreground",
                long: "bg-warning text-warning-foreground",
                recovery: "bg-muted text-muted-foreground",
                rest: "",
                strides: "bg-accent text-accent-foreground",
              };
              const pill = pillColor[d.type] ?? "";
              const hasSession = d.type !== "rest";

              return (
                <div
                  key={d.day}
                  className={`rounded-xl border border-border p-2 min-h-[72px] ${
                    d.today ? "bg-primary/5 border-primary/30" : "bg-card"
                  }`}
                >
                  <p className={`text-[11px] font-medium mb-1 ${d.today ? "text-primary font-bold" : "text-muted-foreground"}`}>
                    {d.today ? "Today" : d.day} <span className="font-normal">{d.date}</span>
                  </p>
                  {hasSession ? (
                    <button
                      onClick={() => send(`Tell me about ${d.today ? "today's" : d.day + "'s"} session: ${d.title}`)}
                      className={`w-full text-left text-[11px] px-2 py-1 rounded-lg truncate ${pill} ${d.done ? "ring-2 ring-emerald-400" : ""} hover:opacity-80 transition-opacity`}
                    >
                      {d.done && <span className="inline-block mr-0.5">✓</span>}
                      {d.title}
                    </button>
                  ) : (
                    <p className="text-[10px] text-muted-foreground/50 mt-1">Rest</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

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

            {messages.map((msg, i) => {
              const displayContent = msg.role === "assistant" ? stripPlanJson(msg.content) : msg.content;
              const extractedPlan = msg.role === "assistant" ? extractPlanJson(msg.content) : null;
              return (
                <div key={i} className={`flex flex-col gap-2 ${msg.role === "user" ? "items-end" : ""} max-w-2xl ${msg.role === "user" ? "ml-auto" : ""}`}>
                  <div className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""} w-full`}>
                    {msg.role === "assistant" && (
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-semibold text-primary">K</span>
                      </div>
                    )}
                    <div className={`p-4 text-sm leading-relaxed rounded-2xl flex-1 ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "glass-card text-foreground"
                    }`}>
                      {msg.role === "assistant" ? (
                        <div className="coach-message text-sm text-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                          {isNutritionMessage(msg.content) ? (
                            <NutritionCard content={msg.content} />
                          ) : (
                            <ReactMarkdown components={markdownComponents}>
                              {displayContent || (extractedPlan ? "Here are the suggested changes:" : "Thinking…")}
                            </ReactMarkdown>
                          )}
                        </div>
                      ) : (
                        msg.content
                      )}
                    </div>
                  </div>
                  {msg.role === "assistant" && extractedPlan && (
                    <div className="ml-11">
                      <PlanAdjustmentCard
                        plan={extractedPlan.plan}
                        onApply={() => handleApplyPlan(extractedPlan.plan, extractedPlan.action === "adjust_plan")}
                        onTweak={() => {
                          setMessage("I'd like to make some changes to the plan");
                          setTimeout(() => inputRef.current?.focus(), 100);
                        }}
                        applying={applyingPlan}
                      />
                    </div>
                  )}
                </div>
              );
            })}

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
                ref={inputRef}
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
