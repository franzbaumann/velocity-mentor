import { useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { enrichTrainingPlanWorkoutsFromLibrary } from "@/lib/training/enrichPlanSessions";
import type {
  CompetitionSeason,
  SeasonRace,
  SeasonWithRaces,
  SeasonPhase,
  RacePriority,
} from "@/lib/season/types";
import {
  calculateSeasonPhase,
  getNextRace,
  getNextARace,
  calculateTaperStart,
  daysUntil,
  weeksRemaining,
  getPastUnloggedRaces,
} from "@/lib/season/periodisation";

const QK = ["competition-season"] as const;

export function useSeason() {
  const qc = useQueryClient();

  const { data: activeSeason, isLoading } = useQuery({
    queryKey: QK,
    queryFn: async (): Promise<SeasonWithRaces | null> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return null;

      const { data: season } = await (supabase as ReturnType<typeof supabase.from>)
        .from("competition_season")
        .select("*")
        .eq("user_id", session.user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle() as { data: CompetitionSeason | null };

      if (!season) return null;

      const { data: races } = await (supabase as ReturnType<typeof supabase.from>)
        .from("season_race")
        .select("*")
        .eq("season_id", season.id)
        .order("date", { ascending: true }) as { data: SeasonRace[] | null };

      return { ...season, races: races ?? [] };
    },
    staleTime: 60_000,
  });

  const nextRace = useMemo(() => (activeSeason ? getNextRace(activeSeason.races) : null), [activeSeason]);
  const nextARace = useMemo(() => (activeSeason ? getNextARace(activeSeason.races) : null), [activeSeason]);
  const seasonPhase: SeasonPhase = useMemo(
    () => (activeSeason ? calculateSeasonPhase(activeSeason, activeSeason.races) : "base"),
    [activeSeason],
  );
  const pastUnlogged = useMemo(() => (activeSeason ? getPastUnloggedRaces(activeSeason.races) : []), [activeSeason]);

  const raceCounts = useMemo(() => {
    if (!activeSeason) return { A: 0, B: 0, C: 0 };
    const r = activeSeason.races;
    return {
      A: r.filter((x) => x.priority === "A").length,
      B: r.filter((x) => x.priority === "B").length,
      C: r.filter((x) => x.priority === "C").length,
    };
  }, [activeSeason]);

  const invalidate = useCallback(() => qc.invalidateQueries({ queryKey: QK }), [qc]);

  const createSeasonMutation = useMutation({
    mutationFn: async ({
      season,
      races,
      endGoalRaceIndex,
      userId,
    }: {
      season: Omit<CompetitionSeason, "id" | "created_at">;
      races: Omit<SeasonRace, "id" | "season_id" | "created_at">[];
      endGoalRaceIndex?: number;
      userId: string;
    }) => {
      const { data: s, error: se } = await (supabase as ReturnType<typeof supabase.from>)
        .from("competition_season")
        .insert(season)
        .select()
        .single();
      if (se || !s) throw se ?? new Error("Failed to create season");
      const created = s as CompetitionSeason;

      let insertedRaces: SeasonRace[] = [];
      if (races.length > 0) {
        const rows = races.map((r) => ({ ...r, season_id: created.id, user_id: userId }));
        const { data: inserted, error: re } = await (supabase as ReturnType<typeof supabase.from>)
          .from("season_race")
          .insert(rows)
          .select();
        if (re) throw re;
        insertedRaces = (inserted ?? []) as SeasonRace[];
      }

      const aRaces = insertedRaces.filter((r) => r.priority === "A");
      const defaultEndGoal = aRaces.length > 0
        ? aRaces[aRaces.length - 1]
        : insertedRaces[insertedRaces.length - 1];
      const endGoalRace = endGoalRaceIndex != null && insertedRaces[endGoalRaceIndex]
        ? insertedRaces[endGoalRaceIndex]
        : defaultEndGoal;

      let planGenerated = false;
      if (endGoalRace && insertedRaces.length > 0) {
        try {
          const { data, error } = await supabase.functions.invoke("season-generate-plan", {
            body: {
              season_id: created.id,
              end_goal_race_id: endGoalRace.id,
            },
          });
          if (!error && !(data as { error?: string })?.error) {
            planGenerated = true;
            const pid = (data as { plan_id?: string })?.plan_id;
            if (pid) {
              try {
                await enrichTrainingPlanWorkoutsFromLibrary(pid);
              } catch (enrichErr) {
                console.warn("[useSeason] enrichPlanSessions:", enrichErr);
              }
            }
          } else {
            console.warn("[useSeason] Plan generation failed:", error ?? (data as { error?: string })?.error);
          }
        } catch (e) {
          console.warn("[useSeason] Plan generation failed:", e);
        }
      }

      return { season: created, planGenerated };
    },
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["training-plan"] });
    },
  });

  const addRaceMutation = useMutation({
    mutationFn: async (race: Omit<SeasonRace, "id" | "created_at">) => {
      const { error } = await (supabase as ReturnType<typeof supabase.from>)
        .from("season_race")
        .insert(race);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const updateRaceMutation = useMutation({
    mutationFn: async ({ id, ...fields }: { id: string } & Partial<SeasonRace>) => {
      const { error } = await (supabase as ReturnType<typeof supabase.from>)
        .from("season_race")
        .update(fields)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteRaceMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as ReturnType<typeof supabase.from>)
        .from("season_race")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const logRaceResult = useCallback(
    (raceId: string, result: { actual_time?: string; actual_place?: number; notes?: string; status?: string }) => {
      updateRaceMutation.mutate({ id: raceId, ...result, status: result.status ?? "completed" } as Parameters<typeof updateRaceMutation.mutate>[0]);
    },
    [updateRaceMutation],
  );

  const deleteSeasonMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as ReturnType<typeof supabase.from>)
        .from("competition_season")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return {
    activeSeason,
    loading: isLoading,
    nextRace,
    nextARace,
    seasonPhase,
    raceCounts,
    pastUnlogged,

    createSeason: createSeasonMutation.mutateAsync,
    isCreating: createSeasonMutation.isPending,
    addRace: addRaceMutation.mutate,
    updateRace: updateRaceMutation.mutate,
    deleteRace: deleteRaceMutation.mutate,
    logRaceResult,
    deleteSeason: deleteSeasonMutation.mutate,
    deleteSeasonAsync: deleteSeasonMutation.mutateAsync,

    nextRaceTaperStart: nextRace ? calculateTaperStart(nextRace.date, nextRace.priority) : null,
    nextRaceDaysAway: nextRace ? daysUntil(nextRace.date) : null,
    weeksRemaining: activeSeason ? weeksRemaining(activeSeason.end_date) : 0,
  };
}
