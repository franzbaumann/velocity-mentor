import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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

  const { data: profile, isLoading } = useQuery({
    queryKey: ["athlete_profile"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      if (!user) return null;
      const { data, error } = await supabase
        .from("athlete_profile")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: Record<string, unknown>) => {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("athlete_profile")
        .upsert(
          { user_id: user.id, ...updates, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["athlete_profile"] });
    },
  });

  const completeOnboarding = useMutation({
    mutationFn: async (answers: OnboardingAnswers) => {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      if (!user) throw new Error("Not authenticated");
      const updates: Record<string, unknown> = {
        user_id: user.id,
        onboarding_complete: true,
        onboarding_answers: answers,
        updated_at: new Date().toISOString(),
      };
      if (answers.goalDistance) updates.goal_race_name = `${answers.goalDistance}${answers.goalTime ? ` - ${answers.goalTime}` : ""}`;
      if (answers.raceDate) updates.goal_race_date = answers.raceDate;
      if (answers.goalTime) updates.goal_time = answers.goalTime;
      if (answers.goalDistance) updates.goal_distance = answers.goalDistance;
      if (answers.daysPerWeek != null) updates.days_per_week = answers.daysPerWeek;
      if (answers.injuryDetails) updates.injury_history_text = answers.injuryDetails;
      const { error } = await supabase.from("athlete_profile").upsert(updates, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["athlete_profile"] });
    },
  });

  return {
    profile,
    isLoading,
    onboardingComplete: profile?.onboarding_complete ?? false,
    onboardingAnswers: (profile?.onboarding_answers as OnboardingAnswers | null) ?? null,
    update: updateMutation.mutate,
    completeOnboarding: completeOnboarding.mutateAsync,
    isUpdating: updateMutation.isPending || completeOnboarding.isPending,
  };
}
