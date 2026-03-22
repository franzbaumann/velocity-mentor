import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { DateWheelPicker } from "@/components/ui/date-wheel-picker";
import { TimeWheelPicker } from "@/components/ui/time-wheel-picker";
import { parseGoalTimeToSeconds, formatSecondsToGoalTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { OnboardingAnswers } from "@/hooks/useAthleteProfile";
import { useIntervalsIntegration } from "@/hooks/useIntervalsIntegration";
import { useMergedActivities } from "@/hooks/useMergedIntervalsData";
import { useMergedReadiness } from "@/hooks/useMergedIntervalsData";
import { format, parseISO, startOfWeek, addDays, isValid } from "date-fns";
import { enrichTrainingPlanWorkoutsFromLibrary } from "@/lib/training/enrichPlanSessions";
import {
  AUTH_SESSION_EXPIRED_USER_MESSAGE,
  AuthTokenError,
  getSafeAccessToken,
} from "@/lib/supabase-auth-safe";
import { getSupabaseUrl } from "@/lib/supabase-url";

const TOTAL_STEPS = 9;
const GOALS_SKIP_RACE = ["aerobic_base", "return_injury", "stay_consistent"];

const MAIN_GOALS = [
  { id: "faster_race", label: "Run a faster race", emoji: "🏅" },
  { id: "first_marathon", label: "Finish my first marathon", emoji: "🏃" },
  { id: "aerobic_base", label: "Build my aerobic base", emoji: "📈" },
  { id: "return_injury", label: "Return from injury", emoji: "🦵" },
  { id: "shorter_faster", label: "Get faster at shorter distances", emoji: "⚡" },
  { id: "stay_consistent", label: "Stay consistent", emoji: "🔄" },
] as const;

const DISTANCES = ["5K", "10K", "Half Marathon", "Marathon", "Ultra"] as const;

const RECENT_RACES = [
  { id: "none", label: "No recent races" },
  { id: "5k", label: "5K result" },
  { id: "10k", label: "10K result" },
  { id: "half", label: "Half result" },
  { id: "marathon", label: "Marathon result" },
] as const;

const LONGEST_DAY_OPTIONS = [
  { id: "45", label: "45 min" },
  { id: "60", label: "1 hour" },
  { id: "90", label: "1.5 hours" },
  { id: "120", label: "2+ hours" },
] as const;

const INJURIES = [
  { id: "achilles", label: "Achilles tendon" },
  { id: "shin", label: "Shin splints" },
  { id: "knee", label: "Runner's knee" },
  { id: "hip", label: "Hip flexor" },
  { id: "plantar", label: "Plantar fasciitis" },
  { id: "it_band", label: "IT band" },
  { id: "stress_fracture", label: "Stress fracture history" },
  { id: "back", label: "Back pain" },
  { id: "none", label: "Nothing currently" },
] as const;

const TRAINING_HISTORY = [
  { id: "beginner", label: "Just getting started", sub: "Running less than a year", emoji: "🌱" },
  { id: "building", label: "Building runner", sub: "1-3 years, getting serious", emoji: "📈" },
  { id: "experienced", label: "Experienced runner", sub: "3-5 years, done races", emoji: "🏃" },
  { id: "competitive", label: "Competitive runner", sub: "5+ years, racing regularly", emoji: "🏆" },
] as const;

const PHILOSOPHY_NAMES: Record<string, { name: string; founder: string }> = {
  "80_20_polarized": { name: "80/20 Polarized", founder: "Stephen Seiler" },
  jack_daniels: { name: "Jack Daniels VDOT", founder: "Jack Daniels" },
  lydiard: { name: "Lydiard", founder: "Arthur Lydiard" },
  hansons: { name: "Hansons", founder: "Hansons-Brooks" },
  pfitzinger: { name: "Pfitzinger", founder: "Pete Pfitzinger" },
  kenyan_model: { name: "Kenyan Model", founder: "East African tradition" },
};

export interface PhilosophyResult {
  primary: { philosophy: string; reason: string; confidence: number };
  alternatives: Array<{ philosophy: string; reason: string }>;
}

export interface PlanResult {
  plan_id: string;
  plan_name: string;
  philosophy: string;
  total_weeks: number;
  peak_weekly_km: number | null;
  start_date: string;
  first_workout: { name: string; date: string } | null;
}

interface OnboardingFlowProps {
  answers: OnboardingAnswers;
  onAnswersChange: (a: OnboardingAnswers) => void;
  onStepComplete: (step: number) => void;
  onComplete: (finalAnswers: OnboardingAnswers, planResult?: PlanResult, action?: "view_plan" | "chat") => void;
}

function ProgressDots({ current }: { current: number }) {
  return (
    <div className="flex justify-center gap-2 py-4">
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-2 w-2 rounded-full transition-colors",
            i < current ? "bg-primary" : "bg-muted"
          )}
        />
      ))}
    </div>
  );
}

export function OnboardingFlow({
  answers,
  onAnswersChange,
  onStepComplete,
  onComplete,
}: OnboardingFlowProps) {
  const [step, setStep] = useState(1);
  const [expandedTellMore, setExpandedTellMore] = useState<string | null>(null);
  const [manualFitness, setManualFitness] = useState(false);
  const [philosophyResult, setPhilosophyResult] = useState<PhilosophyResult | null>(null);
  const [philosophyLoading, setPhilosophyLoading] = useState(false);
  const [philosophyError, setPhilosophyError] = useState<string | null>(null);
  const [planResult, setPlanResult] = useState<PlanResult | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [philosophyForPlan, setPhilosophyForPlan] = useState<string | null>(null);
  const [planRetryCount, setPlanRetryCount] = useState(0);

  const { isConnected } = useIntervalsIntegration();
  const { data: activities = [] } = useMergedActivities(30);
  const { data: readinessRows = [] } = useMergedReadiness(30);

  const hasIntervalsData = isConnected && (activities.length > 0 || readinessRows.length > 0);
  const latestReadiness = readinessRows.length > 0 ? readinessRows[readinessRows.length - 1] : null;
  const ctl = latestReadiness?.icu_ctl ?? latestReadiness?.ctl ?? null;
  const mon = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekKm = activities
    .filter((a) => {
      const d = a.date;
      return d >= format(mon, "yyyy-MM-dd") && d <= format(addDays(mon, 6), "yyyy-MM-dd");
    })
    .reduce((s, a) => s + (a.distance_km ?? 0), 0);
  const bestPace = activities
    .filter((a) => a.avg_pace && (a.distance_km ?? 0) >= 3)
    .sort((a, b) => {
      const pa = parsePace(a.avg_pace!);
      const pb = parsePace(b.avg_pace!);
      return pa - pb;
    })[0]?.avg_pace ?? null;

  function parsePace(p: string): number {
    const m = p.match(/(\d+):(\d+)/);
    if (!m) return 999;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  }

  const skipRaceStep = answers.mainGoal && GOALS_SKIP_RACE.includes(answers.mainGoal);

  useEffect(() => {
    if (step !== 8) return;
    let cancelled = false;
    setPhilosophyLoading(true);
    setPhilosophyError(null);
    const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
    const url = `${getSupabaseUrl()}/functions/v1/paceiq-philosophy`;

    (async () => {
      try {
        const accessToken = await getSafeAccessToken();
        if (cancelled) return;
        const r = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apikey ? { apikey } : {}),
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ answers }),
        });
        const data = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok) {
          setPhilosophyError((data as { error?: string }).error ?? `Request failed (${r.status})`);
          setPhilosophyResult(null);
        } else if ((data as { error?: string }).error || !(data as { primary?: unknown }).primary) {
          setPhilosophyError((data as { error?: string }).error ?? "Invalid response from server");
          setPhilosophyResult(null);
        } else {
          setPhilosophyResult(data);
        }
      } catch (e) {
        if (cancelled) return;
        setPhilosophyError(e instanceof AuthTokenError ? e.message : (e instanceof Error ? e.message : "Failed to fetch"));
        setPhilosophyResult(null);
      } finally {
        if (!cancelled) setPhilosophyLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    if (step !== 9 || !philosophyForPlan) return;
    let cancelled = false;
    setPlanLoading(true);
    setPlanError(null);
    const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
    const url = `${getSupabaseUrl()}/functions/v1/paceiq-generate-plan`;

    (async () => {
      try {
        const accessToken = await getSafeAccessToken();
        if (cancelled) return;
        const r = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apikey ? { apikey } : {}),
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            answers,
            philosophy: philosophyForPlan,
          }),
        });
        const data = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok) {
          const apiErr = (data as { error?: string }).error ?? "";
          if (r.status === 401 || /unauthorized/i.test(apiErr)) {
            setPlanError(AUTH_SESSION_EXPIRED_USER_MESSAGE);
          } else {
            setPlanError(apiErr || `Request failed (${r.status})`);
          }
          setPlanResult(null);
        } else if ((data as { error?: string }).error) {
          const apiErr = (data as { error: string }).error;
          setPlanError(/unauthorized/i.test(apiErr) ? AUTH_SESSION_EXPIRED_USER_MESSAGE : apiErr);
          setPlanResult(null);
        } else {
          setPlanResult(data);
          const pid = (data as { plan_id?: string }).plan_id;
          if (pid) {
            enrichTrainingPlanWorkoutsFromLibrary(pid).catch((e) =>
              console.warn("[OnboardingFlow] enrichPlanSessions:", e)
            );
          }
        }
      } catch (e) {
        if (cancelled) return;
        if (e instanceof AuthTokenError) {
          setPlanError(e.message);
        } else {
          setPlanError(e instanceof Error ? e.message : "Failed to generate plan");
        }
        setPlanResult(null);
      } finally {
        if (!cancelled) setPlanLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, philosophyForPlan, planRetryCount]);

  const goNext = () => {
    if (step === 1) {
      onStepComplete(1);
      setStep(2);
    } else if (step === 2) {
      onStepComplete(2);
      if (skipRaceStep) {
        setStep(4);
      } else {
        setStep(3);
      }
    } else if (step === 3) {
      onStepComplete(3);
      setStep(4);
    } else if (step === 4) {
      onStepComplete(4);
      setStep(5);
    } else if (step === 5) {
      onStepComplete(5);
      setStep(6);
    } else if (step === 6) {
      onStepComplete(6);
      setStep(7);
    } else if (step === 7) {
      onStepComplete(7);
      setStep(8);
    }
  };

  const buildPlanWithPhilosophy = (philosophy: string) => {
    onAnswersChange({ ...answers, selectedPhilosophy: philosophy });
    setPhilosophyForPlan(philosophy);
    setStep(9);
  };

  const canProceedStep2 = !!answers.mainGoal;
  const canProceedStep3 =
    !!(answers.raceDate || answers.goalTime || answers.goalDistance) || skipRaceStep;
  const canProceedStep4 =
    hasIntervalsData && !manualFitness
      ? true
      : true; // Manual: slider has default 30, or they selected a recent race
  const canProceedStep5 = answers.daysPerWeek != null;
  const injuries = answers.injuries ?? [];
  const hasOnlyNothing = injuries.length === 1 && injuries[0] === "none";
  const hasInjuries = injuries.some((i) => i !== "none");
  const canProceedStep6 =
    hasOnlyNothing || (hasInjuries && !!answers.injuryDetails?.trim());
  const canProceedStep7 = !!answers.trainingHistory;

  let canProceed = false;
  if (step === 1) canProceed = true;
  else if (step === 2) canProceed = canProceedStep2;
  else if (step === 3) canProceed = canProceedStep3;
  else if (step === 4) canProceed = canProceedStep4;
  else if (step === 5) canProceed = canProceedStep5;
  else if (step === 6) canProceed = canProceedStep6;
  else if (step === 7) canProceed = canProceedStep7;

  // Step 1 — Welcome
  if (step === 1) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background">
        <ProgressDots current={1} />
        <div className="text-center max-w-md">
          <h1 className="text-4xl font-bold text-foreground mb-3">Hey, I'm Coach Cade.</h1>
          <p className="text-lg text-muted-foreground mb-8">Your AI running coach. Let's build something together.</p>
          {hasIntervalsData && (
            <p className="text-sm text-muted-foreground mb-6">
              I've already pulled in your training data — this will be quick.
            </p>
          )}
          <Button size="lg" onClick={goNext} className="rounded-full px-8">
            Let's go →
          </Button>
        </div>
      </div>
    );
  }

  // Step 2 — Main Goal
  if (step === 2) {
    return (
      <div className="min-h-screen flex flex-col px-6 py-8 bg-background">
        <ProgressDots current={2} />
        <div className="max-w-lg mx-auto flex-1 flex flex-col">
          <p className="text-lg text-foreground mb-6">
            What's the main thing you want to achieve?
          </p>
          <div className="grid grid-cols-2 gap-3 mb-6">
            {MAIN_GOALS.map((g) => (
              <button
                key={g.id}
                onClick={() => onAnswersChange({ ...answers, mainGoal: g.id })}
                className={cn(
                  "p-4 rounded-2xl border-2 text-left transition-all",
                  answers.mainGoal === g.id
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50 bg-card"
                )}
              >
                <span className="text-2xl block mb-1">{g.emoji}</span>
                <span className="text-sm font-medium text-foreground">{g.label}</span>
              </button>
            ))}
          </div>
          {answers.mainGoal && (
            <>
              <button
                onClick={() => setExpandedTellMore(expandedTellMore === "goal" ? null : "goal")}
                className="text-sm text-primary hover:underline flex items-center gap-1 mb-3"
              >
                {expandedTellMore === "goal" ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                Tell me more about your goal...
              </button>
              {expandedTellMore === "goal" && (
                <Textarea
                  placeholder="E.g. I want to break 3 hours at Stockholm marathon in June..."
                  value={answers.goalMore ?? ""}
                  onChange={(e) => onAnswersChange({ ...answers, goalMore: e.target.value })}
                  className="mb-6 min-h-[80px]"
                />
              )}
            </>
          )}
          <Button
            className="mt-auto rounded-full"
            onClick={goNext}
            disabled={!canProceed}
          >
            Continue →
          </Button>
        </div>
      </div>
    );
  }

  // Step 3 — Race / Target (conditional)
  if (step === 3) {
    const suggestedGoalTime = (() => {
      if (!bestPace || !answers.goalDistance) return null;
      const paceSecPerKm = parsePace(bestPace);
      if (paceSecPerKm <= 0 || paceSecPerKm >= 999) return null;
      const dist = String(answers.goalDistance).toLowerCase();
      let factor = 1.15;
      if (dist.includes("marathon")) factor = 1.2;
      else if (dist.includes("half")) factor = 1.08;
      else if (dist.includes("10")) factor = 1.05;
      else if (dist.includes("5")) factor = 1.02;
      const estPaceSecPerKm = paceSecPerKm * factor;
      const distKm = dist.includes("marathon") ? 42.195 : dist.includes("half") ? 21.1 : dist.includes("10") ? 10 : 5;
      const totalSec = distKm * estPaceSecPerKm;
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = Math.round(totalSec % 60);
      return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    })();

    return (
      <div className="min-h-screen flex flex-col px-6 py-8 bg-background">
        <ProgressDots current={3} />
        <div className="max-w-lg mx-auto flex-1 flex flex-col">
          <p className="text-lg text-foreground mb-6">Which race are you targeting?</p>
          {suggestedGoalTime && (
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 mb-4">
              <p className="text-xs font-medium text-primary mb-1">Suggested goal (from your recent pace)</p>
              <p className="text-sm text-foreground">Based on {bestPace}/km recent effort → ~{suggestedGoalTime} for {answers.goalDistance}</p>
              <button
                type="button"
                onClick={() => onAnswersChange({ ...answers, goalTime: suggestedGoalTime })}
                className="text-xs text-primary hover:underline mt-1"
              >
                Use this as my goal
              </button>
            </div>
          )}
          <div className="flex gap-4 mb-4">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground block mb-1">Race date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    {answers.raceDate ? format(parseISO(answers.raceDate), "MMM d, yyyy") : "Pick date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <DateWheelPicker
                    value={answers.raceDate ? parseISO(answers.raceDate) : new Date()}
                    onChange={(d) => onAnswersChange({ ...answers, raceDate: format(d, "yyyy-MM-dd") })}
                    size="sm"
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground block mb-1">Goal time (e.g. 3:30:00)</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start font-normal tabular-nums">
                    {answers.goalTime || "Pick time"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <TimeWheelPicker
                    value={parseGoalTimeToSeconds(answers.goalTime)}
                    onChange={(sec) => onAnswersChange({ ...answers, goalTime: formatSecondsToGoalTime(sec) })}
                    size="sm"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            {DISTANCES.map((d) => (
              <button
                key={d}
                onClick={() => onAnswersChange({ ...answers, goalDistance: d })}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium transition-colors",
                  answers.goalDistance === d ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
                )}
              >
                {d}
              </button>
            ))}
          </div>
          <button
            onClick={() => setExpandedTellMore(expandedTellMore === "race" ? null : "race")}
            className="text-sm text-primary hover:underline flex items-center gap-1 mb-6"
          >
            {expandedTellMore === "race" ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            Tell me more...
          </button>
          {expandedTellMore === "race" && (
            <Textarea
              placeholder="Any context about this race — why it matters to you, previous attempts etc"
              value={answers.raceMore ?? ""}
              onChange={(e) => onAnswersChange({ ...answers, raceMore: e.target.value })}
              className="mb-6 min-h-[80px]"
            />
          )}
          <Button
            className="mt-auto rounded-full"
            onClick={goNext}
            disabled={!canProceed}
          >
            Continue →
          </Button>
        </div>
      </div>
    );
  }

  // Step 4 — Current Fitness
  if (step === 4) {
    if (hasIntervalsData && !manualFitness) {
      return (
        <div className="min-h-screen flex flex-col px-6 py-8 bg-background">
          <ProgressDots current={4} />
          <div className="max-w-lg mx-auto flex-1 flex flex-col">
            <div className="rounded-2xl border border-border bg-card p-6 mb-6">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 mb-3">
                <span className="text-lg">✓</span>
                <span className="font-semibold">I found your data</span>
              </div>
              <div className="text-sm text-foreground space-y-1">
                {ctl != null && <p>CTL (fitness): {Math.round(ctl)}</p>}
                <p>Weekly avg: {Math.round(weekKm)}km</p>
                {bestPace && <p>Best recent effort: {bestPace}</p>}
              </div>
              <p className="text-sm text-muted-foreground mt-3">Looks good — I'll use this directly.</p>
              <button
                onClick={() => setManualFitness(true)}
                className="text-sm text-primary hover:underline mt-2"
              >
                Looks wrong?
              </button>
            </div>
            <Button className="mt-auto rounded-full" onClick={goNext}>
              Continue →
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex flex-col px-6 py-8 bg-background">
        <ProgressDots current={4} />
        <div className="max-w-lg mx-auto flex-1 flex flex-col">
          <p className="text-lg text-foreground mb-6">How much are you running right now?</p>
          <div className="mb-6">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">0 km</span>
              <span className="font-semibold text-foreground">{answers.fitnessKm ?? 30} km/week</span>
              <span className="text-muted-foreground">150 km</span>
            </div>
            <Slider
              value={[answers.fitnessKm ?? 30]}
              onValueChange={([v]) => onAnswersChange({ ...answers, fitnessKm: v })}
              max={150}
              step={5}
            />
          </div>
          <p className="text-sm text-muted-foreground mb-2">Recent race result?</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {RECENT_RACES.map((r) => (
              <button
                key={r.id}
                onClick={() =>
                  onAnswersChange({
                    ...answers,
                    recentRaceType: r.id,
                    recentRaceTime: r.id === "none" ? undefined : answers.recentRaceTime,
                  })
                }
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium transition-colors",
                  answers.recentRaceType === r.id ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          {answers.recentRaceType && answers.recentRaceType !== "none" && (
            <Input
              placeholder="What was your time?"
              value={answers.recentRaceTime ?? ""}
              onChange={(e) => onAnswersChange({ ...answers, recentRaceTime: e.target.value })}
              className="mb-4"
            />
          )}
          <button
            onClick={() => setExpandedTellMore(expandedTellMore === "fitness" ? null : "fitness")}
            className="text-sm text-primary hover:underline flex items-center gap-1 mb-6"
          >
            {expandedTellMore === "fitness" ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            Tell me more...
          </button>
          {expandedTellMore === "fitness" && (
            <Textarea
              placeholder="Tell me about your current fitness — how your easy runs feel, what pace you train at etc"
              value={answers.fitnessMore ?? ""}
              onChange={(e) => onAnswersChange({ ...answers, fitnessMore: e.target.value })}
              className="mb-6 min-h-[80px]"
            />
          )}
          <Button
            className="mt-auto rounded-full"
            onClick={goNext}
            disabled={!canProceed}
          >
            Continue →
          </Button>
        </div>
      </div>
    );
  }

  // Step 5 — Availability
  if (step === 5) {
    return (
      <div className="min-h-screen flex flex-col px-6 py-8 bg-background">
        <ProgressDots current={5} />
        <div className="max-w-lg mx-auto flex-1 flex flex-col">
          <p className="text-lg text-foreground mb-6">
            How many days a week can you realistically train?
          </p>
          <div className="flex gap-3 mb-6">
            {[3, 4, 5, 6, 7].map((n) => (
              <button
                key={n}
                onClick={() => onAnswersChange({ ...answers, daysPerWeek: n })}
                className={cn(
                  "flex-1 py-4 rounded-2xl text-xl font-bold transition-all",
                  answers.daysPerWeek === n
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground mb-2">How long is your longest available day?</p>
          <div className="flex flex-wrap gap-2 mb-6">
            {LONGEST_DAY_OPTIONS.map((o) => (
              <button
                key={o.id}
                onClick={() => onAnswersChange({ ...answers, longestDay: o.id })}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium transition-colors",
                  answers.longestDay === o.id ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setExpandedTellMore(expandedTellMore === "availability" ? null : "availability")}
            className="text-sm text-primary hover:underline flex items-center gap-1 mb-6"
          >
            {expandedTellMore === "availability" ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            Tell me more...
          </button>
          {expandedTellMore === "availability" && (
            <Textarea
              placeholder="Any constraints I should know about — work schedule, family, travel etc"
              value={answers.availabilityMore ?? ""}
              onChange={(e) => onAnswersChange({ ...answers, availabilityMore: e.target.value })}
              className="mb-6 min-h-[80px]"
            />
          )}
          <Button className="mt-auto rounded-full" onClick={goNext} disabled={!canProceed}>
            Continue →
          </Button>
        </div>
      </div>
    );
  }

  // Step 6 — Injuries
  if (step === 6) {
    const toggleInjury = (id: string) => {
      const current = answers.injuries ?? [];
      if (id === "none") {
        onAnswersChange({ ...answers, injuries: ["none"], injuryDetails: undefined });
        return;
      }
      const withoutNone = current.filter((i) => i !== "none");
      const has = withoutNone.includes(id);
      const next = has ? withoutNone.filter((i) => i !== id) : [...withoutNone, id];
      onAnswersChange({
        ...answers,
        injuries: next.length === 0 ? ["none"] : next,
        injuryDetails: next.length > 0 ? (answers.injuryDetails ?? "") : undefined,
      });
    };
    const selectedInjuries = answers.injuries ?? [];
    const hasInjurySelected = selectedInjuries.some((i) => i !== "none");

    return (
      <div className="min-h-screen flex flex-col px-6 py-8 bg-background">
        <ProgressDots current={6} />
        <div className="max-w-lg mx-auto flex-1 flex flex-col">
          <p className="text-lg text-foreground mb-6">
            Any injuries or niggles I should know about?
          </p>
          <div className="grid grid-cols-2 gap-2 mb-6">
            {INJURIES.map((i) => (
              <button
                key={i.id}
                onClick={() => toggleInjury(i.id)}
                className={cn(
                  "p-3 rounded-xl border-2 text-left text-sm font-medium transition-all",
                  selectedInjuries.includes(i.id)
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50 bg-card"
                )}
              >
                {i.label}
              </button>
            ))}
          </div>
          {hasInjurySelected && (
            <div className="mb-6">
              <label className="text-sm font-medium text-foreground block mb-2">
                Tell me about this — when did it start, how bad is it, what have you tried?
              </label>
              <Textarea
                placeholder="E.g. Left achilles, started 6 months ago after increasing mileage too fast. Worse in the morning, physio helped for a while but came back..."
                value={answers.injuryDetails ?? ""}
                onChange={(e) => onAnswersChange({ ...answers, injuryDetails: e.target.value })}
                className="min-h-[100px]"
              />
            </div>
          )}
          <Button className="mt-auto rounded-full" onClick={goNext} disabled={!canProceed}>
            Continue →
          </Button>
        </div>
      </div>
    );
  }

  // Step 7 — Training History
  if (step === 7) {
    return (
      <div className="min-h-screen flex flex-col px-6 py-8 bg-background">
        <ProgressDots current={7} />
        <div className="max-w-lg mx-auto flex-1 flex flex-col">
          <p className="text-lg text-foreground mb-6">
            How experienced are you as a runner?
          </p>
          <div className="space-y-3 mb-6">
            {TRAINING_HISTORY.map((h) => (
              <button
                key={h.id}
                onClick={() => onAnswersChange({ ...answers, trainingHistory: h.id })}
                className={cn(
                  "w-full p-4 rounded-2xl border-2 text-left transition-all flex items-start gap-3",
                  answers.trainingHistory === h.id
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50 bg-card"
                )}
              >
                <span className="text-2xl">{h.emoji}</span>
                <div>
                  <p className="font-semibold text-foreground">{h.label}</p>
                  <p className="text-sm text-muted-foreground">{h.sub}</p>
                </div>
              </button>
            ))}
          </div>
          {answers.trainingHistory && (
            <>
              <button
                onClick={() => setExpandedTellMore(expandedTellMore === "history" ? null : "history")}
                className="text-sm text-primary hover:underline flex items-center gap-1 mb-3"
              >
                {expandedTellMore === "history" ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                Tell me more...
              </button>
              {expandedTellMore === "history" && (
                <Textarea
                  placeholder="E.g. I respond well to high volume but always get injured when I add too much speed too fast..."
                  value={answers.historyMore ?? ""}
                  onChange={(e) => onAnswersChange({ ...answers, historyMore: e.target.value })}
                  className="mb-6 min-h-[80px]"
                />
              )}
            </>
          )}
          <Button className="mt-auto rounded-full" onClick={goNext} disabled={!canProceed}>
            Continue →
          </Button>
        </div>
      </div>
    );
  }

  // Step 8 — Philosophy Recommendation
  if (step === 8) {
    if (philosophyLoading) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background">
          <ProgressDots current={8} />
          <div className="text-center max-w-md">
            <div className="w-12 h-12 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto mb-6" />
            <p className="text-lg text-foreground mb-2">Analysing your profile...</p>
            <p className="text-muted-foreground">Matching training philosophies...</p>
          </div>
        </div>
      );
    }

    if (philosophyError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background">
          <ProgressDots current={8} />
          <div className="text-center max-w-md">
            <p className="text-destructive mb-4">{philosophyError}</p>
            <Button onClick={() => window.location.reload()}>Try again</Button>
          </div>
        </div>
      );
    }

    if (!philosophyResult?.primary) return null;

    const { primary, alternatives = [] } = philosophyResult;
    const primaryMeta = PHILOSOPHY_NAMES[primary.philosophy] ?? { name: primary.philosophy, founder: "" };

    return (
      <div className="min-h-screen flex flex-col px-6 py-8 bg-background overflow-y-auto">
        <ProgressDots current={8} />
        <div className="max-w-lg mx-auto flex-1 flex flex-col gap-6">
          <div className="rounded-2xl border-2 border-primary bg-primary/5 p-6">
            <span className="text-xs font-medium text-primary uppercase tracking-wide">Recommended for you</span>
            <h3 className="text-xl font-bold text-foreground mt-1">{primaryMeta.name}</h3>
            <p className="text-sm text-muted-foreground">{primaryMeta.founder}</p>
            <div className="flex gap-1 mt-3 h-2 rounded-full overflow-hidden bg-muted">
              <div className="bg-emerald-500" style={{ width: "80%" }} />
              <div className="bg-amber-500" style={{ width: "10%" }} />
              <div className="bg-rose-500" style={{ width: "10%" }} />
            </div>
            <p className="text-sm text-foreground mt-3">{primary.reason}</p>
            <p className="text-xs text-muted-foreground mt-2">{(primary.confidence ?? 85)}% match</p>
            <Button
              className="w-full mt-4 rounded-full"
              onClick={() => buildPlanWithPhilosophy(primary.philosophy)}
            >
              Build my plan with this →
            </Button>
          </div>
          {alternatives.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Also consider</p>
              {alternatives.slice(0, 2).map((alt) => {
                const altMeta = PHILOSOPHY_NAMES[alt.philosophy] ?? { name: alt.philosophy, founder: "" };
                return (
                  <div key={alt.philosophy} className="rounded-xl border border-border bg-card p-4">
                    <p className="font-semibold text-foreground">{altMeta.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">{alt.reason}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 rounded-full"
                      onClick={() => buildPlanWithPhilosophy(alt.philosophy)}
                    >
                      Choose this
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
          <a href="/philosophy" className="text-sm text-muted-foreground hover:text-primary text-center">
            Not sure? Learn about all philosophies →
          </a>
        </div>
      </div>
    );
  }

  // Step 9 — Plan Generation
  if (step === 9) {
    if (planLoading) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background">
          <ProgressDots current={9} />
          <div className="text-center max-w-md">
            <div className="w-16 h-16 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto mb-6" />
            <p className="text-lg text-foreground mb-4">Building your plan...</p>
            <div className="text-sm text-muted-foreground space-y-2 text-left">
              <p>✓ Calculating your training zones</p>
              <p>✓ Mapping weekly structure</p>
              <p>✓ Balancing load progression</p>
              <p>✓ Checking injury constraints</p>
              <p className="text-primary">⏳ Finalising...</p>
            </div>
          </div>
        </div>
      );
    }

    if (planError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background">
          <ProgressDots current={9} />
          <div className="text-center max-w-md">
            <p className="text-destructive mb-4">{planError}</p>
            <Button onClick={() => { setPlanError(null); setPlanLoading(true); setPlanRetryCount((c) => c + 1); }}>Try again</Button>
          </div>
        </div>
      );
    }

    if (!planResult) return null;

    const p = planResult;
    const firstWorkout = p.first_workout;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-6">
            <span className="text-3xl">✅</span>
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Your plan is ready.</h2>
          <p className="text-lg font-semibold text-foreground mb-1">{p.plan_name}</p>
          <p className="text-sm text-muted-foreground mb-4">
            {PHILOSOPHY_NAMES[p.philosophy]?.name ?? p.philosophy} · {p.total_weeks} weeks
            {p.peak_weekly_km && ` · Peak ${Math.round(p.peak_weekly_km)}km/week`}
          </p>
          <p className="text-sm text-muted-foreground mb-6">
            Week 1 starts {p.start_date && isValid(new Date(p.start_date)) ? format(new Date(p.start_date), "MMM d, yyyy") : "—"}
            {firstWorkout && (
              <>
                <br />
                First key session: {firstWorkout.name}
                {firstWorkout.date && isValid(new Date(firstWorkout.date)) ? ` on ${format(new Date(firstWorkout.date), "EEEE")}` : ""}
              </>
            )}
          </p>
          <div className="flex flex-col gap-3">
            <Button
              className="rounded-full w-full"
              onClick={() => {
                const final = { ...answers, fitnessKm: answers.fitnessKm ?? 30 };
                onComplete(final, p, "view_plan");
              }}
            >
              View my training plan →
            </Button>
            <Button
              variant="outline"
              className="rounded-full w-full"
              onClick={() => {
                const final = { ...answers, fitnessKm: answers.fitnessKm ?? 30 };
                onComplete(final, p, "chat");
              }}
            >
              Chat with Coach Cade
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
