import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Check, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveSessionStructureForWorkout } from "@/lib/training/sessionStructureUi";
import { SessionCard } from "@/components/training/SessionCard";
import { normalizePaceDisplay } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ActivityDetail } from "@/hooks/useActivityDetail";

export function ActivityPlannedSessionBlock({ activity }: { activity: ActivityDetail }) {
  const wid = activity.planned_workout_id;
  const { data: workout, isLoading } = useQuery({
    queryKey: ["training-plan-workout", wid],
    enabled: !!wid,
    queryFn: async () => {
      const { data, error } = await supabase.from("training_plan_workout").select("*").eq("id", wid!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (!wid) return null;

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-muted/30 p-4 animate-pulse h-24" />
    );
  }

  if (!workout) return null;

  const struct = resolveSessionStructureForWorkout(workout as Parameters<typeof resolveSessionStructureForWorkout>[0]);
  const plannedKm = workout.distance_km != null ? Number(workout.distance_km) : null;
  const actualKm = activity.distance_km;
  const deltaPct =
    plannedKm != null && plannedKm > 0.01 ? Math.round(((actualKm - plannedKm) / plannedKm) * 100) : null;
  const onTarget = deltaPct != null && Math.abs(deltaPct) <= 15;
  const shortRun = deltaPct != null && deltaPct < -20;

  const title = workout.name ?? workout.type ?? activity.planned_session_label ?? "Planned session";
  const pacePlanned = workout.target_pace != null ? String(workout.target_pace) : null;

  return (
    <div className="mt-4 rounded-xl border border-border bg-secondary/20 overflow-hidden">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-4 pt-3">
        Planned session
      </p>
      <div className="px-4 pb-3 space-y-2">
        <div className="flex items-start gap-2">
          {onTarget ? (
            <Check className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
          ) : (
            <span className="w-4 h-4 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Planned:{" "}
              {plannedKm != null ? `${Math.round(plannedKm * 10) / 10} km` : "—"}
              {pacePlanned && ` @ ${pacePlanned}`}
            </p>
            <p className="text-xs text-muted-foreground">
              Actual: {Math.round(actualKm * 10) / 10} km
              {activity.avg_pace && (
                <>
                  {" "}
                  @ {normalizePaceDisplay(activity.avg_pace) || activity.avg_pace}
                </>
              )}
              {deltaPct != null && (
                <span
                  className={cn(
                    " ml-1 font-medium",
                    shortRun ? "text-amber-600 dark:text-amber-400" : onTarget ? "text-green-600 dark:text-green-400" : "text-muted-foreground",
                  )}
                >
                  ({deltaPct > 0 ? "+" : ""}
                  {deltaPct}%)
                </span>
              )}
            </p>
            {onTarget && (
              <p className="text-xs text-green-600 dark:text-green-400 font-medium mt-1">On target</p>
            )}
            {shortRun && (
              <Link
                to={`/coach?from=activity&session=${encodeURIComponent(`My ${title} was shorter than planned (${deltaPct}% vs plan).`)}`}
                className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium mt-2 hover:underline"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                Ask Coach Cade about this run →
              </Link>
            )}
          </div>
        </div>

        {struct ? (
          <SessionCard
            workout={{
              id: String(workout.id),
              scheduled_date: workout.date,
              session_type: String(workout.type ?? "easy"),
              name: workout.name,
              description: workout.description ?? "",
              distance_km: workout.distance_km,
              duration_min: workout.duration_minutes,
              pace_target: workout.target_pace,
              target_hr_zone: workout.target_hr_zone,
              key_focus: workout.key_focus,
              session_structure: struct,
            }}
            compact
            detailsOnly
            className="border-0 bg-transparent shadow-none p-0"
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            <Link to="/plan" className="text-primary hover:underline">
              View full session details
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
