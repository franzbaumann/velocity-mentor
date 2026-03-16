import { useState, useEffect, useCallback, useRef } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useIntervalsIntegration } from "@/hooks/useIntervalsIntegration";
import { useActivities } from "@/hooks/useActivities";
import { useReadiness } from "@/hooks/useReadiness";
import { ProgressBar } from "./ProgressBar";
import { Step1Welcome } from "./steps/Step1Welcome";
import { Step2Goal } from "./steps/Step2Goal";
import { Step3RaceTarget } from "./steps/Step3RaceTarget";
import { Step4CurrentTraining } from "./steps/Step4CurrentTraining";
import { Step5Availability } from "./steps/Step5Availability";
import { Step6Injuries } from "./steps/Step6Injuries";
import { Step7Background } from "./steps/Step7Background";
import { Step8Philosophy } from "./steps/Step8Philosophy";
import { Step9PlanGeneration } from "./steps/Step9PlanGeneration";
import { Step9SeasonCreation } from "./steps/Step9SeasonCreation";
import type {
  OnboardingV2State,
  OnboardingV2Answers,
  IntervalsData,
  PhilosophyRecommendation,
  PlanResult,
  StepProps,
  StepWithDataProps,
} from "./types";
import { DEFAULT_STATE, getStepOrder } from "./types";

const STORAGE_KEY = "cade_onboarding_v2";

function loadSavedState(): OnboardingV2State | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.answers && typeof parsed.currentStep === "number") return parsed;
  } catch { /* ignore corrupt data */ }
  return null;
}

const PHILOSOPHY_TO_ENUM: Record<string, string> = {
  "80_20_polarized": "80_20",
  jack_daniels: "jack_daniels",
  lydiard: "lydiard",
  hansons: "hansons",
  pfitzinger: "pfitzinger",
  kenyan_model: "ai",
};

export interface OnboardingV2Props {
  onComplete: (
    finalAnswers: Record<string, unknown>,
    planResult?: { plan_id: string },
    action?: "view_plan" | "chat" | "view_season"
  ) => void;
}

export default function OnboardingV2({ onComplete }: OnboardingV2Props) {
  const [state, setState] = useState<OnboardingV2State>(() => loadSavedState() ?? { ...DEFAULT_STATE });
  const [direction, setDirection] = useState<"forward" | "backward">("forward");

  const [philoLoading, setPhiloLoading] = useState(false);
  const [philoError, setPhiloError] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planRetryCount, setPlanRetryCount] = useState(0);
  const [philoRetryCount, setPhiloRetryCount] = useState(0);

  const { isConnected } = useIntervalsIntegration();
  const { data: activitiesRaw } = useActivities(730);
  const { data: readinessRaw } = useReadiness(730);

  const intervalsData: IntervalsData = {
    isConnected,
    activities: Array.isArray(activitiesRaw) ? activitiesRaw : [],
    readiness: Array.isArray(readinessRaw) ? readinessRaw : [],
  };

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  // ---- Navigation ----
  const stepOrder = getStepOrder(state.answers.goal);
  const currentIndex = stepOrder.indexOf(state.currentStep);
  const progress = stepOrder.length > 1 ? (currentIndex / (stepOrder.length - 1)) * 100 : 0;

  const goNext = useCallback(() => {
    const order = getStepOrder(state.answers.goal);
    const idx = order.indexOf(state.currentStep);
    if (idx < order.length - 1) {
      setDirection("forward");
      setState((prev) => ({ ...prev, currentStep: order[idx + 1] }));
    }
  }, [state.answers.goal, state.currentStep]);

  const goBack = useCallback(() => {
    const order = getStepOrder(state.answers.goal);
    const idx = order.indexOf(state.currentStep);
    if (idx <= 0) return;

    setDirection("backward");

    if (state.currentStep === 8) {
      setState((prev) => ({
        ...prev,
        currentStep: order[idx - 1],
        recommendedPhilosophy: null,
      }));
      setPhiloError(null);
    } else if (state.currentStep === 9) {
      setState((prev) => ({
        ...prev,
        currentStep: 8,
        selectedPhilosophy: null,
        generatedPlan: null,
      }));
      setPlanError(null);
    } else {
      setState((prev) => ({ ...prev, currentStep: order[idx - 1] }));
    }
  }, [state.answers.goal, state.currentStep]);

  const updateAnswers = useCallback((updates: Partial<OnboardingV2Answers>) => {
    setState((prev) => ({ ...prev, answers: { ...prev.answers, ...updates } }));
  }, []);

  // ---- Keyboard: Enter → proceed, Escape → back ----
  const goNextRef = useRef(goNext);
  const goBackRef = useRef(goBack);
  goNextRef.current = goNext;
  goBackRef.current = goBack;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        goBackRef.current();
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        const active = document.activeElement;
        if (active instanceof HTMLTextAreaElement) return;
        if (active instanceof HTMLInputElement) return;
        const continueBtn = document.querySelector<HTMLButtonElement>(
          'button[class*="bg-primary"]'
        );
        if (continueBtn && !continueBtn.disabled) {
          continueBtn.click();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ---- Philosophy API (Step 8) ----
  useEffect(() => {
    if (state.currentStep !== 8) return;
    if (state.recommendedPhilosophy) return;

    setPhiloLoading(true);
    setPhiloError(null);

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("paceiq-philosophy", {
          body: { answers: state.answers },
        });
        if (error) {
          let msg = error.message ?? "Failed to get recommendation";
          if (error instanceof FunctionsHttpError && error.context) {
            try {
              const body = (await error.context.json()) as { error?: string };
              if (body?.error) msg = String(body.error);
            } catch {
              /* keep default */
            }
          }
          setPhiloError(msg);
          return;
        }
        if (!data?.primary) {
          setPhiloError((data as { error?: string })?.error ?? "Failed to get recommendation");
          return;
        }
        setState((prev) => ({ ...prev, recommendedPhilosophy: data as PhilosophyRecommendation }));
      } catch (e) {
        setPhiloError(e instanceof Error ? e.message : "Network error");
      } finally {
        setPhiloLoading(false);
      }
    })();
  }, [state.currentStep, state.recommendedPhilosophy, state.answers, philoRetryCount]);

  const handleSelectPhilosophy = useCallback((philosophy: string) => {
    setDirection("forward");
    setState((prev) => ({
      ...prev,
      selectedPhilosophy: philosophy,
      generatedPlan: null,
      currentStep: 9,
    }));
    setPlanError(null);
  }, []);

  const handleRetryPhilosophy = useCallback(() => {
    setState((prev) => ({ ...prev, recommendedPhilosophy: null }));
    setPhiloError(null);
    setPhiloRetryCount((c) => c + 1);
  }, []);

  // ---- Plan Generation API (Step 9) ----
  useEffect(() => {
    if (state.currentStep !== 9 || !state.selectedPhilosophy) return;
    if (state.answers.goal === "plan_season") return; // season path: no plan generated
    if (state.generatedPlan) return;

    setPlanLoading(true);
    setPlanError(null);

    const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paceiq-generate-plan`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 110_000);

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const r = await fetch(url, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            ...(apikey ? { apikey } : {}),
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({
            answers: state.answers,
            philosophy: state.selectedPhilosophy,
          }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok || (data as { error?: string }).error) {
          setPlanError((data as { error?: string }).error ?? "Failed to generate plan");
        } else {
          setState((prev) => ({ ...prev, generatedPlan: data as PlanResult }));
        }
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
          setPlanError("Plan generation timed out. Please try again.");
        } else {
          setPlanError(e instanceof Error ? e.message : "Network error");
        }
      } finally {
        clearTimeout(timeoutId);
        setPlanLoading(false);
      }
    })();

    return () => {
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [state.currentStep, state.selectedPhilosophy, state.generatedPlan, state.answers, planRetryCount]);

  const handleRetryPlan = useCallback(() => {
    setState((prev) => ({ ...prev, generatedPlan: null }));
    setPlanError(null);
    setPlanRetryCount((c) => c + 1);
  }, []);

  const handleStartOver = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setState({ ...DEFAULT_STATE });
    setPlanError(null);
    setPhiloError(null);
    setPlanRetryCount(0);
    setPhiloRetryCount(0);
  }, []);

  // ---- Profile save + completion ----
  const saveProfileToSupabase = useCallback(async (answers: OnboardingV2Answers, philosophy: string | null) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      if (!user) return;

      const updates: Record<string, unknown> = {
        user_id: user.id,
        onboarding_complete: true,
        onboarding_answers: answers,
        updated_at: new Date().toISOString(),
      };

      if (answers.raceDistance) updates.goal_distance = answers.raceDistance;
      if (answers.raceDate) updates.goal_race_date = answers.raceDate;
      if (answers.goalTime) updates.goal_time = answers.goalTime;
      if (answers.raceName || answers.raceDistance) {
        updates.goal_race_name = answers.raceName || answers.raceDistance;
      }
      if (answers.daysPerWeek > 0) updates.days_per_week = answers.daysPerWeek;
      if (answers.injuryDetail) updates.injury_history_text = answers.injuryDetail;
      updates.double_runs_enabled = answers.doubleRunsEnabled ?? false;
      if (answers.doubleRunDays?.length) updates.double_run_days = answers.doubleRunDays;
      if (answers.doubleRunDuration > 0) updates.double_run_duration = answers.doubleRunDuration;
      if (philosophy) {
        updates.recommended_philosophy = philosophy;
        const enumVal = PHILOSOPHY_TO_ENUM[philosophy];
        if (enumVal) updates.training_philosophy = enumVal;
      }

      await supabase
        .from("athlete_profile")
        .upsert(updates, { onConflict: "user_id" });
    } catch (err) {
      console.error("OnboardingV2: failed to save profile", err);
    }
  }, []);

  const handleViewPlan = useCallback(async () => {
    await saveProfileToSupabase(state.answers, state.selectedPhilosophy);
    localStorage.removeItem(STORAGE_KEY);
    onComplete(
      state.answers as unknown as Record<string, unknown>,
      state.generatedPlan ? { plan_id: state.generatedPlan.plan_id } : undefined,
      "view_plan"
    );
  }, [onComplete, state.answers, state.generatedPlan, state.selectedPhilosophy, saveProfileToSupabase]);

  const handleChat = useCallback(async () => {
    await saveProfileToSupabase(state.answers, state.selectedPhilosophy);
    localStorage.removeItem(STORAGE_KEY);
    onComplete(
      state.answers as unknown as Record<string, unknown>,
      state.generatedPlan ? { plan_id: state.generatedPlan.plan_id } : undefined,
      "chat"
    );
  }, [onComplete, state.answers, state.generatedPlan, state.selectedPhilosophy, saveProfileToSupabase]);

  const handleGoToSeason = useCallback(async () => {
    await saveProfileToSupabase(state.answers, state.selectedPhilosophy);
    localStorage.removeItem(STORAGE_KEY);
    onComplete(
      state.answers as unknown as Record<string, unknown>,
      undefined,
      "view_season"
    );
  }, [onComplete, state.answers, state.selectedPhilosophy, saveProfileToSupabase]);

  // ---- Shared step props ----
  const stepProps: StepProps = {
    answers: state.answers,
    onUpdate: updateAnswers,
    onNext: goNext,
    onBack: goBack,
  };

  const stepWithData: StepWithDataProps = {
    ...stepProps,
    intervalsData,
  };

  // ---- Render ----
  const animClass = direction === "forward" ? "onboarding-slide-forward" : "onboarding-slide-backward";

  return (
    <div className="fixed inset-0 bg-background overflow-y-auto">
      <ProgressBar progress={progress} />

      <div key={state.currentStep} className={`pt-10 pb-16 ${animClass}`}>
        {state.currentStep === 1 && <Step1Welcome {...stepWithData} />}
        {state.currentStep === 2 && <Step2Goal {...stepProps} />}
        {state.currentStep === 3 && <Step3RaceTarget {...stepProps} />}
        {state.currentStep === 4 && <Step4CurrentTraining {...stepWithData} />}
        {state.currentStep === 5 && <Step5Availability {...stepProps} />}
        {state.currentStep === 6 && <Step6Injuries {...stepProps} />}
        {state.currentStep === 7 && <Step7Background {...stepProps} />}
        {state.currentStep === 8 && (
          <Step8Philosophy
            {...stepProps}
            recommendation={state.recommendedPhilosophy}
            loading={philoLoading}
            error={philoError}
            onSelectPhilosophy={handleSelectPhilosophy}
            onRetry={handleRetryPhilosophy}
          />
        )}
        {state.currentStep === 9 && state.answers.goal === "plan_season" && (
          <Step9SeasonCreation onGoToSeason={handleGoToSeason} onBack={goBack} />
        )}
        {state.currentStep === 9 && state.answers.goal !== "plan_season" && (
          <Step9PlanGeneration
            planResult={state.generatedPlan}
            loading={planLoading}
            error={planError}
            onViewPlan={handleViewPlan}
            onChat={handleChat}
            onBack={goBack}
            onRetry={handleRetryPlan}
            onStartOver={handleStartOver}
          />
        )}
      </div>
    </div>
  );
}
