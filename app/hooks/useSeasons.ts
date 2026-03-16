import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../shared/supabase";
import type { Database } from "../lib/supabase-types";

type SeasonRow = Database["public"]["Tables"]["seasons"]["Row"];
type SeasonInsert = Database["public"]["Tables"]["seasons"]["Insert"];
type SeasonRaceRow = Database["public"]["Tables"]["season_races"]["Row"];
type SeasonRaceInsert = Database["public"]["Tables"]["season_races"]["Insert"];

export type Season = SeasonRow;
export type SeasonRace = SeasonRaceRow;

export type SeasonWithRaces = Season & { races: SeasonRace[] };

async function getSeasons(): Promise<Season[]> {
  const { data, error } = await supabase
    .from("seasons")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

async function getSeasonWithRaces(seasonId: string): Promise<SeasonWithRaces | null> {
  const { data: season, error: seasonErr } = await supabase
    .from("seasons")
    .select("*")
    .eq("id", seasonId)
    .maybeSingle();
  if (seasonErr || !season) return null;
  const { data: races, error: racesErr } = await supabase
    .from("season_races")
    .select("*")
    .eq("season_id", seasonId)
    .order("race_date", { ascending: true });
  if (racesErr) throw racesErr;
  return { ...season, races: races ?? [] };
}

export function useSeasons() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["seasons"],
    queryFn: getSeasons,
  });
  const createSeason = useMutation({
    mutationFn: async (row: SeasonInsert) => {
      const { data, error } = await supabase.from("seasons").insert(row).select().single();
      if (error) throw error;
      return data as Season;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["seasons"] });
    },
  });
  const deleteSeason = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("seasons").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["seasons"] });
      qc.removeQueries({ queryKey: ["season", undefined!] });
    },
  });
  return {
    seasons: list.data ?? [],
    isLoading: list.isLoading,
    refetch: list.refetch,
    createSeason,
    deleteSeason,
  };
}

export function useSeasonWithRaces(seasonId: string | null) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["season", seasonId],
    queryFn: () => getSeasonWithRaces(seasonId!),
    enabled: !!seasonId,
  });
  const addRace = useMutation({
    mutationFn: async (row: Omit<SeasonRaceInsert, "id" | "created_at">) => {
      const { data, error } = await supabase.from("season_races").insert(row).select().single();
      if (error) throw error;
      return data as SeasonRace;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["season", vars.season_id] });
      qc.invalidateQueries({ queryKey: ["seasons"] });
    },
  });
  const deleteRace = useMutation({
    mutationFn: async ({ id, seasonId }: { id: string; seasonId: string }) => {
      const { error } = await supabase.from("season_races").delete().eq("id", id);
      if (error) throw error;
      return { id, seasonId };
    },
    onSuccess: (_, { seasonId }) => {
      qc.invalidateQueries({ queryKey: ["season", seasonId] });
      qc.invalidateQueries({ queryKey: ["seasons"] });
    },
  });
  const updateRace = useMutation({
    mutationFn: async ({
      id,
      seasonId,
      updates,
    }: {
      id: string;
      seasonId: string;
      updates: Partial<Pick<SeasonRace, "name" | "race_date" | "distance" | "venue" | "priority" | "goal_time">>;
    }) => {
      const { data, error } = await supabase
        .from("season_races")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { seasonId }) => {
      qc.invalidateQueries({ queryKey: ["season", seasonId] });
    },
  });
  return {
    season: query.data ?? null,
    isLoading: query.isLoading,
    refetch: query.refetch,
    addRace,
    deleteRace,
    updateRace,
  };
}
