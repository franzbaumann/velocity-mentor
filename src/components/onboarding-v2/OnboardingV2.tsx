import { useState, useEffect, useCallback, useRef } from "react";
import { addDays, format } from "date-fns";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { enrichTrainingPlanWorkoutsFromLibrary } from "@/lib/training/enrichPlanSessions";
import { AUTH_SESSION_EXPIRED_USER_MESSAGE } from "@/lib/supabase-auth-safe";
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
import { DEFAULT_ANSWERS, DEFAULT_STATE, getStepOrder } from "./types";
import { filterPhilosophyRecommendation } from "@/lib/onboarding/philosophyConstraints";

const STORAGE_KEY = "cade_onboarding_v2";

function loadSavedState(): OnboardingV2State | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OnboardingV2State>;
    if (parsed?.answers && typeof parsed.currentStep === "number") {
      return {
        ...parsed,
        answers: { ...DEFAULT_ANSWERS, ...parsed.answers },
      } as OnboardingV2State;
    }
  } catch {
    /* ignore corrupt data */
  }
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
  /** Latest answers for plan POST — avoids re-firing step-9 effect when `answers` object identity churns. */
  const answersRef = useRef(state.answers);
  answersRef.current = state.answers;
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

  /** Resume from DB if user cleared storage or switched device */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user || cancelled) return;
      const { data: prog } = await supabase
        .from("onboarding_progress")
        .select("step_completed, completed_at")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (cancelled) return;
      if (!prog || prog.completed_at) return;
      const serverStep = typeof prog.step_completed === "number" ? prog.step_completed : null;
      if (serverStep != null && serverStep >= 1) {
        setState((prev) => (prev.currentStep < serverStep ? { ...prev, currentStep: serverStep } : prev));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Persist current wizard step for resume */
  useEffect(() => {
    const t = setTimeout(() => {
      void (async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;
        const { error } = await supabase.from("onboarding_progress").upsert(
          { user_id: session.user.id, step_completed: state.currentStep },
          { onConflict: "user_id" },
        );
        if (error) console.warn("[OnboardingV2] onboarding_progress upsert", error.message);
      })();
    }, 500);
    return () => clearTimeout(t);
  }, [state.currentStep]);

  /** Early persist race goal so athlete_profile is not empty if user drops off after step 3 */
  useEffect(() => {
    const { raceDistance, raceDate, goalTime } = state.answers;
    if (!raceDistance && !raceDate) return;
    const t = setTimeout(() => {
      void (async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;
        const updates: Record<string, unknown> = { user_id: session.user.id };
        if (raceDistance) updates.goal_distance = raceDistance;
        if (raceDate) updates.goal_race_date = raceDate;
        if (goalTime) updates.goal_time = goalTime;
        if (raceDistance) updates.goal_race_name = state.answers.raceName || raceDistance;
        const { error } = await supabase.from("athlete_profile").upsert(updates, { onConflict: "user_id" });
        if (error) console.warn("[OnboardingV2] partial athlete_profile", error.message);
      })();
    }, 600);
    return () => clearTimeout(t);
  }, [state.answers.raceDistance, state.answers.raceDate, state.answers.goalTime, state.answers.raceName]);

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
        const answersPayload = answersRef.current;
        const { data, error } = await supabase.functions.invoke("paceiq-philosophy", {
          body: { answers: answersPayload },
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
        const raw = data as PhilosophyRecommendation;
        // #region agent log
        fetch("http://127.0.0.1:7707/ingest/cba70274-43f3-47c4-bdfd-0db115d1b756", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "72c67a" },
          body: JSON.stringify({
            sessionId: "72c67a",
            location: "OnboardingV2.tsx:philosophy-raw",
            message: "paceiq-philosophy response before filter",
            data: {
              raceDistance: answersPayload.raceDistance,
              primary: raw.primary?.philosophy,
              alternatives: raw.alternatives?.map((a) => a.philosophy),
            },
            timestamp: Date.now(),
            hypothesisId: "A",
            runId: "pre-fix",
          }),
        }).catch(() => {});
        // #endregion
        const filtered = filterPhilosophyRecommendation(raw, answersPayload.raceDistance ?? "");
        // #region agent log
        fetch("http://127.0.0.1:7707/ingest/cba70274-43f3-47c4-bdfd-0db115d1b756", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "72c67a" },
          body: JSON.stringify({
            sessionId: "72c67a",
            location: "OnboardingV2.tsx:philosophy-filtered",
            message: "philosophy after distance constraints",
            data: {
              raceDistance: answersPayload.raceDistance,
              primary: filtered.primary?.philosophy,
              alternatives: filtered.alternatives?.map((a) => a.philosophy),
            },
            timestamp: Date.now(),
            hypothesisId: "B",
            runId: "pre-fix",
          }),
        }).catch(() => {});
        // #endregion
        setState((prev) => ({ ...prev, recommendedPhilosophy: filtered }));
      } catch (e) {
        setPhiloError(e instanceof Error ? e.message : "Network error");
      } finally {
        setPhiloLoading(false);
      }
    })();
  }, [state.currentStep, state.recommendedPhilosophy, philoRetryCount]);

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
    if (answersRef.current.goal === "plan_season") return; // season path: no plan generated
    if (state.generatedPlan) return;

    let cancelled = false;
    setPlanLoading(true);
    setPlanError(null);

    (async () => {
      try {
        const a = answersRef.current;
        const firstSchedulableDate =
          (a.planStartWhen ?? "next_week") === "this_week"
            ? format(addDays(new Date(), a.planFirstDayOffset ?? 0), "yyyy-MM-dd")
            : undefined;

        const { data, error } = await supabase.functions.invoke<
          PlanResult & { plan_id?: string; error?: string }
        >("paceiq-generate-plan", {
          body: {
            answers: a,
            philosophy: state.selectedPhilosophy,
            planStartWhen: a.planStartWhen ?? "next_week",
            firstSchedulableDate,
          },
        });

        if (cancelled) return;

        if (error) {
          let msg = error.message ?? "Failed to generate plan";
          let httpStatus = 0;
          const fnCtx = error instanceof FunctionsHttpError ? error.context : undefined;
          const fnRes = fnCtx instanceof Response ? fnCtx : null;
          if (fnRes) {
            try {
              httpStatus = fnRes.status;
              const body = (await fnRes.clone().json()) as { error?: string };
              if (body?.error) msg = String(body.error);
            } catch {
              /* keep message */
            }
          }
          if (httpStatus === 401 || /401|unauthorized|jwt|session/i.test(msg)) {
            setPlanError(AUTH_SESSION_EXPIRED_USER_MESSAGE);
          } else {
            setPlanError(msg);
          }
        } else if (data && typeof data === "object" && "error" in data && (data as { error?: string }).error) {
          const apiErr = String((data as { error?: string }).error);
          if (/unauthorized/i.test(apiErr)) {
            setPlanError(AUTH_SESSION_EXPIRED_USER_MESSAGE);
          } else {
            setPlanError(apiErr || "Failed to generate plan");
          }
        } else {
          const planPayload = data as PlanResult & { plan_id?: string };
          if (!planPayload?.plan_id) {
            setPlanError("Failed to generate plan");
          } else {
            setState((prev) => ({ ...prev, generatedPlan: planPayload }));
            try {
              await enrichTrainingPlanWorkoutsFromLibrary(planPayload.plan_id);
            } catch (enrichErr) {
              console.warn("[OnboardingV2] enrichPlanSessions:", enrichErr);
            }
          }
        }
      } catch (e) {
        if (cancelled) return;
        setPlanError(e instanceof Error ? e.message : "Network error");
      } finally {
        if (!cancelled) setPlanLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [state.currentStep, state.selectedPhilosophy, state.generatedPlan, planRetryCount]);

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

  const markOnboardingProgressComplete = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      await supabase.from("onboarding_progress").upsert(
        { user_id: session.user.id, completed_at: new Date().toISOString(), step_completed: state.currentStep },
        { onConflict: "user_id" },
      );
    } catch (e) {
      console.warn("[OnboardingV2] completed_at upsert", e);
    }
  }, [state.currentStep]);

  const handleViewPlan = useCallback(async () => {
    await saveProfileToSupabase(state.answers, state.selectedPhilosophy);
    await markOnboardingProgressComplete();
    localStorage.removeItem(STORAGE_KEY);
    onComplete(
      state.answers as unknown as Record<string, unknown>,
      state.generatedPlan ? { plan_id: state.generatedPlan.plan_id } : undefined,
      "view_plan"
    );
  }, [onComplete, state.answers, state.generatedPlan, state.selectedPhilosophy, saveProfileToSupabase, markOnboardingProgressComplete]);

  const handleChat = useCallback(async () => {
    await saveProfileToSupabase(state.answers, state.selectedPhilosophy);
    await markOnboardingProgressComplete();
    localStorage.removeItem(STORAGE_KEY);
    onComplete(
      state.answers as unknown as Record<string, unknown>,
      state.generatedPlan ? { plan_id: state.generatedPlan.plan_id } : undefined,
      "chat"
    );
  }, [onComplete, state.answers, state.generatedPlan, state.selectedPhilosophy, saveProfileToSupabase, markOnboardingProgressComplete]);

  const handleGoToSeason = useCallback(async () => {
    await saveProfileToSupabase(state.answers, state.selectedPhilosophy);
    await markOnboardingProgressComplete();
    localStorage.removeItem(STORAGE_KEY);
    onComplete(
      state.answers as unknown as Record<string, unknown>,
      undefined,
      "view_season"
    );
  }, [onComplete, state.answers, state.selectedPhilosophy, saveProfileToSupabase, markOnboardingProgressComplete]);

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
        {state.currentStep === 3 && <Step3RaceTarget {...stepWithData} />}
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
