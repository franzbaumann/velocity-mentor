import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../shared/supabase";

/** Full athlete_profile row (all columns). All fields optional to support select("*") and future columns. */
export type AthleteProfile = {
  id?: string | null;
  user_id: string;
  name?: string;
  created_at?: string | null;
  updated_at?: string | null;
  narrative?: string | null;
  vdot?: number | null;
  max_hr?: number | null;
  resting_hr?: number | null;
  preferred_longrun_day?: string | null;
  training_philosophy?: string | null;
  goal_race?: unknown;
  race_history?: unknown;
  onboarding_complete?: boolean | null;
  onboarding_answers?: unknown;
  recommended_philosophy?: string | null;
  goal_race_name?: string | null;
  goal_race_date?: string | null;
  goal_time?: string | null;
  goal_distance?: string | null;
  days_per_week?: number | null;
  injury_history_text?: string | null;
  vo2max?: number | null;
  lactate_threshold_hr?: number | null;
  lactate_threshold_pace?: string | null;
  vlamax?: number | null;
  max_hr_measured?: number | null;
  lab_test_date?: string | null;
  lab_name?: string | null;
  /** LT1 heart rate (intervals.icu / lab) */
  lt1_hr?: number | null;
  /** LT1 pace (e.g. "5:30") */
  lt1_pace?: string | null;
  /** Zone source: e.g. "hr_formula", "lthr", etc. */
  zone_source?: string | null;
};

export interface OnboardingAnswers {
  mainGoal?: string;
  goalMore?: string;
  raceDate?: string;
  goalTime?: string;
  goalDistance?: string;
  raceMore?: string;
  fitnessKm?: number;
  recentRaceType?: string;
  recentRaceTime?: string;
  fitnessMore?: string;
  daysPerWeek?: number;
  longestDay?: string;
  availabilityMore?: string;
  injuries?: string[];
  injuryDetails?: string;
  trainingHistory?: string;
  historyMore?: string;
  selectedPhilosophy?: string;
}

export function useAthleteProfile() {
  const queryClient = useQueryClient();

  const {
    data: profile,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["athlete_profile"],
    queryFn: async (): Promise<AthleteProfile | null> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error: err } = await supabase
        .from("athlete_profile")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (err) throw err;
      return data as AthleteProfile | null;
    },
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: Record<string, unknown>) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error: err } = await supabase
        .from("athlete_profile")
        .upsert(
          {
            user_id: user.id,
            ...updates,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
      if (err) throw err;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["athlete_profile"] });
    },
  });

  const completeOnboardingMutation = useMutation({
    mutationFn: async (answers: OnboardingAnswers) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const updates: Record<string, unknown> = {
        user_id: user.id,
        onboarding_complete: true,
        onboarding_answers: answers,
        updated_at: new Date().toISOString(),
      };
      if (answers.goalDistance)
        updates.goal_race_name = `${answers.goalDistance}${answers.goalTime ? ` - ${answers.goalTime}` : ""}`;
      if (answers.raceDate) updates.goal_race_date = answers.raceDate;
      if (answers.goalTime) updates.goal_time = answers.goalTime;
      if (answers.goalDistance) updates.goal_distance = answers.goalDistance;
      if (answers.daysPerWeek != null) updates.days_per_week = answers.daysPerWeek;
      if (answers.injuryDetails) updates.injury_history_text = answers.injuryDetails;
      const { error: err } = await supabase
        .from("athlete_profile")
        .upsert(updates, { onConflict: "user_id" });
      if (err) throw err;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["athlete_profile"] });
    },
  });

  return {
    profile,
    isLoading,
    error: error ?? null,
    refetch,
    onboardingComplete: profile?.onboarding_complete ?? false,
    onboardingAnswers: (profile?.onboarding_answers as OnboardingAnswers | null) ?? null,
    update: updateMutation.mutate,
    completeOnboarding: completeOnboardingMutation.mutateAsync,
    isUpdating: updateMutation.isPending || completeOnboardingMutation.isPending,
  };
}
