import { useState, useEffect, useCallback, useRef } from "react";
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
import { buildPlanFromIntake, savePlanToSupabase } from "@/lib/generate-plan";
import { getFallbackPhilosophy, mapOnboardingAnswersToIntake } from "../../../shared/onboarding-plan";

const STORAGE_KEY = "paceiq_onboarding_v2";

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
    action?: "view_plan" | "chat"
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

    const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paceiq-philosophy`;

    supabase.auth.getSession().then(({ data: { session } }) => {
      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apikey ? { apikey } : {}),
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ answers: state.answers }),
      })
        .then(async (r) => {
          const data = await r.json().catch(() => ({}));
          if (!r.ok || !data?.primary) {
            // Fallback to the same rule-based recommendation used on mobile.
            setState((prev) => ({
              ...prev,
              recommendedPhilosophy: getFallbackPhilosophy({
                weeklyKm: prev.answers.weeklyKm ?? 0,
                daysPerWeek: prev.answers.daysPerWeek ?? 0,
                raceDistance: prev.answers.raceDistance,
                raceDate: prev.answers.raceDate,
                hasIntervalsData: intervalsData.isConnected && (intervalsData.activities.length > 0 || intervalsData.readiness.length > 0),
                injuries: prev.answers.injuries,
                injuryDetail: prev.answers.injuryDetail,
                experienceLevel: prev.answers.experienceLevel,
                goal: prev.answers.goal,
              }) as PhilosophyRecommendation,
            }));
            setPhiloError(null);
          } else {
            setState((prev) => ({ ...prev, recommendedPhilosophy: data as PhilosophyRecommendation }));
          }
        })
        .catch(() => {
          setState((prev) => ({
            ...prev,
            recommendedPhilosophy: getFallbackPhilosophy({
              weeklyKm: prev.answers.weeklyKm ?? 0,
              daysPerWeek: prev.answers.daysPerWeek ?? 0,
              raceDistance: prev.answers.raceDistance,
              raceDate: prev.answers.raceDate,
              hasIntervalsData: intervalsData.isConnected && (intervalsData.activities.length > 0 || intervalsData.readiness.length > 0),
              injuries: prev.answers.injuries,
              injuryDetail: prev.answers.injuryDetail,
              experienceLevel: prev.answers.experienceLevel,
              goal: prev.answers.goal,
            }) as PhilosophyRecommendation,
          }));
          setPhiloError(null);
        })
        .finally(() => setPhiloLoading(false));
    });
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
    if (state.generatedPlan) return;

    setPlanLoading(true);
    setPlanError(null);

    const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/coach-generate-plan`;
    const intakeAnswers = mapOnboardingAnswersToIntake({
      raceDate: state.answers.raceDate,
      raceDistance: state.answers.raceDistance,
      goalTime: state.answers.goalTime,
      daysPerWeek: state.answers.daysPerWeek,
      preferredDays: (state.answers as unknown as { preferredDays?: string[] }).preferredDays,
      schedulingNote: state.answers.schedulingNote,
      injuryDetail: state.answers.injuryDetail,
      trainingHistoryNote: state.answers.trainingHistoryNote,
      philosophy: state.selectedPhilosophy,
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apikey ? { apikey } : {}),
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          intakeAnswers,
          conversationContext: [],
        }),
      })
        .then(async (r) => {
          const data = await r.json().catch(() => ({}));
          if (!r.ok || data.error) {
            throw new Error(data.error ?? "Failed to generate plan");
          } else {
            setState((prev) => ({ ...prev, generatedPlan: data as PlanResult }));
          }
        })
        .catch(async () => {
          // Fallback: deterministic client-side plan + save to Supabase
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Unauthorized");
            const built = buildPlanFromIntake(intakeAnswers);
            const planId = await savePlanToSupabase(supabase, user.id, built);
            setState((prev) => ({
              ...prev,
              generatedPlan: {
                plan_id: planId,
                plan_name: intakeAnswers.plan_name ?? "Training Plan",
                philosophy: prev.selectedPhilosophy ?? "unknown",
                total_weeks: built.weeks.length,
                peak_weekly_km: null,
                start_date: built.weeks[0]?.start_date ?? new Date().toISOString().slice(0, 10),
                first_workout: built.weeks[0]?.sessions?.[0]
                  ? { name: built.weeks[0].sessions[0].description, date: built.weeks[0].start_date }
                  : null,
              },
            }));
            setPlanError(null);
          } catch (e) {
            setPlanError(e instanceof Error ? e.message : "Network error");
          }
        })
        .finally(() => setPlanLoading(false));
    });
  }, [state.currentStep, state.selectedPhilosophy, state.generatedPlan, state.answers, planRetryCount]);

  const handleRetryPlan = useCallback(() => {
    setState((prev) => ({ ...prev, generatedPlan: null }));
    setPlanError(null);
    setPlanRetryCount((c) => c + 1);
  }, []);

  // ---- Profile save + completion ----
  const saveProfileToSupabase = useCallback(async (answers: OnboardingV2Answers, philosophy: string | null) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
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
        {state.currentStep === 9 && (
          <Step9PlanGeneration
            planResult={state.generatedPlan}
            loading={planLoading}
            error={planError}
            onViewPlan={handleViewPlan}
            onChat={handleChat}
            onBack={goBack}
            onRetry={handleRetryPlan}
          />
        )}
      </div>
    </div>
  );
}
