import type { ReadinessRow } from "@/hooks/useReadiness";
import type { ActivityRow } from "@/hooks/useActivities";

export interface OnboardingV2Answers {
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
  doubleRunsEnabled: boolean;
  doubleRunDays: string[];
  doubleRunDuration: number;
  /** "this_week" = first workouts from firstSchedulableDate (never earlier days), "next_week" = start next Monday */
  planStartWhen: "this_week" | "next_week";
  /** When planStartWhen is "this_week": 0 = from today, 1 = from tomorrow (local calendar). */
  planFirstDayOffset: 0 | 1;
  /** monday..sunday — preferred long run day */
  preferredLongRunDay: string;
  /** monday..sunday — primary quality session (tempo/intervals; not the long run if volume allows) */
  preferredQualityDay: string;
}

export interface IntervalsData {
  isConnected: boolean;
  activities: ActivityRow[];
  readiness: ReadinessRow[];
}

export interface PhilosophyRecommendation {
  primary: {
    philosophy: string;
    reason: string;
    confidence: number;
  };
  alternatives: {
    philosophy: string;
    reason: string;
  }[];
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

export interface OnboardingV2State {
  currentStep: number;
  answers: OnboardingV2Answers;
  recommendedPhilosophy: PhilosophyRecommendation | null;
  selectedPhilosophy: string | null;
  generatedPlan: PlanResult | null;
}

export interface StepProps {
  answers: OnboardingV2Answers;
  onUpdate: (updates: Partial<OnboardingV2Answers>) => void;
  onNext: () => void;
  onBack: () => void;
}

export interface StepWithDataProps extends StepProps {
  intervalsData: IntervalsData;
}

export const DEFAULT_ANSWERS: OnboardingV2Answers = {
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
  doubleRunsEnabled: false,
  doubleRunDays: [],
  doubleRunDuration: 0,
  planStartWhen: "next_week",
  planFirstDayOffset: 0,
  preferredLongRunDay: "sunday",
  preferredQualityDay: "thursday",
};

export const DEFAULT_STATE: OnboardingV2State = {
  currentStep: 1,
  answers: { ...DEFAULT_ANSWERS },
  recommendedPhilosophy: null,
  selectedPhilosophy: null,
  generatedPlan: null,
};

export const GOALS_NEED_RACE = new Set(["faster_race", "first_marathon", "shorter_faster"]);
export const GOALS_NEED_SEASON = new Set(["plan_season"]);

export const STEP_ORDER_WITH_RACE = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export const STEP_ORDER_WITHOUT_RACE = [1, 2, 4, 5, 6, 7, 8, 9] as const;
/** Same as WITHOUT_RACE but step 9 is "Create season" instead of plan generation */
export const STEP_ORDER_SEASON = [1, 2, 4, 5, 6, 7, 8, 9] as const;

export function getStepOrder(goal: string): readonly number[] {
  if (GOALS_NEED_RACE.has(goal)) return STEP_ORDER_WITH_RACE;
  if (GOALS_NEED_SEASON.has(goal)) return STEP_ORDER_SEASON;
  return STEP_ORDER_WITHOUT_RACE;
}

export function getUserStepLabel(internalStep: number, goal: string): { num: number; total: number } | null {
  const fullWidth = [1, 8, 9];
  if (fullWidth.includes(internalStep)) return null;
  const userSteps = getStepOrder(goal).filter((s) => !fullWidth.includes(s));
  const idx = userSteps.indexOf(internalStep);
  if (idx === -1) return null;
  return { num: idx + 1, total: userSteps.length };
}
