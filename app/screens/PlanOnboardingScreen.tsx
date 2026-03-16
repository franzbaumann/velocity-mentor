import { FC, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  Modal,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import DateTimePicker, {
  AndroidEvent as DateTimePickerAndroidEvent,
} from "@react-native-community/datetimepicker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { format, differenceInWeeks } from "date-fns";
import { ScreenContainer } from "../components/ScreenContainer";
import { GlassCard } from "../components/GlassCard";
import { ExpandableText } from "../components/ExpandableText";
import { useTheme } from "../context/ThemeContext";
import type { PlanStackParamList } from "../navigation/RootNavigator";
import { supabase } from "../shared/supabase";
import { callEdgeFunctionWithRetry as callEdgeFetchWithRetry } from "../lib/edgeFunctionWithRetry";
import { useMergedIntervalsData } from "../hooks/useMergedIntervalsData";
import { useTrainingPlan } from "../hooks/useTrainingPlan";
import {
  buildPlanFromIntake,
  savePlanToSupabase,
  type PlanIntake,
} from "../lib/generate-plan";

// --- Types mirrored from web Onboarding V2 ---

/** Onboarding answers; aligned with PlanIntake (goal_race_date, goal_time, detailed_injuries, availability_notes, training_history_notes) */
type OnboardingV2Answers = {
  goal: string;
  goalDetail: string;
  raceName: string;
  raceDate: string;
  raceDistance: string;
  goalTime: string;
  /** Alias for PlanIntake goal_race_date */
  goal_race_date?: string;
  /** Alias for PlanIntake goal_time */
  goal_time?: string;
  weeklyKm: number;
  recentRaceType: string;
  recentRaceTime: string;
  currentFitnessNote: string;
  daysPerWeek: number;
  sessionLength: string;
  schedulingNote: string;
  /** Alias for PlanIntake availability_notes */
  availability_notes?: string;
  preferredDays?: string[];
  injuries: string[];
  injuryDetail: string;
  /** Alias for PlanIntake detailed_injuries */
  detailed_injuries?: string;
  experienceLevel: string;
  trainingHistoryNote: string;
  /** Alias for PlanIntake training_history_notes */
  training_history_notes?: string;
};

type PhilosophyRecommendation = {
  primary: {
    philosophy: string;
    reason: string;
    confidence: number;
  };
  alternatives: {
    philosophy: string;
    reason: string;
  }[];
};

type PlanResult = {
  plan_id: string;
  plan_name: string;
  philosophy: string;
  total_weeks: number;
  peak_weekly_km: number | null;
  start_date: string;
  first_workout: { name: string; date: string } | null;
};

type OnboardingState = {
  currentStep: number;
  answers: OnboardingV2Answers;
  recommendedPhilosophy: PhilosophyRecommendation | null;
  selectedPhilosophy: string | null;
  generatedPlan: PlanResult | null;
};

const DEFAULT_ANSWERS: OnboardingV2Answers = {
  goal: "",
  goalDetail: "",
  raceName: "",
  raceDate: "",
  raceDistance: "",
  goalTime: "",
  weeklyKm: 30,
  recentRaceType: "",
  recentRaceTime: "",
  currentFitnessNote: "",
  daysPerWeek: 0,
  sessionLength: "",
  schedulingNote: "",
  preferredDays: [],
  injuries: [],
  injuryDetail: "",
  experienceLevel: "",
  trainingHistoryNote: "",
};

const DEFAULT_STATE: OnboardingState = {
  currentStep: 1,
  answers: { ...DEFAULT_ANSWERS },
  recommendedPhilosophy: null,
  selectedPhilosophy: null,
  generatedPlan: null,
};

const STORAGE_KEY = "paceiq_onboarding_v2_mobile";

const GOALS_NEED_RACE = new Set(["faster_race", "first_marathon", "shorter_faster"]);
const STEP_ORDER_WITH_RACE = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
const STEP_ORDER_WITHOUT_RACE = [1, 2, 4, 5, 6, 7, 8, 9] as const;

function getStepOrder(goal: string): readonly number[] {
  return GOALS_NEED_RACE.has(goal) ? STEP_ORDER_WITH_RACE : STEP_ORDER_WITHOUT_RACE;
}

function getUserStepLabel(internalStep: number, goal: string): { num: number; total: number } | null {
  const fullWidth = [1, 8, 9];
  if (fullWidth.includes(internalStep)) return null;
  const userSteps = getStepOrder(goal).filter((s) => !fullWidth.includes(s));
  const idx = userSteps.indexOf(internalStep);
  if (idx === -1) return null;
  return { num: idx + 1, total: userSteps.length };
}

const PHILOSOPHY_TO_ENUM: Record<string, string> = {
  "80_20_polarized": "80_20",
  jack_daniels: "jack_daniels",
  lydiard: "lydiard",
  hansons: "hansons",
  pfitzinger: "pfitzinger",
  kenyan_model: "ai",
};

const PHILOSOPHY_META: Record<string, { icon: string; label: string; tagline: string }> = {
  "80_20_polarized": {
    icon: "⚡",
    label: "80/20 Polarized",
    tagline: "Easy days easy, hard days hard — 80% low intensity, 20% high.",
  },
  jack_daniels: {
    icon: "📊",
    label: "Jack Daniels VDOT",
    tagline: "VDOT-based zones with structured E/T/I/R workouts.",
  },
  lydiard: {
    icon: "🏔️",
    label: "Lydiard Base Building",
    tagline: "Build a massive aerobic base, then layer in speed.",
  },
  hansons: {
    icon: "🔥",
    label: "Hansons Marathon Method",
    tagline: "Cumulative fatigue — train on tired legs.",
  },
  pfitzinger: {
    icon: "📈",
    label: "Pfitzinger",
    tagline: "High mileage with lactate threshold focus.",
  },
  kenyan_model: {
    icon: "🇰🇪",
    label: "Kenyan Model",
    tagline: "Group runs, fartlek, and doubles.",
  },
};

const ANALYSE_STEPS = [
  "Reading your training data",
  "Evaluating your goals & timeline",
  "Matching physiology to methodology",
  "Ranking philosophies for you",
];


/** Toggle when paceiq-philosophy edge function is deployed. When false, use rule-based fallback. */
const PACEIQ_PHILOSOPHY_ENABLED = false;

const PHILOSOPHY_FETCH_TIMEOUT_MS = 10000;

/** Rule-based philosophy recommendation when edge function is unavailable or fails. */
function getFallbackPhilosophy(answers: OnboardingV2Answers): PhilosophyRecommendation {
  const weeklyKm = answers.weeklyKm ?? 0;
  let primary: { philosophy: string; reason: string; confidence: number };
  const alternatives: { philosophy: string; reason: string }[] = [];

  if (weeklyKm < 30) {
    primary = {
      philosophy: "80_20_polarized",
      reason: "At under 30 km/week, 80/20 keeps intensity balanced and reduces injury risk while you build volume.",
      confidence: 0.85,
    };
    alternatives.push(
      { philosophy: "jack_daniels", reason: "VDOT-based training gives clear paces as you increase volume." },
      { philosophy: "lydiard", reason: "Base-first approach suits lower volume; add intensity later." },
    );
  } else if (weeklyKm <= 60) {
    primary = {
      philosophy: "jack_daniels",
      reason: "In the 30–60 km/week range, Jack Daniels VDOT provides structured zones and proven progressions.",
      confidence: 0.85,
    };
    alternatives.push(
      { philosophy: "80_20_polarized", reason: "Polarized model works well at this volume for race-focused training." },
      { philosophy: "lydiard", reason: "Lydiard base-building fits if you prefer a long aerobic phase." },
    );
  } else {
    primary = {
      philosophy: "lydiard",
      reason: "Above 60 km/week, Lydiard base-building leverages your volume and periodizes intensity effectively.",
      confidence: 0.85,
    };
    alternatives.push(
      { philosophy: "jack_daniels", reason: "VDOT structure pairs well with high volume for sharpening." },
      { philosophy: "pfitzinger", reason: "Pfitzinger suits high mileage with lactate threshold focus." },
    );
  }

  return { primary, alternatives };
}

/** Map onboarding answers to intake shape for coach-generate-plan and buildPlanFromIntake */
function mapAnswersToIntake(answers: OnboardingV2Answers): PlanIntake {
  const freqStr =
    answers.daysPerWeek >= 6 ? "6-7" : answers.daysPerWeek >= 1 ? `${answers.daysPerWeek} days` : "4 days";
  const days =
    answers.preferredDays && answers.preferredDays.length > 0
      ? answers.preferredDays
      : ["Monday", "Wednesday", "Friday", "Saturday"];
  return {
    race_date: answers.raceDate || answers.goal_race_date,
    race_goal: answers.raceDistance,
    target_time: answers.goalTime || answers.goal_time,
    goal_race_date: answers.raceDate || answers.goal_race_date,
    goal_time: answers.goalTime || answers.goal_time,
    weekly_frequency: freqStr,
    long_run_day: /sunday/i.test(answers.schedulingNote || "") ? "Sunday" : "Saturday",
    available_days: days,
    detailed_injuries: answers.injuryDetail || answers.detailed_injuries,
    availability_notes: answers.schedulingNote || answers.availability_notes,
    training_history_notes: answers.trainingHistoryNote || answers.training_history_notes,
  };
}

export const PlanOnboardingScreen: FC = () => {
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<PlanStackParamList>>();
  const { activities, readiness: readinessRows, isLoading: mergedDataLoading } = useMergedIntervalsData();
  const { plan: existingPlan, isLoading: planCheckLoading } = useTrainingPlan();

  const [state, setState] = useState<OnboardingState>(DEFAULT_STATE);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [loadingSaved, setLoadingSaved] = useState(true);

  const [philoLoading, setPhiloLoading] = useState(false);
  const [philoError, setPhiloError] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  const [visibleAnalyseSteps, setVisibleAnalyseSteps] = useState(0);
  const [showRaceDatePicker, setShowRaceDatePicker] = useState(false);
  const [planProgress, setPlanProgress] = useState(0);
  const [manualOverrideFitness, setManualOverrideFitness] = useState(false);
  const [injurySeverity, setInjurySeverity] = useState<
    "managing" | "flaring" | "cant_train" | null
  >(null);

  const goalHoursRef = useRef<TextInput | null>(null);
  const goalMinutesRef = useRef<TextInput | null>(null);
  const goalSecondsRef = useRef<TextInput | null>(null);

  // Swipe gesture for back/next
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 20,
      onPanResponderEnd: (_, gesture) => {
        if (gesture.dx > 60) {
          handleBack();
        } else if (gesture.dx < -60) {
          handleNext();
        }
      },
    }),
  ).current;

  // Load saved onboarding state
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        if (!raw) {
          setLoadingSaved(false);
          return;
        }
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object" && parsed.answers) {
            setState({
              currentStep: typeof parsed.currentStep === "number" ? parsed.currentStep : 1,
              answers: { ...DEFAULT_ANSWERS, ...parsed.answers },
              recommendedPhilosophy: parsed.recommendedPhilosophy ?? null,
              selectedPhilosophy: parsed.selectedPhilosophy ?? null,
              generatedPlan: parsed.generatedPlan ?? null,
            });
          }
        } catch {
          // ignore corrupt
        } finally {
          setLoadingSaved(false);
        }
      })
      .catch(() => setLoadingSaved(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // If the user already has an active training plan, skip onboarding entirely
  useEffect(() => {
    if (planCheckLoading || loadingSaved) return;
    if (existingPlan?.plan && existingPlan.weeks.length > 0) {
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
      navigation.replace("PlanMain");
    }
  }, [planCheckLoading, loadingSaved, existingPlan, navigation]);

  // If saved state is stuck on step 9 without required data, reset to step 1
  useEffect(() => {
    if (loadingSaved) return;
    if (
      state.currentStep === 9 &&
      !state.selectedPhilosophy &&
      !state.generatedPlan
    ) {
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
      setState(DEFAULT_STATE);
    }
  }, [loadingSaved, state.currentStep, state.selectedPhilosophy, state.generatedPlan]);

  // Persist state
  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state]);

  const stepOrder = getStepOrder(state.answers.goal);
  const currentIndex = stepOrder.indexOf(state.currentStep);
  const progressPct = stepOrder.length > 1 ? (currentIndex / (stepOrder.length - 1)) * 100 : 0;
  const stepLabel = getUserStepLabel(state.currentStep, state.answers.goal);

  const updateAnswers = (updates: Partial<OnboardingV2Answers>) => {
    setState((prev) => ({ ...prev, answers: { ...prev.answers, ...updates } }));
  };

  const handleNext = () => {
    const order = getStepOrder(state.answers.goal);
    const idx = order.indexOf(state.currentStep);
    if (idx === -1 || idx >= order.length - 1) return;
    if (!canProceed(state.currentStep, state.answers)) return;
    setDirection("forward");
    setState((prev) => ({ ...prev, currentStep: order[idx + 1] }));
  };

  const handleBack = () => {
    const order = getStepOrder(state.answers.goal);
    const idx = order.indexOf(state.currentStep);
    if (idx <= 0) {
      navigation.getParent()?.navigate("Dashboard");
      return;
    }

    setDirection("backward");

    if (state.currentStep === 8) {
      setState((prev) => ({ ...prev, currentStep: order[idx - 1], recommendedPhilosophy: null }));
      setPhiloError(null);
      return;
    }
    if (state.currentStep === 9) {
      setState((prev) => ({
        ...prev,
        currentStep: 8,
        selectedPhilosophy: null,
        generatedPlan: null,
      }));
      setPlanError(null);
      return;
    }

    setState((prev) => ({ ...prev, currentStep: order[idx - 1] }));
  };

  // --- Derived CTL / current training stats from dashboard (intervals data) ---
  const currentStats = useMemo(() => {
    const latestWithCtl = [...readinessRows].reverse().find((r) => {
      const ctl = r.ctl ?? r.icu_ctl ?? null;
      return ctl != null && ctl > 0;
    });
    const ctl = latestWithCtl ? latestWithCtl.ctl ?? latestWithCtl.icu_ctl ?? null : null;

    const runs = activities.filter((a) => {
      const t = (a.type ?? "").toLowerCase();
      return (t.includes("run") || t === "trailrun") && (a.distance_km ?? 0) > 0.5;
    });

    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
    const weeklyKm = (() => {
      const recent = runs.filter((r) => r.date >= format(fourWeeksAgo, "yyyy-MM-dd"));
      if (!recent.length) return null;
      const weekTotals: Record<string, number> = {};
      for (const r of recent) {
        const d = new Date(r.date);
        const wkStart = new Date(d);
        wkStart.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        const key = format(wkStart, "yyyy-MM-dd");
        weekTotals[key] = (weekTotals[key] ?? 0) + (r.distance_km ?? 0);
      }
      const weeks = Object.values(weekTotals);
      return weeks.length ? Math.round(weeks.reduce((a, b) => a + b, 0) / weeks.length) : null;
    })();

    const oneYearAgo = new Date();
    oneYearAgo.setDate(oneYearAgo.getDate() - 365);
    const yearlyWeeklyKm = (() => {
      const yearRuns = runs.filter((r) => r.date >= format(oneYearAgo, "yyyy-MM-dd"));
      if (!yearRuns.length) return null;
      const weekTotals: Record<string, number> = {};
      for (const r of yearRuns) {
        const d = new Date(r.date);
        const wkStart = new Date(d);
        wkStart.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        const key = format(wkStart, "yyyy-MM-dd");
        weekTotals[key] = (weekTotals[key] ?? 0) + (r.distance_km ?? 0);
      }
      const weeks = Object.values(weekTotals);
      return weeks.length ? Math.round(weeks.reduce((a, b) => a + b, 0) / weeks.length) : null;
    })();

    const lastRun = runs.length ? runs[runs.length - 1] : null;
    const lastRunLabel = lastRun
      ? (() => {
          const d = new Date(lastRun.date);
          const diffDays = Math.round(
            (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24),
          );
          if (diffDays === 0) return "Today";
          if (diffDays === 1) return "Yesterday";
          if (diffDays < 7) return `${diffDays} days ago`;
          return format(d, "MMM d");
        })()
      : null;

    const bestPace = (() => {
      const paces = runs
        .filter((r) => r.avg_pace)
        .map((r) => {
          const parts = (r.avg_pace ?? "").split(":");
          if (parts.length === 2) {
            const min = Number(parts[0]);
            const sec = Number(parts[1]);
            if (Number.isFinite(min) && Number.isFinite(sec)) return min * 60 + sec;
          }
          return null;
        })
        .filter((p): p is number => p != null && p > 0);
      if (!paces.length) return null;
      const best = Math.min(...paces);
      const min = Math.floor(best / 60);
      const sec = Math.round(best % 60);
      return `${min}:${String(sec).padStart(2, "0")}/km`;
    })();

    const formatDuration = (sec: number | null | undefined) => {
      if (sec == null || !Number.isFinite(sec)) return null;
      const total = Math.max(0, Math.round(sec));
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      if (h > 0) {
        return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
      }
      return `${m}:${String(s).padStart(2, "0")}`;
    };

    const findPbForDistance = (targetKm: number, toleranceKm: number) => {
      const candidates = runs.filter((r) => {
        const d = r.distance_km ?? 0;
        return d >= targetKm - toleranceKm && d <= targetKm + toleranceKm && r.duration_seconds != null;
      });
      if (!candidates.length) return null;
      const best = candidates.reduce((bestRun, r) =>
        (bestRun.duration_seconds ?? Infinity) < (r.duration_seconds ?? Infinity) ? bestRun : r,
      candidates[0]);
      return formatDuration(best.duration_seconds);
    };

    const pb5k = findPbForDistance(5, 0.7);
    const pb10k = findPbForDistance(10, 1);
    const pbHalf = findPbForDistance(21.1, 1.5);
    const pbMarathon = findPbForDistance(42.2, 2);

    const totalKm = runs.reduce((sum, r) => sum + (r.distance_km ?? 0), 0);
    const totalTimeSec = runs.reduce((sum, r) => sum + (r.duration_seconds ?? 0), 0);
    const totalTimeLabel = formatDuration(totalTimeSec);

    const hasData = ctl != null || weeklyKm != null || bestPace != null;
    const totalDays = readinessRows.length;
    const totalRuns = runs.length;
    return {
      ctl,
      weeklyKm,
      yearlyWeeklyKm,
      lastRunLabel,
      bestPace,
      pb5k,
      pb10k,
      pbHalf,
      pbMarathon,
      totalKm,
      totalTimeLabel,
      hasData,
      totalDays,
      totalRuns,
    };
  }, [activities, readinessRows]);

  // --- Philosophy API (step 8) ---
  useEffect(() => {
    if (state.currentStep !== 8) return;
    if (state.recommendedPhilosophy) return;

    setPhiloLoading(true);
    setPhiloError(null);

    if (!PACEIQ_PHILOSOPHY_ENABLED) {
      setState((prev) => ({
        ...prev,
        recommendedPhilosophy: getFallbackPhilosophy(prev.answers),
      }));
      setPhiloLoading(false);
      return;
    }

    (async () => {
      try {
        const json = await callEdgeFetchWithRetry<PhilosophyRecommendation & { primary?: unknown }>(
          "paceiq-philosophy",
          { answers: state.answers },
          {
            maxRetries: 3,
            timeout: PHILOSOPHY_FETCH_TIMEOUT_MS,
          },
        );
        if (json?.primary) {
          setState((prev) => ({
            ...prev,
            recommendedPhilosophy: json as PhilosophyRecommendation,
          }));
        } else {
          setState((prev) => ({
            ...prev,
            recommendedPhilosophy: getFallbackPhilosophy(prev.answers),
          }));
        }
      } catch {
        setState((prev) => ({
          ...prev,
          recommendedPhilosophy: getFallbackPhilosophy(prev.answers),
        }));
      } finally {
        setPhiloLoading(false);
      }
    })();
  }, [state.currentStep, state.answers, state.recommendedPhilosophy]);

  // Analysing animation steps (step 8)
  useEffect(() => {
    if (state.currentStep !== 8 || !philoLoading) {
      setVisibleAnalyseSteps(ANALYSE_STEPS.length);
      return;
    }
    setVisibleAnalyseSteps(0);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setVisibleAnalyseSteps((prev) => (prev < i ? i : prev));
      if (i >= ANALYSE_STEPS.length) {
        clearInterval(id);
      }
    }, 700);
    return () => clearInterval(id);
  }, [philoLoading, state.currentStep]);

  // Sync goal time scroll position when entering step 3 (race details)
  const GOAL_TIME_ROW_HEIGHT = 36;

  const handleSelectPhilosophy = (philosophy: string) => {
    setDirection("forward");
    setState((prev) => ({
      ...prev,
      selectedPhilosophy: philosophy,
      generatedPlan: null,
      currentStep: 9,
    }));
    setPlanError(null);
  };

  const handleRetryPhilosophy = () => {
    setState((prev) => ({ ...prev, recommendedPhilosophy: null }));
    setPhiloError(null);
  };

  // Fake determinate progress while plan is generating
  useEffect(() => {
    if (!planLoading) {
      if (planProgress < 100) setPlanProgress(100);
      return;
    }
    setPlanProgress(0);
    const start = Date.now();
    const targetMs = 15000; // ~15s to reach ~95%
    const id = setInterval(() => {
      const elapsed = Date.now() - start;
      const ratio = Math.min(1, elapsed / targetMs);
      const next = Math.min(95, Math.round(ratio * 100));
      setPlanProgress((prev) => (next > prev ? next : prev));
    }, 150);
    return () => clearInterval(id);
  }, [planLoading]);

  // --- Plan generation API (step 9): coach-generate-plan primary, client-side buildPlanFromIntake fallback ---
  useEffect(() => {
    if (state.currentStep !== 9 || !state.selectedPhilosophy) return;
    if (state.generatedPlan) return;

    setPlanLoading(true);
    setPlanError(null);

    const intake = mapAnswersToIntake(state.answers);

    (async () => {
      try {
        const json = await callEdgeFetchWithRetry<{ plan_id?: string; error?: string }>(
          "coach-generate-plan",
          { intakeAnswers: intake, conversationContext: [] },
          { maxRetries: 3, timeout: 45000 },
        );
        if (!json?.error && json?.plan_id) {
          setState((prev) => ({
            ...prev,
            generatedPlan: {
              plan_id: json.plan_id,
              plan_name: prev.selectedPhilosophy ?? "",
              philosophy: prev.selectedPhilosophy ?? "",
              total_weeks: 0,
              peak_weekly_km: null,
              start_date: "",
              first_workout: null,
            },
          }));
          return;
        }
        throw new Error(json?.error ?? "No plan_id returned");
      } catch {
        // Fallback: client-side buildPlanFromIntake + savePlanToSupabase
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setPlanError("Failed to generate plan");
          return;
        }
        try {
          const plan = buildPlanFromIntake(intake);
          const planId = await savePlanToSupabase(supabase, user.id, plan);
          setState((prev) => ({
            ...prev,
            generatedPlan: {
              plan_id: planId,
              plan_name: prev.selectedPhilosophy ?? "",
              philosophy: prev.selectedPhilosophy ?? "",
              total_weeks: plan.weeks.length,
              peak_weekly_km: null,
              start_date: plan.weeks[0]?.start_date ?? "",
              first_workout: null,
            },
          }));
        } catch (fallbackErr) {
          setPlanError(
            fallbackErr instanceof Error ? fallbackErr.message : "Failed to generate plan",
          );
        }
      } finally {
        setPlanLoading(false);
      }
    })();
  }, [state.currentStep, state.selectedPhilosophy, state.answers, state.generatedPlan]);

  const saveProfileToSupabase = async (answers: OnboardingV2Answers, philosophy: string | null) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
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

      await supabase.from("athlete_profile").upsert(updates, { onConflict: "user_id" });
    } catch (err) {
      console.error("Onboarding mobile: failed to save profile", err);
    }
  };

  const handleCompletePlan = async () => {
    await saveProfileToSupabase(state.answers, state.selectedPhilosophy);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const planId = state.generatedPlan?.plan_id ?? null;

      if (user && planId) {
        await supabase
          .from("training_plan")
          .update({ is_active: false })
          .eq("user_id", user.id);

        await supabase
          .from("training_plan")
          .update({ is_active: true })
          .eq("id", planId);
      }
    } catch (err) {
      console.error("Onboarding mobile: failed to activate training plan", err);
    }

    await AsyncStorage.removeItem(STORAGE_KEY);
    if (state.generatedPlan?.plan_id) {
      navigation.replace("PlanReady");
    } else {
      navigation.replace("PlanMain");
    }
  };

  const handleRetryPlan = () => {
    setState((prev) => ({ ...prev, generatedPlan: null }));
    setPlanError(null);
  };

  // Ensure currentStep is always valid for the current goal
  useEffect(() => {
    if (loadingSaved) return;
    const order = getStepOrder(state.answers.goal);
    if (!order.includes(state.currentStep as (typeof order)[number])) {
      setState((prev) => ({ ...prev, currentStep: 1 }));
    }
  }, [loadingSaved, state.answers.goal, state.currentStep]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        content: {
          flexGrow: 1,
          paddingTop: 56,
          paddingBottom: 32,
          justifyContent: "space-between",
          paddingHorizontal: 16,
        },
        progressBarOuter: {
          height: 4,
          borderRadius: 999,
          backgroundColor: colors.border,
          overflow: "hidden",
          marginBottom: 8,
        },
        progressBarInner: {
          height: 4,
          borderRadius: 999,
          backgroundColor: colors.primary,
        },
        headerRow: {
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 8,
        },
        progressCircle: {
          width: 32,
          height: 32,
          borderRadius: 16,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          alignItems: "center",
          justifyContent: "center",
          marginRight: 10,
        },
        progressCircleText: {
          fontSize: 11,
          fontWeight: "600",
          color: colors.mutedForeground,
        },
        stepLabelRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        },
        stepLabel: { fontSize: 12, color: colors.mutedForeground },
        title: { fontSize: 24, fontWeight: "600", color: colors.foreground, textAlign: "left", marginBottom: 6 },
        subtitle: { fontSize: 14, color: colors.mutedForeground, marginBottom: 12 },
        card: { borderRadius: 16, padding: 16, backgroundColor: colors.card },
        row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
        twoColGrid: {
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "space-between",
          columnGap: 12,
          rowGap: 12,
          flexGrow: 1,
        },
        pill: {
          paddingVertical: 10,
          paddingHorizontal: 18,
          borderRadius: 999,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          backgroundColor: colors.card,
        },
        pillSelected: {
          borderColor: colors.primary,
          backgroundColor: colors.primary,
        },
        pillText: { fontSize: 13, color: colors.foreground },
        goalCard: {
          width: "48%",
          borderRadius: 16,
          padding: 24,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          backgroundColor: colors.card,
          minHeight: 130,
          justifyContent: "space-between",
          shadowColor: "#000",
          shadowOpacity: 0.06,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
        },
        goalCardSelected: {
          borderColor: colors.primary,
          borderWidth: 2,
          backgroundColor: colors.primary + "0D",
        },
        goalEmoji: { fontSize: 40, marginBottom: 12 },
        goalTitle: { fontSize: 13, fontWeight: "600" },
        goalSub: { fontSize: 11, color: colors.mutedForeground, marginTop: 2 },
        input: {
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          color: colors.foreground,
          fontSize: 14,
          marginTop: 4,
        },
        label: { fontSize: 12, color: colors.mutedForeground, marginTop: 8 },
        textArea: {
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          color: colors.foreground,
          fontSize: 14,
          marginTop: 4,
          minHeight: 90,
          textAlignVertical: "top",
        },
        bottomBar: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 16,
        },
        navSecondary: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 999 },
        navSecondaryText: { fontSize: 14, color: colors.mutedForeground },
        navPrimary: {
          paddingVertical: 11,
          paddingHorizontal: 22,
          borderRadius: 999,
          backgroundColor: colors.primary,
        },
        navPrimaryDisabled: { opacity: 0.5 },
        navPrimaryText: { fontSize: 14, fontWeight: "600", color: colors.primaryForeground },
        fitnessCardRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
        fitnessCardLabel: { fontSize: 12, color: colors.mutedForeground },
        fitnessCardValue: { fontSize: 13, fontWeight: "600", color: colors.foreground },
        philosophyGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8 },
        philosophyCard: {
          flexBasis: "48%",
          borderRadius: 16,
          padding: 12,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          backgroundColor: colors.card,
        },
        philosophyCardSelected: {
          borderColor: colors.primary,
          backgroundColor: colors.card,
        },
        philosophyTitle: { fontSize: 14, fontWeight: "600", color: colors.foreground },
        philosophyTagline: { fontSize: 12, color: colors.mutedForeground, marginTop: 4 },
        smallMuted: { fontSize: 12, color: colors.mutedForeground, marginTop: 8 },
        planSummaryCard: { borderRadius: 16, padding: 16, backgroundColor: colors.card, marginTop: 16 },
        planName: { fontSize: 16, fontWeight: "600", color: colors.foreground },
        planMeta: { fontSize: 12, color: colors.mutedForeground, marginTop: 2 },
      }),
    [colors],
  );

  if (loadingSaved) {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={80}
      >
        <ScreenContainer scroll={false}>
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 13, color: colors.mutedForeground }}>Preparing your plan builder…</Text>
          </View>
        </ScreenContainer>
      </KeyboardAvoidingView>
    );
  }

  const canContinueFlag = canProceed(state.currentStep, state.answers);

  const renderStep = () => {
    const { answers } = state;
    switch (state.currentStep) {
      case 1:
        return (
          <View style={{ flex: 1, justifyContent: "center" }}>
            <View style={{ alignItems: "center", paddingHorizontal: 16 }}>
              {/* Logo + badge */}
              <View style={{ alignItems: "center", marginBottom: 16 }}>
                <Text
                  style={{
                    fontWeight: "800",
                    fontSize: 26,
                    letterSpacing: 4,
                    color: colors.foreground,
                    marginBottom: 10,
                  }}
                >
                  CADE
                </Text>
                <View
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 4,
                    borderRadius: 999,
                    backgroundColor: colors.primary,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "600",
                      color: colors.primaryForeground,
                      letterSpacing: 1,
                    }}
                  >
                    YOUR AI RUNNING COACH
                  </Text>
                </View>
              </View>

              {/* Hero text */}
              <Text
                style={{
                  fontSize: 32,
                  fontWeight: "800",
                  color: colors.foreground,
                  textAlign: "center",
                }}
              >
                Train like the best{"\n"}in the world.
              </Text>
              <Text
                style={[
                  styles.subtitle,
                  {
                    fontSize: 16,
                    lineHeight: 22,
                    marginTop: 12,
                    maxWidth: 320,
                    textAlign: "center",
                  },
                ]}
              >
                Kipcoachee builds your plan from real data — your fitness, your physiology, your
                goal.
              </Text>
            </View>

            {/* Data card */}
            {currentStats.hasData && (
              <View
                style={{
                  width: "100%",
                  marginTop: 28,
                  shadowColor: "#000",
                  shadowOpacity: 0.08,
                  shadowRadius: 16,
                  shadowOffset: { width: 0, height: 8 },
                  elevation: 3,
                  borderRadius: 20,
                  overflow: "hidden",
                }}
              >
                <GlassCard>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginBottom: 10,
                    }}
                  >
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: "#22c55e",
                        marginRight: 8,
                      }}
                    />
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "600",
                        color: colors.foreground,
                      }}
                    >
                      We found your training data
                    </Text>
                  </View>

                  {(currentStats.ctl != null ||
                    currentStats.totalDays ||
                    currentStats.totalRuns) && (
                    <View style={{ marginBottom: 6 }}>
                      <View style={styles.fitnessCardRow}>
                        <Text style={styles.fitnessCardLabel}>Fitness (CTL)</Text>
                        <Text style={styles.fitnessCardValue}>
                          {currentStats.ctl != null ? Math.round(currentStats.ctl) : "—"}
                        </Text>
                      </View>
                      <View
                        style={{
                          height: 1,
                          backgroundColor: colors.border,
                          marginVertical: 6,
                          opacity: 0.4,
                        }}
                      />
                      <View style={styles.fitnessCardRow}>
                        <Text style={styles.fitnessCardLabel}>History</Text>
                        <Text style={styles.fitnessCardValue}>
                          {currentStats.totalDays
                            ? `${currentStats.totalDays.toLocaleString()} days`
                            : "—"}
                          {currentStats.totalRuns
                            ? ` · ${currentStats.totalRuns.toLocaleString()} runs`
                            : ""}
                        </Text>
                      </View>
                      <View
                        style={{
                          height: 1,
                          backgroundColor: colors.border,
                          marginVertical: 6,
                          opacity: 0.4,
                        }}
                      />
                      <View style={styles.fitnessCardRow}>
                        <Text style={styles.fitnessCardLabel}>Lifetime volume</Text>
                        <View style={{ alignItems: "flex-end" }}>
                          <Text style={styles.fitnessCardValue}>
                            {currentStats.totalKm
                              ? `${Math.round(currentStats.totalKm)} km`
                              : "—"}
                          </Text>
                          {currentStats.totalTimeLabel && (
                            <Text
                              style={[
                                styles.fitnessCardLabel,
                                { marginTop: 2 },
                              ]}
                            >
                              {currentStats.totalTimeLabel}
                            </Text>
                          )}
                        </View>
                      </View>
                    </View>
                  )}

                  {currentStats.weeklyKm != null && (
                    <View style={{ marginTop: 4 }}>
                      <View style={styles.fitnessCardRow}>
                        <Text style={styles.fitnessCardLabel}>Avg weekly km (4 weeks)</Text>
                        <Text style={styles.fitnessCardValue}>
                          {currentStats.weeklyKm} km
                        </Text>
                      </View>
                    </View>
                  )}
                  {currentStats.yearlyWeeklyKm != null && (
                    <View style={{ marginTop: 4 }}>
                      <View style={styles.fitnessCardRow}>
                        <Text style={styles.fitnessCardLabel}>Avg weekly km (last year)</Text>
                        <Text style={styles.fitnessCardValue}>
                          {currentStats.yearlyWeeklyKm} km
                        </Text>
                      </View>
                    </View>
                  )}

                  {(currentStats.pb5k ||
                    currentStats.pb10k ||
                    currentStats.pbHalf ||
                    currentStats.pbMarathon) && (
                    <View style={{ marginTop: 10 }}>
                      <Text style={[styles.fitnessCardLabel, { marginBottom: 4 }]}>
                        Personal bests
                      </Text>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                        {currentStats.pb5k && (
                          <View
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 4,
                              borderRadius: 999,
                              backgroundColor: "#e0edff",
                            }}
                          >
                            <Text style={{ fontSize: 11, color: "#1d4ed8" }}>
                              5K {currentStats.pb5k}
                            </Text>
                          </View>
                        )}
                        {currentStats.pb10k && (
                          <View
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 4,
                              borderRadius: 999,
                              backgroundColor: "#dcfce7",
                            }}
                          >
                            <Text style={{ fontSize: 11, color: "#15803d" }}>
                              10K {currentStats.pb10k}
                            </Text>
                          </View>
                        )}
                        {currentStats.pbHalf && (
                          <View
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 4,
                              borderRadius: 999,
                              backgroundColor: "#fee2e2",
                            }}
                          >
                            <Text style={{ fontSize: 11, color: "#b91c1c" }}>
                              Half {currentStats.pbHalf}
                            </Text>
                          </View>
                        )}
                        {currentStats.pbMarathon && (
                          <View
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 4,
                              borderRadius: 999,
                              backgroundColor: "#fef9c3",
                            }}
                          >
                            <Text style={{ fontSize: 11, color: "#854d0e" }}>
                              Marathon {currentStats.pbMarathon}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  )}

                  <Text
                    style={{
                      fontSize: 11,
                      color: colors.mutedForeground,
                      fontStyle: "italic",
                      marginTop: 10,
                    }}
                  >
                    This onboarding will be quick.
                  </Text>
                </GlassCard>
              </View>
            )}

            {/* Feature highlights */}
            <View
              style={{
                marginTop: 24,
                gap: 8,
              }}
            >
              {[
                { icon: "🧠", text: "AI-powered plan built for you" },
                { icon: "📊", text: "Based on your real training data" },
                { icon: "🎯", text: "Adapts as you progress" },
              ].map((f) => (
                <View
                  key={f.text}
                  style={{
                    alignSelf: "center",
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 14,
                    paddingVertical: 6,
                    borderRadius: 999,
                    backgroundColor: colors.card,
                    opacity: 0.96,
                  }}
                >
                  <Text style={{ marginRight: 6 }}>{f.icon}</Text>
                  <Text style={{ fontSize: 12, color: colors.mutedForeground }}>{f.text}</Text>
                </View>
              ))}
            </View>
          </View>
        );
      case 2:
        return (
          <>
            <Text style={styles.title}>What do you want to achieve?</Text>
            <Text style={[styles.subtitle, { marginBottom: 20 }]}>
              Be specific — the more precise your goal, the better your plan.
            </Text>
            <View style={{ flex: 1 }}>
              <View style={styles.twoColGrid}>
                {[
                  {
                    id: "faster_race",
                    label: "Run a faster race",
                    sub: "Train for a PR at any distance",
                    emoji: "🏅",
                  },
                  {
                    id: "first_marathon",
                    label: "Finish my first marathon",
                    sub: "From zero to 42.2km",
                    emoji: "🏃",
                  },
                  {
                    id: "aerobic_base",
                    label: "Build my aerobic base",
                    sub: "Lay the foundation for speed later",
                    emoji: "📈",
                  },
                  {
                    id: "return_injury",
                    label: "Return from injury",
                    sub: "Get back safely and stay there",
                    emoji: "🦵",
                  },
                  {
                    id: "shorter_faster",
                    label: "Get faster at short distances",
                    sub: "5K and 10K speed",
                    emoji: "⚡",
                  },
                  {
                    id: "stay_consistent",
                    label: "Stay consistent",
                    sub: "Build the habit, not burn out",
                    emoji: "🔄",
                  },
                ].map((g) => {
                  const selected = answers.goal === g.id;
                  return (
                    <TouchableOpacity
                      key={g.id}
                      activeOpacity={0.9}
                      style={[
                        styles.goalCard,
                        selected && styles.goalCardSelected,
                      ]}
                      onPress={() => updateAnswers({ goal: g.id })}
                    >
                      <Text style={styles.goalEmoji}>{g.emoji}</Text>
                      <View>
                        <Text
                          style={[
                            styles.goalTitle,
                            { color: selected ? colors.primary : colors.foreground },
                          ]}
                        >
                          {g.label}
                        </Text>
                        <Text style={styles.goalSub}>{g.sub}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={{ marginTop: 20 }}>
                <View
                  style={{
                    borderRadius: 16,
                    backgroundColor: colors.card,
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    shadowColor: "#000",
                    shadowOpacity: 0.04,
                    shadowRadius: 8,
                    shadowOffset: { width: 0, height: 3 },
                  }}
                >
                  <Text
                    style={[
                      styles.label,
                      {
                        marginTop: 0,
                        marginBottom: 6,
                        fontSize: 14,
                        fontWeight: "600",
                        color: colors.foreground,
                      },
                    ]}
                  >
                    Describe your goal in your own words
                  </Text>
                  <TextInput
                    style={[
                      styles.textArea,
                      {
                        minHeight: 120,
                        marginTop: 0,
                        fontSize: 15,
                        color: colors.foreground,
                      },
                    ]}
                    multiline
                    value={answers.goalDetail}
                    onChangeText={(v) => updateAnswers({ goalDetail: v })}
                    placeholder="E.g. I want to break 3 hours at Stockholm marathon in August..."
                  />
                </View>
              </View>
            </View>
          </>
        );
      case 3: {
        const hasPreview = answers.raceDistance || answers.raceDate || answers.raceName;
        let previewPace: string | null = null;
        let previewDate: string | null = null;
        let weeksAway: number | null = null;
        const parts = (answers.goalTime || "0:0:0").split(":").map((p) => parseInt(p || "0", 10));
        const hNum = Math.min(23, Math.max(0, Number.isNaN(parts[0]) ? 0 : parts[0]));
        const mNum = Math.min(59, Math.max(0, Number.isNaN(parts[1]) ? 0 : parts[1]));
        const sNum = Math.min(59, Math.max(0, Number.isNaN(parts[2]) ? 0 : parts[2]));
        const pad2 = (n: number) => String(n).padStart(2, "0");
        if (answers.goalTime && answers.raceDistance) {
          const totalSec = parseGoalTimeSeconds(answers.goalTime);
          const kmMap: Record<string, number> = {
            "5K": 5,
            "10K": 10,
            "Half Marathon": 21.0975,
            Marathon: 42.195,
          };
          const km = kmMap[answers.raceDistance];
          if (totalSec && km) previewPace = formatPace(totalSec, km);
        }
        if (answers.raceDate) {
          try {
            const d = new Date(answers.raceDate);
            if (!Number.isNaN(d.getTime())) {
              previewDate = format(d, "MMM d, yyyy");
              const w = differenceInWeeks(d, new Date());
              weeksAway = w > 0 ? w : null;
            }
          } catch {
            // ignore
          }
        }
        return (
          <>
            <Text style={styles.title}>Tell me about your race.</Text>
            <Text style={styles.subtitle}>
              If you don&apos;t have a race, you can skip this and I&apos;ll still build a plan.
            </Text>
            {hasPreview && (
              <GlassCard>
                <Text style={[styles.label, { marginTop: 0 }]}>
                  {answers.raceName || answers.raceDistance || "Your race"}
                </Text>
                {previewDate && (
                  <Text style={styles.smallMuted}>
                    {previewDate}
                    {weeksAway ? ` · ${weeksAway} weeks away` : ""}
                  </Text>
                )}
                {answers.goalTime ? (
                  <Text style={styles.smallMuted}>
                    Target time {answers.goalTime}
                    {previewPace ? ` (${previewPace})` : ""}
                  </Text>
                ) : null}
              </GlassCard>
            )}
            <View style={{ marginTop: 20, gap: 20 }}>
              {/* Race name */}
              <View
                style={{
                  borderRadius: 18,
                  backgroundColor: colors.card,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  shadowColor: "#000",
                  shadowOpacity: 0.04,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 3 },
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: colors.foreground,
                    marginBottom: 6,
                  }}
                >
                  Race name
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      height: 48,
                      fontSize: 15,
                    },
                  ]}
                  value={answers.raceName}
                  onChangeText={(v) => updateAnswers({ raceName: v })}
                  placeholder="e.g. Stockholm Marathon"
                />
              </View>

              {/* Distance */}
              <View
                style={{
                  borderRadius: 18,
                  backgroundColor: colors.card,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  shadowColor: "#000",
                  shadowOpacity: 0.04,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 3 },
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: colors.foreground,
                    marginBottom: 6,
                  }}
                >
                  Distance
                </Text>
                <View style={[styles.row, { marginTop: 4 }]}>
                  {["5K", "10K", "Half Marathon", "Marathon", "Ultra"].map((d) => {
                    const selected = answers.raceDistance === d;
                    return (
                      <TouchableOpacity
                        key={d}
                        activeOpacity={0.85}
                        style={[
                          styles.pill,
                          {
                            height: 44,
                            justifyContent: "center",
                            borderColor: selected ? "transparent" : colors.border,
                            backgroundColor: selected ? colors.primary : colors.card,
                          },
                        ]}
                        onPress={() => updateAnswers({ raceDistance: d })}
                      >
                        <Text
                          style={[
                            styles.pillText,
                            {
                              color: selected
                                ? colors.primaryForeground
                                : colors.foreground,
                            },
                          ]}
                        >
                          {d}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Race date */}
              <View
                style={{
                  borderRadius: 18,
                  backgroundColor: colors.card,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  shadowColor: "#000",
                  shadowOpacity: 0.04,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 3 },
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: colors.foreground,
                    marginBottom: 6,
                  }}
                >
                  Race date
                </Text>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setShowRaceDatePicker(true)}
                >
                  <View
                    style={[
                      styles.input,
                      {
                        height: 48,
                        justifyContent: "center",
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 15,
                        color: answers.raceDate ? colors.foreground : colors.mutedForeground,
                      }}
                    >
                      {answers.raceDate || format(new Date(), "yyyy-MM-dd")}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* Goal time – 3-column scroll picker (HH 0–23, MM/SS 0–59) */}
              <View
                style={{
                  borderRadius: 18,
                  backgroundColor: colors.card,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  shadowColor: "#000",
                  shadowOpacity: 0.04,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 3 },
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: colors.foreground,
                    }}
                  >
                    Goal time
                  </Text>
                  <View
                    style={{
                      marginLeft: 6,
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      borderRadius: 999,
                      backgroundColor: colors.background,
                    }}
                  >
                    <Text style={{ fontSize: 10, color: colors.mutedForeground }}>
                      optional
                    </Text>
                  </View>
                </View>
                <View
                  style={{
                    borderRadius: 16,
                    backgroundColor: "#fff",
                    shadowColor: "#000",
                    shadowOpacity: 0.06,
                    shadowRadius: 8,
                    shadowOffset: { width: 0, height: 2 },
                    paddingVertical: 8,
                    paddingHorizontal: 8,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    {/* HH picker */}
                    <View style={{ flex: 1, alignItems: "center" }}>
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: "600",
                          color: colors.mutedForeground,
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                          marginBottom: 2,
                        }}
                      >
                        HH
                      </Text>
                      <Picker
                        selectedValue={hNum}
                        onValueChange={(val) => {
                          const h = Number(val) || 0;
                          updateAnswers({ goalTime: `${pad2(h)}:${pad2(mNum)}:${pad2(sNum)}` });
                        }}
                        style={{ flex: 1, height: 180, width: "100%" }}
                        itemStyle={{ fontSize: 22, color: "#000" }}
                      >
                        {Array.from({ length: 24 }, (_, i) => (
                          <Picker.Item key={i} label={pad2(i)} value={i} />
                        ))}
                      </Picker>
                    </View>
                    <Text
                      style={{
                        paddingHorizontal: 4,
                        fontSize: 22,
                        fontWeight: "700",
                        color: colors.mutedForeground,
                      }}
                    >
                      :
                    </Text>
                    {/* MM picker */}
                    <View style={{ flex: 1, alignItems: "center" }}>
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: "600",
                          color: colors.mutedForeground,
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                          marginBottom: 2,
                        }}
                      >
                        MM
                      </Text>
                      <Picker
                        selectedValue={mNum}
                        onValueChange={(val) => {
                          const m = Number(val) || 0;
                          updateAnswers({ goalTime: `${pad2(hNum)}:${pad2(m)}:${pad2(sNum)}` });
                        }}
                        style={{ flex: 1, height: 180, width: "100%" }}
                        itemStyle={{ fontSize: 22, color: "#000" }}
                      >
                        {Array.from({ length: 60 }, (_, i) => (
                          <Picker.Item key={i} label={pad2(i)} value={i} />
                        ))}
                      </Picker>
                    </View>
                    <Text
                      style={{
                        paddingHorizontal: 4,
                        fontSize: 22,
                        fontWeight: "700",
                        color: colors.mutedForeground,
                      }}
                    >
                      :
                    </Text>
                    {/* SS picker */}
                    <View style={{ flex: 1, alignItems: "center" }}>
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: "600",
                          color: colors.mutedForeground,
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                          marginBottom: 2,
                        }}
                      >
                        SS
                      </Text>
                      <Picker
                        selectedValue={sNum}
                        onValueChange={(val) => {
                          const s = Number(val) || 0;
                          updateAnswers({ goalTime: `${pad2(hNum)}:${pad2(mNum)}:${pad2(s)}` });
                        }}
                        style={{ flex: 1, height: 180, width: "100%" }}
                        itemStyle={{ fontSize: 22, color: "#000" }}
                      >
                        {Array.from({ length: 60 }, (_, i) => (
                          <Picker.Item key={i} label={pad2(i)} value={i} />
                        ))}
                      </Picker>
                    </View>
                  </View>
                </View>
              </View>

              {/* Tell me more */}
              <View
                style={{
                  borderRadius: 18,
                  backgroundColor: colors.card,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  shadowColor: "#000",
                  shadowOpacity: 0.04,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 3 },
                }}
              >
                <ExpandableText
                  label="Tell me more about this race"
                  value={answers.goalDetail}
                  onChange={(v) => updateAnswers({ goalDetail: v })}
                  placeholder="E.g. It's a flat course, my third attempt at this distance..."
                />
              </View>

              {/* Skip link */}
              <Text
                style={{
                  fontSize: 12,
                  color: colors.mutedForeground,
                  marginTop: 4,
                  textAlign: "center",
                }}
              >
                Skip — I don&apos;t have a race yet
              </Text>
            </View>
            {showRaceDatePicker &&
              (Platform.OS === "ios" ? (
                <Modal transparent animationType="fade" visible>
                  <TouchableWithoutFeedback onPress={() => setShowRaceDatePicker(false)}>
                    <View
                      style={{
                        flex: 1,
                        justifyContent: "flex-end",
                        backgroundColor: "rgba(0,0,0,0.15)",
                      }}
                    >
                      <TouchableWithoutFeedback onPress={() => {}}>
                        <View
                          style={{
                            backgroundColor: colors.background,
                            paddingBottom: 24,
                            paddingTop: 8,
                          }}
                        >
                          <DateTimePicker
                            mode="date"
                            display="spinner"
                            value={
                              answers.raceDate &&
                              !Number.isNaN(new Date(answers.raceDate).getTime())
                                ? new Date(answers.raceDate)
                                : new Date()
                            }
                            onChange={(event, date) => {
                              if (date) {
                                updateAnswers({ raceDate: format(date, "yyyy-MM-dd") });
                              }
                            }}
                          />
                        </View>
                      </TouchableWithoutFeedback>
                    </View>
                  </TouchableWithoutFeedback>
                </Modal>
              ) : (
                <DateTimePicker
                  mode="date"
                  display="default"
                  value={
                    answers.raceDate && !Number.isNaN(new Date(answers.raceDate).getTime())
                      ? new Date(answers.raceDate)
                      : new Date()
                  }
                  onChange={(event, date) => {
                    const e = event as DateTimePickerAndroidEvent;
                    if (e.type === "dismissed") {
                      setShowRaceDatePicker(false);
                      return;
                    }
                    setShowRaceDatePicker(false);
                    if (date) {
                      updateAnswers({ raceDate: format(date, "yyyy-MM-dd") });
                    }
                  }}
                />
              ))}

          </>
        );
      }
      case 4: {
        const showDataCard = currentStats.hasData && !manualOverrideFitness;
        return (
          <>
            <Text style={styles.title}>Where are you right now?</Text>
            {showDataCard ? (
              <>
                <GlassCard>
                  {/* Header row */}
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 12,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        letterSpacing: 1,
                        textTransform: "uppercase",
                        color: colors.mutedForeground,
                        fontWeight: "600",
                      }}
                    >
                      Your current fitness
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: "#22c55e",
                          marginRight: 6,
                        }}
                      />
                      <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
                        Live from intervals.icu
                      </Text>
                    </View>
                  </View>

                  {/* Data rows */}
                  {currentStats.ctl != null && (
                    <>
                      <View style={styles.fitnessCardRow}>
                        <Text style={styles.fitnessCardLabel}>🏃 CTL (Fitness)</Text>
                        <Text style={styles.fitnessCardValue}>
                          {Math.round(currentStats.ctl)}
                        </Text>
                      </View>
                      <View
                        style={{
                          height: 1,
                          backgroundColor: colors.border,
                          marginVertical: 6,
                          opacity: 0.4,
                        }}
                      />
                    </>
                  )}
                  {currentStats.weeklyKm != null && (
                    <>
                      <View style={styles.fitnessCardRow}>
                        <Text style={styles.fitnessCardLabel}>📅 Weekly avg (4 weeks)</Text>
                        <Text style={styles.fitnessCardValue}>
                          {currentStats.weeklyKm} km
                        </Text>
                      </View>
                      <View
                        style={{
                          height: 1,
                          backgroundColor: colors.border,
                          marginVertical: 6,
                          opacity: 0.4,
                        }}
                      />
                    </>
                  )}
                  {currentStats.yearlyWeeklyKm != null && (
                    <>
                      <View style={styles.fitnessCardRow}>
                        <Text style={styles.fitnessCardLabel}>📅 Weekly avg (last year)</Text>
                        <Text style={styles.fitnessCardValue}>
                          {currentStats.yearlyWeeklyKm} km
                        </Text>
                      </View>
                      <View
                        style={{
                          height: 1,
                          backgroundColor: colors.border,
                          marginVertical: 6,
                          opacity: 0.4,
                        }}
                      />
                    </>
                  )}
                  {currentStats.lastRunLabel && (
                    <>
                      <View style={styles.fitnessCardRow}>
                        <Text style={styles.fitnessCardLabel}>🕐 Last run</Text>
                        <Text style={styles.fitnessCardValue}>
                          {currentStats.lastRunLabel}
                        </Text>
                      </View>
                      <View
                        style={{
                          height: 1,
                          backgroundColor: colors.border,
                          marginVertical: 6,
                          opacity: 0.4,
                        }}
                      />
                    </>
                  )}
                  <View style={styles.fitnessCardRow}>
                    <Text style={styles.fitnessCardLabel}>📈 Total runs</Text>
                    <Text style={styles.fitnessCardValue}>
                      {currentStats.totalRuns?.toLocaleString() ?? "—"}
                    </Text>
                  </View>

                  {/* PB chips */}
                  {(currentStats.pb5k ||
                    currentStats.pb10k ||
                    currentStats.pbHalf ||
                    currentStats.pbMarathon) && (
                    <View style={{ marginTop: 10 }}>
                      <Text style={[styles.fitnessCardLabel, { marginBottom: 4 }]}>
                        🏆 Personal bests
                      </Text>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                        {currentStats.pb5k && (
                          <View
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 4,
                              borderRadius: 999,
                              backgroundColor: "#e0edff",
                            }}
                          >
                            <Text style={{ fontSize: 11, color: "#1d4ed8" }}>
                              5K {currentStats.pb5k}
                            </Text>
                          </View>
                        )}
                        {currentStats.pb10k && (
                          <View
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 4,
                              borderRadius: 999,
                              backgroundColor: "#dcfce7",
                            }}
                          >
                            <Text style={{ fontSize: 11, color: "#15803d" }}>
                              10K {currentStats.pb10k}
                            </Text>
                          </View>
                        )}
                        {currentStats.pbHalf && (
                          <View
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 4,
                              borderRadius: 999,
                              backgroundColor: "#fee2e2",
                            }}
                          >
                            <Text style={{ fontSize: 11, color: "#b91c1c" }}>
                              Half {currentStats.pbHalf}
                            </Text>
                          </View>
                        )}
                        {currentStats.pbMarathon && (
                          <View
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 4,
                              borderRadius: 999,
                              backgroundColor: "#fef9c3",
                            }}
                          >
                            <Text style={{ fontSize: 11, color: "#854d0e" }}>
                              Marathon {currentStats.pbMarathon}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  )}

                  <Text
                    style={{
                      fontSize: 11,
                      color: colors.mutedForeground,
                      marginTop: 10,
                    }}
                  >
                    📊 Pulled from intervals.icu
                  </Text>
                </GlassCard>

                {/* This looks wrong pill */}
                <TouchableOpacity
                  onPress={() => setManualOverrideFitness(true)}
                  activeOpacity={0.85}
                  style={{
                    alignSelf: "flex-start",
                    marginTop: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 999,
                    backgroundColor: colors.card,
                    flexDirection: "row",
                    alignItems: "center",
                    shadowColor: "#000",
                    shadowOpacity: 0.03,
                    shadowRadius: 6,
                    shadowOffset: { width: 0, height: 2 },
                  }}
                >
                  <Text style={{ marginRight: 6 }}>⚠️</Text>
                  <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                    This looks wrong — tap to edit manually
                  </Text>
                </TouchableOpacity>

                {/* Free text section */}
                <View style={{ marginTop: 20 }}>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: colors.foreground,
                      marginBottom: 4,
                    }}
                  >
                    Anything the numbers don&apos;t show?
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: colors.mutedForeground,
                      marginBottom: 10,
                    }}
                  >
                    Injuries, recent illness, time off — tell me everything.
                  </Text>

                  <View
                    style={{
                      borderRadius: 18,
                      backgroundColor: colors.card,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      shadowColor: "#000",
                      shadowOpacity: 0.04,
                      shadowRadius: 10,
                      shadowOffset: { width: 0, height: 3 },
                    }}
                  >
                    <TextInput
                      style={[
                        styles.textArea,
                        {
                          minHeight: 160,
                          marginTop: 0,
                          borderWidth: 0,
                          paddingHorizontal: 0,
                          paddingVertical: 0,
                        },
                      ]}
                      multiline
                      maxLength={500}
                      value={answers.currentFitnessNote}
                      onChangeText={(v) => updateAnswers({ currentFitnessNote: v })}
                      placeholder="E.g. I've been running 4x per week, easy runs feel comfortable at 5:30/km, but my left calf has been tight lately..."
                    />
                    {/* Suggestion chips (purely visual tap helpers) */}
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        gap: 6,
                        marginTop: 8,
                      }}
                    >
                      {["Recent injury", "Took time off", "Feeling strong"].map((s) => (
                        <TouchableOpacity
                          key={s}
                          activeOpacity={0.8}
                          onPress={() =>
                            updateAnswers({ currentFitnessNote: s })
                          }
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                            borderRadius: 999,
                            backgroundColor: colors.card,
                            borderWidth: StyleSheet.hairlineWidth,
                            borderColor: colors.border,
                          }}
                        >
                          <Text
                            style={{ fontSize: 11, color: colors.mutedForeground }}
                          >
                            {s}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text
                      style={{
                        fontSize: 11,
                        color: colors.mutedForeground,
                        marginTop: 6,
                        textAlign: "right",
                      }}
                    >
                      {(answers.currentFitnessNote?.length ?? 0)}/500
                    </Text>
                  </View>

                  {/* Motivational footer */}
                  <View
                    style={{
                      marginTop: 14,
                      borderRadius: 14,
                      backgroundColor: "#fef9c3",
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      flexDirection: "row",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ marginRight: 8 }}>💡</Text>
                    <Text
                      style={{
                        fontSize: 12,
                        color: "#854d0e",
                      }}
                    >
                      The more context you give, the better your plan will be.
                    </Text>
                  </View>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.subtitle}>
                  No synced data yet — give me a rough sense of your volume and a recent race.
                </Text>
                <GlassCard>
                  <Text style={styles.label}>Weekly volume</Text>
                  <View style={styles.row}>
                    {[0, 20, 40, 60, 80].map((km) => (
                      <TouchableOpacity
                        key={km}
                        activeOpacity={0.85}
                        style={[
                          styles.pill,
                          answers.weeklyKm === km && styles.pillSelected,
                        ]}
                        onPress={() => updateAnswers({ weeklyKm: km })}
                      >
                        <Text
                          style={[
                            styles.pillText,
                            answers.weeklyKm === km && { color: colors.primaryForeground },
                          ]}
                        >
                          {km === 0 ? "Not running" : `${km} km/week`}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.label}>Recent race result</Text>
                  <View style={styles.row}>
                    {[
                      { id: "none", label: "No recent races" },
                      { id: "5k", label: "5K result" },
                      { id: "10k", label: "10K result" },
                      { id: "half", label: "Half" },
                      { id: "marathon", label: "Marathon" },
                    ].map((r) => (
                      <TouchableOpacity
                        key={r.id}
                        activeOpacity={0.85}
                        style={[
                          styles.pill,
                          answers.recentRaceType === r.id && styles.pillSelected,
                        ]}
                        onPress={() =>
                          updateAnswers({
                            recentRaceType: r.id,
                            recentRaceTime: r.id === "none" ? "" : answers.recentRaceTime,
                          })
                        }
                      >
                        <Text
                          style={[
                            styles.pillText,
                            answers.recentRaceType === r.id && { color: colors.primaryForeground },
                          ]}
                        >
                          {r.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {answers.recentRaceType && answers.recentRaceType !== "none" && (
                    <>
                      <Text style={styles.label}>What was your time?</Text>
                      <TextInput
                        style={styles.input}
                        value={answers.recentRaceTime}
                        onChangeText={(v) =>
                          updateAnswers({
                            recentRaceTime: v.replace(/[^\d:]/g, ""),
                          })
                        }
                        placeholder="What was your time? e.g. 22:30"
                      />
                    </>
                  )}
                  <View style={{ marginTop: 12 }}>
                    <ExpandableText
                      label="Describe your current fitness"
                      value={answers.currentFitnessNote}
                      onChange={(v) => updateAnswers({ currentFitnessNote: v })}
                      placeholder="E.g. I've been running 4x per week, easy runs feel comfortable at 5:30/km..."
                    />
                  </View>
                </GlassCard>
              </>
            )}
          </>
        );
      }
      case 5:
        return (
          <>
            <Text style={styles.title}>How much can you train?</Text>
            <Text style={styles.subtitle}>
              Be honest — consistency beats ambitious plans that fall apart.
            </Text>
            <View style={{ gap: 20, marginTop: 8 }}>
              {/* Days per week */}
              <View
                style={{
                  borderRadius: 18,
                  backgroundColor: colors.card,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  shadowColor: "#000",
                  shadowOpacity: 0.04,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 3 },
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    color: colors.mutedForeground,
                    fontWeight: "600",
                    marginBottom: 8,
                  }}
                >
                  Days per week
                </Text>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  {[3, 4, 5, 6, 7].map((d) => {
                    const selected = answers.daysPerWeek === d;
                    const label =
                      d === 3
                        ? "Beginner"
                        : d === 4
                        ? "Moderate"
                        : d === 5
                        ? "Standard"
                        : d === 6
                        ? "Committed"
                        : "Elite";
                    return (
                      <TouchableOpacity
                        key={d}
                        activeOpacity={0.85}
                        style={{
                          width: 72,
                          height: 90,
                          borderRadius: 18,
                          alignItems: "center",
                          justifyContent: "center",
                          borderWidth: StyleSheet.hairlineWidth,
                          borderColor: selected ? "transparent" : colors.border,
                          backgroundColor: selected ? colors.primary : colors.card,
                          shadowColor: selected ? colors.primary : "transparent",
                          shadowOpacity: selected ? 0.16 : 0,
                          shadowRadius: selected ? 10 : 0,
                          shadowOffset: selected
                            ? { width: 0, height: 4 }
                            : { width: 0, height: 0 },
                        }}
                        onPress={() => updateAnswers({ daysPerWeek: d })}
                      >
                        <Text
                          style={{
                            fontSize: 32,
                            fontWeight: "700",
                            color: selected ? colors.primaryForeground : colors.foreground,
                          }}
                        >
                          {d}
                        </Text>
                        <Text
                          style={{
                            fontSize: 11,
                            color: selected ? colors.primaryForeground : colors.mutedForeground,
                            marginTop: 2,
                          }}
                        >
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Longest session */}
              <View
                style={{
                  borderRadius: 18,
                  backgroundColor: colors.card,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  shadowColor: "#000",
                  shadowOpacity: 0.04,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 3 },
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    color: colors.mutedForeground,
                    fontWeight: "600",
                    marginBottom: 8,
                  }}
                >
                  Longest session
                </Text>
                {[
                  { id: "45", label: "45 min", desc: "Short & sharp", icon: "⏱️" },
                  { id: "60", label: "1 hour", desc: "Standard session", icon: "🏃" },
                  { id: "90", label: "90 min", desc: "Quality training", icon: "💪" },
                  { id: "120", label: "2+ hours", desc: "Long run ready", icon: "🔥" },
                ].map((opt) => {
                  const selected = answers.sessionLength === opt.id;
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      activeOpacity={0.85}
                      onPress={() => updateAnswers({ sessionLength: opt.id })}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingVertical: 10,
                        borderRadius: 12,
                        borderWidth: StyleSheet.hairlineWidth,
                        borderColor: selected ? "transparent" : colors.border,
                        backgroundColor: selected ? "#e5f0ff" : colors.card,
                        marginTop: 4,
                      }}
                    >
                      <View
                        style={{
                          width: 4,
                          height: "100%",
                          borderRadius: 999,
                          backgroundColor: selected ? colors.primary : "transparent",
                          marginRight: 10,
                        }}
                      />
                      <Text style={{ fontSize: 20, marginRight: 10 }}>{opt.icon}</Text>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: "600",
                            color: colors.foreground,
                          }}
                        >
                          {opt.label}
                        </Text>
                        <Text
                          style={{
                            fontSize: 12,
                            color: colors.mutedForeground,
                            marginTop: 2,
                          }}
                        >
                          {opt.desc}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Preferred days */}
              <View
                style={{
                  borderRadius: 18,
                  backgroundColor: colors.card,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  shadowColor: "#000",
                  shadowOpacity: 0.04,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 3 },
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    color: colors.mutedForeground,
                    fontWeight: "600",
                    marginBottom: 8,
                  }}
                >
                  Preferred days
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => {
                    const selected = answers.preferredDays?.includes(d);
                    return (
                      <TouchableOpacity
                        key={d}
                        activeOpacity={0.85}
                        onPress={() => {
                          const current = answers.preferredDays ?? [];
                          const next = current.includes(d)
                            ? current.filter((x) => x !== d)
                            : [...current, d];
                          updateAnswers({ preferredDays: next });
                        }}
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 22,
                          alignItems: "center",
                          justifyContent: "center",
                          borderWidth: StyleSheet.hairlineWidth,
                          borderColor: selected ? "transparent" : colors.border,
                          backgroundColor: selected ? colors.primary : colors.card,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "600",
                            color: selected
                              ? colors.primaryForeground
                              : colors.mutedForeground,
                          }}
                        >
                          {d}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text
                  style={{
                    fontSize: 12,
                    color: colors.mutedForeground,
                  }}
                >
                  We&apos;ll try to schedule sessions on these days.
                </Text>
              </View>

              {/* Scheduling constraints */}
              <View
                style={{
                  borderRadius: 18,
                  backgroundColor: colors.card,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  shadowColor: "#000",
                  shadowOpacity: 0.04,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 3 },
                }}
              >
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: "600",
                    color: colors.foreground,
                    marginBottom: 4,
                  }}
                >
                  Any scheduling constraints?
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: colors.mutedForeground,
                    marginBottom: 10,
                  }}
                >
                  Travel, work shifts, kids — anything that affects your week.
                </Text>
                <View
                  style={{
                    borderRadius: 16,
                    backgroundColor: colors.background,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    minHeight: 120,
                    justifyContent: "flex-start",
                  }}
                >
                  <TextInput
                    style={{
                      fontSize: 14,
                      color: colors.foreground,
                      flexGrow: 1,
                      textAlignVertical: "top",
                    }}
                    multiline
                    value={answers.schedulingNote}
                    onChangeText={(v) => updateAnswers({ schedulingNote: v })}
                    placeholder="E.g. I travel often, long runs only on Sundays, early mornings work best..."
                    placeholderTextColor={colors.mutedForeground}
                  />
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 8,
                    marginTop: 10,
                  }}
                >
                  {[
                    "Travel often",
                    "Night shifts",
                    "Weekends only",
                    "Early mornings",
                  ].map((chip) => (
                    <TouchableOpacity
                      key={chip}
                      activeOpacity={0.85}
                      onPress={() => {
                        const current = answers.schedulingNote ?? "";
                        if (!current) {
                          updateAnswers({ schedulingNote: chip });
                          return;
                        }
                        if (current.includes(chip)) return;
                        const separator = current.trim().endsWith(".") ? " " : " ";
                        updateAnswers({
                          schedulingNote: `${current.trim()}${separator}${chip}`,
                        });
                      }}
                      style={{
                        borderRadius: 999,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        backgroundColor: "#eef2ff",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          color: "#4f46e5",
                          fontWeight: "500",
                        }}
                      >
                        {chip}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Motivational card */}
              <View
                style={{
                  borderRadius: 20,
                  backgroundColor: "#e0f2fe",
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: "#0f172a",
                    fontStyle: "italic",
                    textAlign: "center",
                  }}
                >
                  💡 Consistency beats perfection. An honest plan you follow beats an
                  ambitious one you don&apos;t.
                </Text>
              </View>
            </View>
          </>
        );
      case 6: {
        const INJURIES = [
          { id: "achilles", label: "Achilles tendon", icon: "🦶" },
          { id: "shin", label: "Shin splints", icon: "🦴" },
          { id: "knee", label: "Runner's knee", icon: "🦵" },
          { id: "hip", label: "Hip flexor", icon: "🏃" },
          { id: "plantar", label: "Plantar fasciitis", icon: "👟" },
          { id: "it_band", label: "IT band", icon: "🔗" },
          { id: "stress_fracture", label: "Stress fracture", icon: "⚠️" },
          { id: "back", label: "Back pain", icon: "🔙" },
          { id: "none", label: "Nothing currently", icon: "✅" },
        ] as const;
        const hasInjury =
          answers.injuries.length > 0 && !answers.injuries.includes("none");
        const selectedNames = answers.injuries
          .filter((id) => id !== "none")
          .map((id) => INJURIES.find((i) => i.id === id)?.label?.toLowerCase())
          .filter(Boolean) as string[];
        const injuryPrompt =
          selectedNames.length === 1
            ? `Tell me the full story about your ${selectedNames[0]}`
            : "Tell me the full story — when each started, severity, what you've tried.";
        return (
          <>
            <Text style={styles.title}>Any injuries I should know about?</Text>
            <Text style={styles.subtitle}>
              This shapes your plan more than anything else. Don&apos;t minimise it.
            </Text>
            <View style={{ gap: 20, marginTop: 8 }}>
              {/* Injury cards grid */}
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                  rowGap: 16,
                }}
              >
                {INJURIES.map((inj) => {
                  const selected = answers.injuries.includes(inj.id);
                  const isNone = inj.id === "none";
                  const subtitle =
                    inj.id === "achilles"
                      ? "Heel & lower leg"
                      : inj.id === "shin"
                      ? "Front of lower leg"
                      : inj.id === "knee"
                      ? "Around the kneecap"
                      : inj.id === "hip"
                      ? "Hip & groin area"
                      : inj.id === "plantar"
                      ? "Bottom of foot"
                      : inj.id === "it_band"
                      ? "Outer knee & thigh"
                      : inj.id === "stress_fracture"
                      ? "Bone stress injury"
                      : inj.id === "back"
                      ? "Lower or upper back"
                      : "";
                  const baseBorderColor = isNone ? "#16a34a33" : colors.border;
                  const selectedBorderColor = isNone ? "#16a34a" : "#f97316";
                  const selectedBg = isNone ? "#dcfce7" : "#fef2f2";
                  const cardStyle = {
                    minHeight: 100,
                    borderRadius: 18,
                    paddingVertical: 16,
                    paddingHorizontal: 16,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: selected ? selectedBorderColor : baseBorderColor,
                    backgroundColor: selected ? selectedBg : colors.card,
                    shadowColor: "#000",
                    shadowOpacity: selected ? 0.06 : 0.02,
                    shadowRadius: selected ? 10 : 6,
                    shadowOffset: { width: 0, height: 3 },
                  } as const;
                  return (
                    <TouchableOpacity
                      key={inj.id}
                      activeOpacity={0.9}
                      style={[
                        cardStyle,
                        {
                          width: isNone ? "100%" : "48%",
                          flexDirection: "column",
                          alignItems: "flex-start",
                          justifyContent: "flex-start",
                        },
                      ]}
                      onPress={() => {
                        if (isNone) {
                          setInjurySeverity(null);
                          updateAnswers({ injuries: ["none"], injuryDetail: "" });
                          return;
                        }
                        const current = answers.injuries.filter((i) => i !== "none");
                        const next = current.includes(inj.id)
                          ? current.filter((i) => i !== inj.id)
                          : [...current, inj.id];
                        if (!next.length) {
                          setInjurySeverity(null);
                        }
                        updateAnswers({ injuries: next.length ? next : [] });
                      }}
                    >
                      <Text style={{ fontSize: 32, marginBottom: 8 }}>{inj.icon}</Text>
                      <Text
                        style={{
                          fontSize: 15,
                          fontWeight: "600",
                          color: isNone ? "#166534" : colors.foreground,
                          marginBottom: subtitle ? 2 : 0,
                        }}
                      >
                        {inj.label}
                      </Text>
                      {subtitle ? (
                        <Text
                          style={{
                            fontSize: 12,
                            color: colors.mutedForeground,
                          }}
                        >
                          {subtitle}
                        </Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Severity selector */}
              {hasInjury && (
                <View
                  style={{
                    borderRadius: 18,
                    backgroundColor: colors.card,
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    shadowColor: "#000",
                    shadowOpacity: 0.04,
                    shadowRadius: 8,
                    shadowOffset: { width: 0, height: 3 },
                    gap: 10,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: colors.foreground,
                    }}
                  >
                    How is it right now?
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    {[
                      { id: "managing" as const, label: "Managing it", color: "#22c55e", icon: "🟢" },
                      { id: "flaring" as const, label: "Flaring up", color: "#eab308", icon: "🟡" },
                      {
                        id: "cant_train" as const,
                        label: "Can't train",
                        color: "#ef4444",
                        icon: "🔴",
                      },
                    ].map((opt) => {
                      const selected = injurySeverity === opt.id;
                      return (
                        <TouchableOpacity
                          key={opt.id}
                          activeOpacity={0.9}
                          onPress={() => setInjurySeverity(opt.id)}
                          style={{
                            flex: 1,
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "center",
                            paddingVertical: 8,
                            borderRadius: 999,
                            borderWidth: StyleSheet.hairlineWidth,
                            borderColor: selected ? opt.color : colors.border,
                            backgroundColor: selected ? opt.color + "1A" : colors.card,
                          }}
                        >
                          <Text style={{ marginRight: 4 }}>{opt.icon}</Text>
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: "600",
                              color: selected ? "#111827" : colors.foreground,
                            }}
                          >
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Tell me more expandable section */}
              {hasInjury && (
                <View
                  style={{
                    borderRadius: 18,
                    backgroundColor: colors.card,
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    shadowColor: "#000",
                    shadowOpacity: 0.04,
                    shadowRadius: 8,
                    shadowOffset: { width: 0, height: 3 },
                    gap: 10,
                  }}
                >
                  <ExpandableText
                    label="Tell me more about your injury"
                    value={answers.injuryDetail}
                    onChange={(v) => updateAnswers({ injuryDetail: v })}
                    placeholder="How long ago? Still affecting training? What movements hurt?"
                    rows={5}
                  />
                  {!answers.injuryDetail.trim() && (
                    <Text style={[styles.smallMuted, { color: "#f97316" }]}>
                      Required — this protects you from a plan that makes it worse.
                    </Text>
                  )}
                </View>
              )}

              {/* Info card */}
              <View
                style={{
                  borderRadius: 20,
                  backgroundColor: "#fef3c7",
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    color: "#92400e",
                    fontStyle: "italic",
                  }}
                >
                  ⚠️ Injuries affect your plan significantly. Be honest — it protects you from
                  setbacks.
                </Text>
              </View>
            </View>
          </>
        );
      }
      case 7: {
        const totalRunsLabel = state.answers && (currentStats.totalRuns?.toLocaleString() ?? "—");
        const weeklyKmLabel =
          currentStats.weeklyKm != null ? `${currentStats.weeklyKm} km/wk` : "—";
        const lastRunLabel = currentStats.lastRunLabel ?? "—";
        const levels = [
          {
            id: "beginner",
            emoji: "🌱",
            title: "Just getting started",
            sub: "Running less than a year",
          },
          {
            id: "building",
            emoji: "📈",
            title: "Building runner",
            sub: "1-3 years, getting serious",
          },
          {
            id: "experienced",
            emoji: "🏃",
            title: "Experienced runner",
            sub: "3-5 years, done races",
          },
          {
            id: "competitive",
            emoji: "🏆",
            title: "Competitive runner",
            sub: "5+ years, racing regularly",
          },
        ] as const;
        return (
          <>
            <Text style={styles.title}>How experienced are you?</Text>
            <View style={{ gap: 20, marginTop: 8 }}>
              {/* Experience cards */}
              {levels.map((lvl) => {
                const selected = answers.experienceLevel === lvl.id;
                return (
                  <TouchableOpacity
                    key={lvl.id}
                    activeOpacity={0.9}
                    style={{
                      minHeight: 90,
                      borderRadius: 18,
                      paddingHorizontal: 16,
                      paddingVertical: 16,
                      backgroundColor: selected ? "#e5f0ff" : colors.card,
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: selected ? colors.primary : colors.border,
                      shadowColor: "#000",
                      shadowOpacity: selected ? 0.06 : 0.03,
                      shadowRadius: selected ? 10 : 6,
                      shadowOffset: { width: 0, height: 3 },
                      flexDirection: "row",
                      alignItems: "center",
                    }}
                    onPress={() => updateAnswers({ experienceLevel: lvl.id })}
                  >
                    <Text style={{ fontSize: 32, marginRight: 12 }}>{lvl.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 15,
                          fontWeight: "600",
                          color: colors.foreground,
                        }}
                      >
                        {lvl.title}
                      </Text>
                      <Text
                        style={{
                          fontSize: 13,
                          color: colors.mutedForeground,
                          marginTop: 2,
                        }}
                      >
                        {lvl.sub}
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontSize: 20,
                        marginLeft: 8,
                        color: selected ? colors.primary : colors.mutedForeground,
                      }}
                    >
                      ›
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {/* Training history / coming from another sport */}
              <View
                style={{
                  borderRadius: 18,
                  backgroundColor: colors.card,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  shadowColor: "#000",
                  shadowOpacity: 0.03,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 3 },
                }}
              >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: colors.foreground,
                      marginBottom: 2,
                    }}
                  >
                    Coming from another sport or past training?
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      color: colors.mutedForeground,
                      marginBottom: 6,
                    }}
                  >
                    Tell me what you&apos;re used to — training style, volume, and what&apos;s
                    worked or blown up before.
                  </Text>
                  <View
                    style={{
                      borderRadius: 16,
                      backgroundColor: colors.background,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "600",
                        color: colors.foreground,
                        marginBottom: 4,
                      }}
                    >
                      Your training background in that sport
                    </Text>
                    <TextInput
                      style={{
                        borderRadius: 12,
                        backgroundColor: colors.card,
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        fontSize: 14,
                        color: colors.foreground,
                        minHeight: 90,
                        textAlignVertical: "top",
                      }}
                      multiline
                      value={answers.trainingHistoryNote}
                      onChangeText={(v) => updateAnswers({ trainingHistoryNote: v })}
                      placeholder="E.g. 8 years of football, 4x/week strength work, used to high-intensity intervals..."
                      placeholderTextColor={colors.mutedForeground}
                    />
                  </View>
                </View>

              {/* Motivational card removed per request */}
            </View>
          </>
        );
      }
      case 8: {
        const rec = state.recommendedPhilosophy;
        if (philoLoading) {
          return (
            <>
              <Text style={styles.title}>Analysing your profile</Text>
              <Text style={styles.subtitle}>Finding the philosophy that fits you best.</Text>
              <GlassCard>
                <View style={{ alignItems: "center", marginBottom: 16 }}>
                  <View style={{ position: "relative", width: 56, height: 56 }}>
                    <View
                      style={{
                        position: "absolute",
                        inset: 0,
                        borderRadius: 28,
                        borderWidth: 2,
                        borderColor: colors.primary + "33",
                      }}
                    />
                    <ActivityIndicator
                      size="large"
                      color={colors.primary}
                      style={{ position: "absolute", inset: 0 }}
                    />
                  </View>
                </View>
                {ANALYSE_STEPS.map((s, i) => {
                  const visible = i < visibleAnalyseSteps;
                  const done = i < visibleAnalyseSteps - 1;
                  return (
                    <View
                      key={s}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        marginBottom: 6,
                        opacity: visible ? 1 : 0.2,
                      }}
                    >
                      {done ? (
                        <View
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 9,
                            backgroundColor: "#22c55e33",
                            alignItems: "center",
                            justifyContent: "center",
                            marginRight: 8,
                          }}
                        >
                          <Text style={{ fontSize: 11, color: "#22c55e" }}>✓</Text>
                        </View>
                      ) : (
                        <ActivityIndicator
                          size="small"
                          color={colors.primary}
                          style={{ marginRight: 8 }}
                        />
                      )}
                      <Text
                        style={{
                          fontSize: 13,
                          color: done ? colors.mutedForeground : colors.mutedForeground,
                        }}
                      >
                        {s}
                      </Text>
                    </View>
                  );
                })}
              </GlassCard>
            </>
          );
        }
        if (philoError) {
          return (
            <>
              <Text style={styles.title}>Couldn&apos;t get a recommendation</Text>
              <Text style={styles.subtitle}>{philoError}</Text>
              <TouchableOpacity onPress={handleRetryPhilosophy} activeOpacity={0.8}>
                <Text style={{ fontSize: 14, color: colors.primary, marginTop: 8 }}>Try again</Text>
              </TouchableOpacity>
            </>
          );
        }
        if (!rec) return null;
        return (
          <>
            <Text style={[styles.stepLabel, { marginBottom: 4 }]}>BASED ON YOUR PROFILE</Text>
            <Text style={styles.title}>Here&apos;s what fits you.</Text>
            <GlassCard>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <Text style={[styles.label, { marginTop: 0 }]}>Best match for you</Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 999,
                    backgroundColor: colors.primary + "1a",
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: "600", color: colors.primary }}>
                    {Math.round((rec.primary.confidence ?? 0) * 100)}%
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                activeOpacity={0.9}
                style={[
                  styles.philosophyCard,
                  styles.philosophyCardSelected,
                ]}
                onPress={() => handleSelectPhilosophy(rec.primary.philosophy)}
              >
                <Text style={{ fontSize: 24 }}>
                  {PHILOSOPHY_META[rec.primary.philosophy]?.icon ?? "🏃"}
                </Text>
                <Text style={styles.philosophyTitle}>
                  {PHILOSOPHY_META[rec.primary.philosophy]?.label ??
                    rec.primary.philosophy}
                </Text>
                <Text style={styles.philosophyTagline}>
                  {PHILOSOPHY_META[rec.primary.philosophy]?.tagline}
                </Text>
                <View style={{ marginTop: 8, maxHeight: 160 }}>
                  <Text
                    style={[
                      styles.smallMuted,
                      { marginTop: 0, fontSize: 13, color: colors.mutedForeground },
                    ]}
                  >
                    {rec.primary.reason}
                  </Text>
                </View>
              </TouchableOpacity>
              {rec.alternatives.length > 0 && (
                <>
                  <Text style={[styles.label, { marginTop: 16 }]}>Also a good fit</Text>
                  <View style={styles.philosophyGrid}>
                    {rec.alternatives.slice(0, 2).map((alt) => (
                      <TouchableOpacity
                        key={alt.philosophy}
                        activeOpacity={0.85}
                        style={styles.philosophyCard}
                        onPress={() => handleSelectPhilosophy(alt.philosophy)}
                      >
                        <Text style={{ fontSize: 22 }}>
                          {PHILOSOPHY_META[alt.philosophy]?.icon ?? "🏃"}
                        </Text>
                        <Text style={styles.philosophyTitle}>
                          {PHILOSOPHY_META[alt.philosophy]?.label ?? alt.philosophy}
                        </Text>
                        <Text style={styles.philosophyTagline}>
                          {PHILOSOPHY_META[alt.philosophy]?.tagline}
                        </Text>
                        <Text
                          style={[
                            styles.smallMuted,
                            { marginTop: 8, fontSize: 13, color: colors.mutedForeground },
                          ]}
                          numberOfLines={3}
                        >
                          {alt.reason}
                        </Text>
                        <Text
                          style={{
                            marginTop: 6,
                            fontSize: 13,
                            fontWeight: "600",
                            color: colors.primary,
                          }}
                        >
                          Choose this instead
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
            </GlassCard>
          </>
        );
      }
      case 9: {
        if (planLoading) {
          return (
            <>
              <Text style={styles.title}>Building your plan…</Text>
              <Text style={styles.subtitle}>This usually takes 10–15 seconds.</Text>
              <GlassCard>
                <View style={{ alignItems: "center", marginBottom: 16 }}>
                  <ActivityIndicator size="large" color={colors.primary} />
                </View>
                <View style={{ alignItems: "center", marginBottom: 8 }}>
                  <Text style={{ fontSize: 32, fontWeight: "700", color: colors.foreground }}>
                    {planProgress}%
                  </Text>
                  <Text
                    style={{
                      marginTop: 4,
                      fontSize: 13,
                      color: colors.mutedForeground,
                      textAlign: "center",
                    }}
                  >
                    Analysing your profile, balancing load and creating sessions.
                  </Text>
                </View>
                <View
                  style={{
                    marginTop: 12,
                    height: 6,
                    borderRadius: 999,
                    backgroundColor: colors.border,
                    overflow: "hidden",
                  }}
                >
                  <View
                    style={{
                      width: `${Math.max(5, planProgress)}%`,
                      height: "100%",
                      borderRadius: 999,
                      backgroundColor: colors.primary,
                    }}
                  />
                </View>
              </GlassCard>
            </>
          );
        }
        if (planError) {
          return (
            <>
              <Text style={styles.title}>Couldn&apos;t generate a plan</Text>
              <Text style={styles.subtitle}>{planError}</Text>
              <View style={{ flexDirection: "row", marginTop: 12, gap: 16 }}>
                <TouchableOpacity onPress={handleRetryPlan} activeOpacity={0.8}>
                  <Text style={{ fontSize: 14, color: colors.primary }}>Try again</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleBack} activeOpacity={0.8}>
                  <Text style={{ fontSize: 14, color: colors.mutedForeground }}>Go back</Text>
                </TouchableOpacity>
              </View>
            </>
          );
        }
        if (!state.generatedPlan) {
          return (
            <>
              <Text style={styles.title}>Something went wrong</Text>
              <Text style={styles.subtitle}>
                Your plan couldn&apos;t be loaded. Let&apos;s try again.
              </Text>
              <View style={{ flexDirection: "row", marginTop: 12, gap: 16 }}>
                {state.selectedPhilosophy ? (
                  <TouchableOpacity onPress={handleRetryPlan} activeOpacity={0.8}>
                    <Text style={{ fontSize: 14, color: colors.primary }}>Retry generation</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  onPress={() => {
                    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
                    setState(DEFAULT_STATE);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 14, color: colors.primary }}>Start over</Text>
                </TouchableOpacity>
              </View>
            </>
          );
        }
        const plan = state.generatedPlan;
        return (
          <>
            <Text style={styles.title}>Your plan is ready.</Text>
            <Text style={styles.subtitle}>Let&apos;s go — your training starts soon.</Text>
            <View style={styles.planSummaryCard}>
              <Text style={styles.planName}>{plan.plan_name}</Text>
              <Text style={styles.planMeta}>
                {PHILOSOPHY_META[plan.philosophy]?.label ?? plan.philosophy}
              </Text>
              <Text style={styles.planMeta}>
                {plan.total_weeks} weeks · starts {formatDate(plan.start_date)}
              </Text>
              {plan.peak_weekly_km != null && (
                <Text style={styles.planMeta}>
                  Peak ~{Math.round(plan.peak_weekly_km)} km/week
                </Text>
              )}
              {plan.first_workout && (
                <Text style={[styles.planMeta, { marginTop: 6 }]}>
                  First workout: {plan.first_workout.name} (
                  {formatDate(plan.first_workout.date)})
                </Text>
              )}
            </View>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <TouchableOpacity
                style={[styles.navPrimary, { flex: 1 }]}
                activeOpacity={0.9}
                onPress={handleCompletePlan}
              >
                <Text style={styles.navPrimaryText}>Apply this plan</Text>
              </TouchableOpacity>
            </View>
          </>
        );
      }
      default:
        return null;
    }
  };

  const animStyle =
    direction === "forward"
      ? { transform: [{ translateX: 0 }] }
      : { transform: [{ translateX: 0 }] };

  const userStep = stepLabel;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={80}
    >
      <ScreenContainer contentContainerStyle={styles.content}>
        <View>
          <View style={styles.headerRow}>
            <View style={styles.progressCircle}>
              <Text style={styles.progressCircleText}>{Math.round(progressPct)}%</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.progressBarOuter}>
                <View
                  style={[
                    styles.progressBarInner,
                    { width: `${progressPct}%` },
                  ]}
                />
              </View>
              {userStep && (
                <View style={styles.stepLabelRow}>
                  <Text style={styles.stepLabel}>
                    Step {userStep.num} of {userStep.total}
                  </Text>
                </View>
              )}
            </View>
          </View>
          <View {...panResponder.panHandlers} style={animStyle}>
            {renderStep()}
          </View>
        </View>

        {state.currentStep < 9 && (
          <View style={styles.bottomBar}>
            <TouchableOpacity
              onPress={handleBack}
              activeOpacity={0.8}
              style={styles.navSecondary}
            >
              <Text style={styles.navSecondaryText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleNext}
              disabled={!canContinueFlag}
              activeOpacity={0.85}
              style={[
                styles.navPrimary,
                state.currentStep === 1 && { flex: 1, height: 56, justifyContent: "center" },
                !canContinueFlag && styles.navPrimaryDisabled,
              ]}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={styles.navPrimaryText}>
                  {state.currentStep === 1
                    ? "Let’s go"
                    : state.currentStep < 8
                    ? "Continue"
                    : "See recommendations"}
                </Text>
                <Text
                  style={[
                    styles.navPrimaryText,
                    { marginLeft: 6, fontSize: 16 },
                  ]}
                >
                  →
                </Text>
              </View>
            </TouchableOpacity>
            <View style={{ width: 80 }} />
          </View>
        )}
      </ScreenContainer>
    </KeyboardAvoidingView>
  );
};

function canProceed(step: number, answers: OnboardingV2Answers): boolean {
  switch (step) {
    case 1:
      return true;
    case 2:
      return !!answers.goal;
    case 3:
      return true;
    case 4:
      return true;
    case 5:
      return answers.daysPerWeek > 0 && !!answers.sessionLength;
    case 6: {
      if (!answers.injuries.length) return false;
      const hasInjury = answers.injuries.length > 0 && !answers.injuries.includes("none");
      return !hasInjury || !!answers.injuryDetail.trim();
    }
    case 7:
      return true;
    case 8:
      return !!answers.goal;
    default:
      return true;
  }
}

function parseGoalTimeSeconds(time: string): number | null {
  const parts = time.split(":").map(Number);
  if (parts.some((n) => Number.isNaN(n))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

function formatPace(totalSeconds: number, distanceKm: number): string {
  const paceSeconds = totalSeconds / distanceKm;
  const min = Math.floor(paceSeconds / 60);
  const sec = Math.round(paceSeconds % 60);
  return `${min}:${String(sec).padStart(2, "0")}/km`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

