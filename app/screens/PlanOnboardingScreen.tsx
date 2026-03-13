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
  View,
} from "react-native";
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
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from "../shared/supabase";
import { useDashboardData } from "../hooks/useDashboardData";

// --- Types mirrored from web Onboarding V2 ---

type OnboardingV2Answers = {
  goal: string;
  goalDetail: string;
  raceName: string;
  raceDate: string;
  raceDistance: string;
  goalTime: string;
  weeklyKm: number;
  recentRaceType: string;
  recentRaceTime: string;
  currentFitnessNote: string;
  daysPerWeek: number;
  sessionLength: string;
  schedulingNote: string;
  injuries: string[];
  injuryDetail: string;
  experienceLevel: string;
  trainingHistoryNote: string;
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

const PACEIQ_PHILOSOPHY_URL = `${SUPABASE_URL}/functions/v1/paceiq-philosophy`;
const PACEIQ_GENERATE_PLAN_URL = `${SUPABASE_URL}/functions/v1/paceiq-generate-plan`;

export const PlanOnboardingScreen: FC = () => {
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<PlanStackParamList>>();
  const { activities, readinessRows } = useDashboardData();

  const [state, setState] = useState<OnboardingState>(DEFAULT_STATE);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [loadingSaved, setLoadingSaved] = useState(true);

  const [philoLoading, setPhiloLoading] = useState(false);
  const [philoError, setPhiloError] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  const [visibleAnalyseSteps, setVisibleAnalyseSteps] = useState(0);
  const [showRaceDatePicker, setShowRaceDatePicker] = useState(false);
  const [manualOverrideFitness, setManualOverrideFitness] = useState(false);

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

    supabase.auth
      .getSession()
      .then(({ data: { session } }) =>
        fetch(PACEIQ_PHILOSOPHY_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY } : {}),
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({ answers: state.answers }),
        }),
      )
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.primary) {
          setPhiloError(json.error ?? "Failed to get recommendation");
          return;
        }
        setState((prev) => ({
          ...prev,
          recommendedPhilosophy: json as PhilosophyRecommendation,
        }));
      })
      .catch((e) => setPhiloError(e instanceof Error ? e.message : "Network error"))
      .finally(() => setPhiloLoading(false));
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

  // --- Plan generation API (step 9) ---
  useEffect(() => {
    if (state.currentStep !== 9 || !state.selectedPhilosophy) return;
    if (state.generatedPlan) return;

    setPlanLoading(true);
    setPlanError(null);

    supabase.auth
      .getSession()
      .then(({ data: { session } }) =>
        fetch(PACEIQ_GENERATE_PLAN_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY } : {}),
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({
            answers: state.answers,
            philosophy: state.selectedPhilosophy,
          }),
        }),
      )
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.error) {
          setPlanError(json.error ?? "Failed to generate plan");
          return;
        }
        setState((prev) => ({ ...prev, generatedPlan: json as PlanResult }));
      })
      .catch((e) => setPlanError(e instanceof Error ? e.message : "Network error"))
      .finally(() => setPlanLoading(false));
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
        const [goalHours, goalMinutes, goalSeconds] = (() => {
          const parts = (answers.goalTime || "").split(":");
          return [parts[0] ?? "", parts[1] ?? "", parts[2] ?? ""];
        })();

        const handleTimePartChange = (part: "h" | "m" | "s", raw: string) => {
          const clean = raw.replace(/[^\d]/g, "").slice(0, 2);
          const parts = (answers.goalTime || "").split(":");
          const curH = parts[0] ?? "";
          const curM = parts[1] ?? "";
          const curS = parts[2] ?? "";
          const nextH = part === "h" ? clean : curH;
          const nextM = part === "m" ? clean : curM;
          const nextS = part === "s" ? clean : curS;
          const pad = (v: string) => (v && v.length ? v.padStart(2, "0") : "00");
          const final = `${pad(nextH)}:${pad(nextM)}:${pad(nextS)}`;
          updateAnswers({ goalTime: final });
        };
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

              {/* Goal time */}
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
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 6,
                  }}
                >
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
                      backgroundColor: colors.card,
                    }}
                  >
                    <Text
                      style={{ fontSize: 10, color: colors.mutedForeground }}
                    >
                      optional
                    </Text>
                  </View>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    gap: 8,
                    marginTop: 4,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.label, { marginTop: 0, marginBottom: 2 }]}>
                      HH
                    </Text>
                    <TextInput
                      keyboardType="number-pad"
                      style={[
                        styles.input,
                        {
                          height: 48,
                          fontSize: 15,
                          textAlign: "center",
                        },
                      ]}
                      value={goalHours}
                      onChangeText={(v) => handleTimePartChange("h", v)}
                      placeholder="00"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.label, { marginTop: 0, marginBottom: 2 }]}>
                      MM
                    </Text>
                    <TextInput
                      keyboardType="number-pad"
                      style={[
                        styles.input,
                        {
                          height: 48,
                          fontSize: 15,
                          textAlign: "center",
                        },
                      ]}
                      value={goalMinutes}
                      onChangeText={(v) => handleTimePartChange("m", v)}
                      placeholder="00"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.label, { marginTop: 0, marginBottom: 2 }]}>
                      SS
                    </Text>
                    <TextInput
                      keyboardType="number-pad"
                      style={[
                        styles.input,
                        {
                          height: 48,
                          fontSize: 15,
                          textAlign: "center",
                        },
                      ]}
                      value={goalSeconds}
                      onChangeText={(v) => handleTimePartChange("s", v)}
                      placeholder="00"
                    />
                  </View>
                </View>
                <Text
                  style={{
                    fontSize: 11,
                    color: colors.mutedForeground,
                    marginTop: 4,
                  }}
                >
                  Enter your target finish time
                </Text>
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
            {showRaceDatePicker && (
              <DateTimePicker
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                value={
                  answers.raceDate && !Number.isNaN(new Date(answers.raceDate).getTime())
                    ? new Date(answers.raceDate)
                    : new Date()
                }
                onChange={(event, date) => {
                  const e = event as DateTimePickerAndroidEvent;
                  if (Platform.OS === "android") {
                    if (e.type === "dismissed") {
                      setShowRaceDatePicker(false);
                      return;
                    }
                    setShowRaceDatePicker(false);
                  }
                  if (date) {
                    updateAnswers({ raceDate: format(date, "yyyy-MM-dd") });
                  }
                }}
              />
            )}
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
                  <Text style={[styles.label, { marginTop: 0 }]}>Your current fitness</Text>
                  {currentStats.ctl != null && (
                    <View style={styles.fitnessCardRow}>
                      <Text style={styles.fitnessCardLabel}>CTL (Fitness)</Text>
                      <Text style={styles.fitnessCardValue}>{Math.round(currentStats.ctl)}</Text>
                    </View>
                  )}
                  {currentStats.weeklyKm != null && (
                    <View style={styles.fitnessCardRow}>
                      <Text style={styles.fitnessCardLabel}>Weekly avg</Text>
                      <Text style={styles.fitnessCardValue}>{currentStats.weeklyKm} km</Text>
                    </View>
                  )}
                  {currentStats.lastRunLabel && (
                    <View style={styles.fitnessCardRow}>
                      <Text style={styles.fitnessCardLabel}>Last run</Text>
                      <Text style={styles.fitnessCardValue}>{currentStats.lastRunLabel}</Text>
                    </View>
                  )}
                  {currentStats.bestPace && (
                    <View style={styles.fitnessCardRow}>
                      <Text style={styles.fitnessCardLabel}>Best recent</Text>
                      <Text style={styles.fitnessCardValue}>{currentStats.bestPace}</Text>
                    </View>
                  )}
                  <Text style={[styles.smallMuted, { marginTop: 8 }]}>Pulled from intervals.icu</Text>
                </GlassCard>
                <TouchableOpacity
                  onPress={() => setManualOverrideFitness(true)}
                  activeOpacity={0.8}
                  style={{ marginTop: 8 }}
                >
                  <Text style={[styles.smallMuted, { textDecorationLine: "underline" }]}>
                    This looks wrong →
                  </Text>
                </TouchableOpacity>
                <Text style={[styles.subtitle, { marginTop: 16 }]}>
                  Your data looks good. Anything I should know that the numbers don&apos;t show?
                </Text>
                <GlassCard>
                  <TextInput
                    style={styles.textArea}
                    multiline
                    value={answers.currentFitnessNote}
                    onChangeText={(v) => updateAnswers({ currentFitnessNote: v })}
                    placeholder="E.g. I've been running 4x per week, easy runs feel comfortable at 5:30/km, but my left calf has been tight lately..."
                  />
                </GlassCard>
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
            <GlassCard>
              <Text style={styles.label}>Days per week</Text>
              <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
                {[3, 4, 5, 6, 7].map((d) => (
                  <TouchableOpacity
                    key={d}
                    activeOpacity={0.85}
                    style={[
                      {
                        width: 72,
                        height: 72,
                        borderRadius: 16,
                        alignItems: "center",
                        justifyContent: "center",
                        borderWidth: StyleSheet.hairlineWidth,
                        borderColor:
                          answers.daysPerWeek === d ? colors.primary : colors.border,
                        backgroundColor:
                          answers.daysPerWeek === d ? colors.primary : colors.card,
                      },
                    ]}
                    onPress={() => updateAnswers({ daysPerWeek: d })}
                  >
                    <Text
                      style={[
                        {
                          fontSize: 20,
                          fontWeight: "700",
                          color:
                            answers.daysPerWeek === d
                              ? colors.primaryForeground
                              : colors.mutedForeground,
                        },
                      ]}
                    >
                      {d}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.label}>Longest session available</Text>
              <View style={styles.row}>
                {[
                  { id: "45", label: "45 min" },
                  { id: "60", label: "1 hour" },
                  { id: "90", label: "90 min" },
                  { id: "120", label: "2+ hours" },
                ].map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    activeOpacity={0.85}
                    style={[
                      styles.pill,
                      answers.sessionLength === s.id && styles.pillSelected,
                    ]}
                    onPress={() => updateAnswers({ sessionLength: s.id })}
                  >
                    <Text
                      style={[
                        styles.pillText,
                        answers.sessionLength === s.id && { color: colors.primaryForeground },
                      ]}
                    >
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={{ marginTop: 12 }}>
                <ExpandableText
                  label="Any scheduling constraints?"
                  value={answers.schedulingNote}
                  onChange={(v) => updateAnswers({ schedulingNote: v })}
                  placeholder="E.g. I travel for work every other week, long runs only on Sundays..."
                />
              </View>
            </GlassCard>
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
            <GlassCard>
              <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 8, rowGap: 8 }}>
                {INJURIES.map((inj) => {
                  const selected = answers.injuries.includes(inj.id);
                  return (
                    <TouchableOpacity
                      key={inj.id}
                      activeOpacity={0.85}
                      style={[
                        {
                          flexBasis: inj.id === "none" ? "100%" : "48%",
                          borderRadius: 14,
                          paddingVertical: 10,
                          paddingHorizontal: 12,
                          borderWidth: StyleSheet.hairlineWidth,
                          borderColor: colors.border,
                          backgroundColor: colors.card,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                        },
                        selected && {
                          borderColor: inj.id === "none" ? "#22c55e" : colors.primary,
                          backgroundColor:
                            inj.id === "none" ? "#22c55e1a" : colors.primary + "14",
                        },
                      ]}
                      onPress={() => {
                        if (inj.id === "none") {
                          updateAnswers({ injuries: ["none"], injuryDetail: "" });
                          return;
                        }
                        const current = answers.injuries.filter((i) => i !== "none");
                        const next = current.includes(inj.id)
                          ? current.filter((i) => i !== inj.id)
                          : [...current, inj.id];
                        updateAnswers({ injuries: next.length ? next : [] });
                      }}
                    >
                      <Text style={{ fontSize: 18 }}>{inj.icon}</Text>
                      <Text
                        style={[
                          styles.pillText,
                          selected && { color: inj.id === "none" ? "#22c55e" : colors.foreground },
                        ]}
                      >
                        {inj.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {hasInjury && (
                <>
                  <Text style={styles.label}>{injuryPrompt}</Text>
                  <TextInput
                    style={styles.textArea}
                    multiline
                    value={answers.injuryDetail}
                    onChangeText={(v) => updateAnswers({ injuryDetail: v })}
                    placeholder="When did it start, how bad is it, what have you tried..."
                  />
                  {!answers.injuryDetail.trim() && (
                    <Text style={[styles.smallMuted, { color: "#f97316" }]}>
                      Required — this protects you from a plan that makes it worse.
                    </Text>
                  )}
                </>
              )}
            </GlassCard>
          </>
        );
      }
      case 7:
        return (
          <>
            <Text style={styles.title}>How experienced are you?</Text>
            <GlassCard>
              {[
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
                  sub: "1–3 years, getting serious",
                },
                {
                  id: "experienced",
                  emoji: "🏃",
                  title: "Experienced runner",
                  sub: "3–5 years, done races",
                },
                {
                  id: "competitive",
                  emoji: "🏆",
                  title: "Competitive runner",
                  sub: "5+ years, racing regularly",
                },
              ].map((lvl) => {
                const selected = answers.experienceLevel === lvl.id;
                return (
                  <TouchableOpacity
                    key={lvl.id}
                    activeOpacity={0.85}
                    style={[
                      styles.card,
                      { marginBottom: 8 },
                      selected && {
                        borderWidth: StyleSheet.hairlineWidth,
                        borderColor: colors.primary,
                        backgroundColor: colors.primary + "10",
                      },
                    ]}
                    onPress={() => updateAnswers({ experienceLevel: lvl.id })}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Text style={{ fontSize: 24, marginRight: 10 }}>{lvl.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: "600",
                            color: selected ? colors.primary : colors.foreground,
                          }}
                        >
                          {lvl.title}
                        </Text>
                        <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
                          {lvl.sub}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
              {answers.experienceLevel ? (
                <>
                  <Text style={styles.label}>What&apos;s worked well or blown up in past training?</Text>
                  <TextInput
                    style={styles.textArea}
                    multiline
                    value={answers.trainingHistoryNote}
                    onChangeText={(v) => updateAnswers({ trainingHistoryNote: v })}
                    placeholder="E.g. I respond well to high volume but always get injured when I add speed too fast..."
                  />
                </>
              ) : null}
            </GlassCard>
          </>
        );
      case 8: {
        const rec = state.recommendedPhilosophy;
        if (philoLoading) {
          useEffect(() => {
            setVisibleAnalyseSteps(0);
            let i = 0;
            const id = setInterval(() => {
              i += 1;
              setVisibleAnalyseSteps(i);
              if (i >= ANALYSE_STEPS.length) clearInterval(id);
            }, 700);
            return () => clearInterval(id);
          }, []);

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
              <Text style={styles.title}>Building your plan.</Text>
              <Text style={styles.subtitle}>This usually takes 10–15 seconds.</Text>
              <GlassCard>
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                  <ActivityIndicator
                    size="small"
                    color={colors.primary}
                    style={{ marginRight: 8 }}
                  />
                  <Text style={{ fontSize: 13, color: colors.mutedForeground }}>
                    Building sessions and balancing load…
                  </Text>
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
        if (!state.generatedPlan) return null;
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
      return !!answers.experienceLevel;
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

