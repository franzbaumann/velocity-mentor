import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { supabase } from "../shared/supabase";
import { getLocalDateString } from "../lib/date";
import {
  calculateZonePaces,
  findBestEffort,
  formatRaceTime,
  predictRaceTime,
} from "../lib/race-prediction";

const RACE_DISTANCES = [
  { km: 5, label: "5K" },
  { km: 10, label: "10K" },
  { km: 21.0975, label: "Half Marathon" },
  { km: 42.195, label: "Marathon" },
] as const;

const STALE_DAYS = 7;

export type ActivityForPrediction = {
  distance_km: number | null;
  duration_seconds: number | null;
  date: string;
};

export type RacePredictionResult = {
  time: string;
  zone2: string;
  threshold: string;
  vo2max: string;
  ctl: number;
  best: { distanceKm: number; timeSeconds: number; date: string };
  allPredictions: Array< { label: string; km: number; time: number }>;
};

function getLatestBatch(rows: Array<{ predicted_at: string }>) {
  if (!rows.length) return null;
  const latestDate = rows[0].predicted_at;
  return rows.filter((r) => r.predicted_at === latestDate);
}

function shouldRecalculate(
  batch: Array<{ predicted_at: string }> | null,
  latestActivityDate: string | null,
): boolean {
  if (!batch || batch.length === 0) return true;
  const predictedAt = batch[0].predicted_at;
  const predDate = new Date(predictedAt);
  const now = new Date();
  const daysSince = (now.getTime() - predDate.getTime()) / (24 * 60 * 60 * 1000);
  if (daysSince > STALE_DAYS) return true;
  if (latestActivityDate && latestActivityDate > predictedAt) return true;
  return false;
}

async function loadLatestPredictions(userId: string) {
  const { data, error } = await supabase
    .from("race_predictions")
    .select("id, predicted_at, goal_distance, predicted_time_seconds, ctl_at_prediction, zone2_pace, threshold_pace, vo2max_pace")
    .eq("user_id", userId)
    .order("predicted_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    predicted_at: string;
    goal_distance: string | null;
    predicted_time_seconds: number | null;
    ctl_at_prediction: number | null;
    zone2_pace: string | null;
    threshold_pace: string | null;
    vo2max_pace: string | null;
  }>;
  const batch = getLatestBatch(rows);
  return batch;
}

type SavePayload = {
  userId: string;
  ctl: number;
  best: { distanceKm: number; timeSeconds: number; date: string };
  allPredictions: Array<{ label: string; km: number; time: number }>;
  goalRaceKm: number;
};

async function savePredictions(payload: SavePayload) {
  const { userId, ctl, best, allPredictions, goalRaceKm } = payload;
  const predictedAt = getLocalDateString(new Date());
  const goalPaces = calculateZonePaces(
    allPredictions.find((p) => p.km === goalRaceKm)?.time ?? 0,
    goalRaceKm,
  );
  const rows = allPredictions.map((p) => ({
    user_id: userId,
    predicted_at: predictedAt,
    goal_distance: p.label,
    predicted_time_seconds: Math.round(p.time),
    ctl_at_prediction: ctl,
    zone2_pace: p.km === goalRaceKm ? goalPaces.zone2 : null,
    threshold_pace: p.km === goalRaceKm ? goalPaces.threshold : null,
    vo2max_pace: p.km === goalRaceKm ? goalPaces.vo2max : null,
  }));
  const { error } = await supabase.from("race_predictions").insert(rows);
  if (error) throw error;
}

export function useRacePredictions(
  activities: ActivityForPrediction[] | null | undefined,
  ctl: number | null | undefined,
  goalRaceKm: number,
) {
  const queryClient = useQueryClient();

  const { data: savedBatch, isLoading: loadingSaved } = useQuery({
    queryKey: ["race_predictions"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      return loadLatestPredictions(user.id);
    },
    staleTime: 60 * 1000,
  });

  const saveMutation = useMutation({
    mutationFn: savePredictions,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["race_predictions"] });
    },
  });

  const latestActivityDate = useMemo(() => {
    if (!activities?.length) return null;
    return activities.reduce((max, a) => (a.date > max ? a.date : max), activities[0].date);
  }, [activities]);

  const recalc = useMemo(() => shouldRecalculate(savedBatch ?? null, latestActivityDate), [savedBatch, latestActivityDate]);

  const computed = useMemo((): RacePredictionResult | null => {
    if (!activities?.length || ctl == null || !Number.isFinite(ctl) || ctl <= 0 || goalRaceKm <= 0) return null;
    const best = findBestEffort(activities);
    if (!best) return null;
    const baselineCTL = Math.max(ctl * 0.7, 20);
    const predictedSeconds = predictRaceTime(best.timeSeconds, best.distanceKm, goalRaceKm, ctl, baselineCTL);
    const valid = Number.isFinite(predictedSeconds) && predictedSeconds > 0 && predictedSeconds < 86400 * 2;
    const paces = valid ? calculateZonePaces(predictedSeconds, goalRaceKm) : { zone2: "--", threshold: "--", vo2max: "--" };
    const allPredictions = RACE_DISTANCES.map(({ km, label }) => ({
      label,
      km,
      time: predictRaceTime(best.timeSeconds, best.distanceKm, km, ctl, baselineCTL),
    }));
    return {
      time: formatRaceTime(predictedSeconds),
      zone2: paces.zone2,
      threshold: paces.threshold,
      vo2max: paces.vo2max,
      ctl,
      best,
      allPredictions,
    };
  }, [activities, ctl, goalRaceKm]);

  const racePrediction = useMemo((): RacePredictionResult | null => {
    if (recalc && computed) return computed;
    const batch = savedBatch ?? null;
    if (!batch?.length) return computed ?? null;
    const byLabel = new Map(batch.map((r) => [r.goal_distance ?? "", r]));
    const allPredictions = RACE_DISTANCES.map(({ km, label }) => {
      const row = byLabel.get(label);
      const time = row?.predicted_time_seconds ?? 0;
      return { label, km, time };
    }).filter((p) => p.time > 0);
    if (allPredictions.length === 0) return computed ?? null;
    const ctlAt = batch[0].ctl_at_prediction ?? 0;
    const goalRow = allPredictions.find((p) => p.km === goalRaceKm);
    const goalTime = goalRow?.time ?? allPredictions[0]?.time ?? 0;
    const paces =
      goalTime > 0 && goalRaceKm > 0
        ? calculateZonePaces(goalTime, goalRaceKm)
        : { zone2: "--", threshold: "--", vo2max: "--" };
    return {
      time: formatRaceTime(goalTime),
      zone2: paces.zone2,
      threshold: paces.threshold,
      vo2max: paces.vo2max,
      ctl: ctlAt,
      best: { distanceKm: 0, timeSeconds: 0, date: batch[0].predicted_at },
      allPredictions,
    };
  }, [recalc, computed, savedBatch, goalRaceKm]);

  const savedSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    if (!recalc || !computed || saveMutation.isPending) return;
    const sig = `${computed.time}-${computed.ctl}-${computed.allPredictions.map((p) => p.time).join(",")}`;
    if (savedSignatureRef.current === sig) return;
    savedSignatureRef.current = sig;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      saveMutation.mutate({
        userId: user.id,
        ctl: computed.ctl,
        best: computed.best,
        allPredictions: computed.allPredictions,
        goalRaceKm,
      });
    });
  }, [recalc, computed, goalRaceKm, saveMutation]);

  return {
    racePrediction,
    isLoading: loadingSaved,
  };
}
