import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, Target, BarChart2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SessionStructureStored, ControlToolUi } from "@/lib/training/sessionStructureUi";
import { normalizePaceDisplay, plannedWorkoutDurationMinutes, plannedWorkoutSummary } from "@/lib/format";
import { sessionDescriptionSubtitle, sessionTypeBadgeClass } from "@/lib/training/sessionDisplay";
import { format, parseISO } from "date-fns";
import { Link } from "react-router-dom";

export type TrainingPlanWorkoutForCard = {
  id: string;
  scheduled_date: string | null;
  session_type: string;
  name?: string | null;
  description: string;
  distance_km: number | null;
  duration_min: number | null;
  pace_target: string | null;
  target_hr_zone?: number | null;
  key_focus?: string | null;
  session_structure?: SessionStructureStored | null;
};

export interface SessionCardProps {
  workout: TrainingPlanWorkoutForCard;
  /** Controlled expanded; if omitted, uses internal toggle */
  isExpanded?: boolean;
  onToggle?: () => void;
  onMove?: () => void;
  onAskCoach?: () => void;
  compact?: boolean;
  /** When true, always show session details (no collapse); omit “Show session” affordance */
  alwaysExpanded?: boolean;
  /** Only the warmup / main / cooldown blocks (no title row) */
  detailsOnly?: boolean;
  className?: string;
}

function controlBadge(tool: ControlToolUi) {
  switch (tool) {
    case "pace":
      return (
        <span className="text-xs font-medium rounded-md px-2 py-0.5 bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
          Pace
        </span>
      );
    case "heart_rate":
      return (
        <span className="text-xs font-medium rounded-md px-2 py-0.5 bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300">
          Heart rate
        </span>
      );
    default:
      return (
        <span className="text-xs font-medium rounded-md px-2 py-0.5 bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300">
          RPE
        </span>
      );
  }
}

function controlDescription(struct: SessionStructureStored): string {
  const m = struct.main;
  if (struct.control_tool === "pace" && m.continuous?.pace) {
    return `Hold ~${m.continuous.pace} — ${struct.key_focus || "steady aerobic effort"}`;
  }
  if (struct.control_tool === "heart_rate" && m.continuous?.hr_zone) {
    return `Stay in ${m.continuous.hr_zone} — ${struct.key_focus || "conversational to steady"}`;
  }
  if (struct.control_tool === "rpe" && m.continuous?.rpe != null) {
    return `Target RPE ~${m.continuous.rpe} — ${struct.key_focus || "honest effort"}`;
  }
  return struct.key_focus || struct.purpose || "";
}

function RepCheckRow({
  workoutId,
  reps,
}: {
  workoutId: string;
  reps: number;
}) {
  const storageKey = `cade-session-reps-${workoutId}`;
  const [done, setDone] = useState<boolean[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as boolean[];
        if (Array.isArray(parsed) && parsed.length === reps) return parsed;
      }
    } catch {
      /* ignore */
    }
    return Array.from({ length: reps }, () => false);
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(done));
    } catch {
      /* ignore */
    }
  }, [done, storageKey]);

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {done.map((checked, i) => (
        <button
          key={i}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setDone((prev) => {
              const next = [...prev];
              next[i] = !next[i];
              return next;
            });
          }}
          className={cn(
            "text-xs flex items-center gap-1 rounded-full border px-2 py-0.5 transition-colors",
            checked
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:border-primary/40",
          )}
        >
          <span
            className={cn(
              "inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border",
              checked ? "border-primary bg-primary" : "border-muted-foreground/40",
            )}
          >
            {checked ? <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" /> : null}
          </span>
          Rep {i + 1}
        </button>
      ))}
    </div>
  );
}

function SessionDetailBody({
  struct,
  workout,
  compact,
  onMove,
  onAskCoach,
  detailsOnly,
}: {
  struct: SessionStructureStored;
  workout: TrainingPlanWorkoutForCard;
  compact: boolean;
  onMove?: () => void;
  onAskCoach?: () => void;
  detailsOnly: boolean;
}) {
  return (
    <div
      className={cn(
        "space-y-3 border-t border-border pt-3",
        detailsOnly ? "border-0 pt-0" : "mt-4",
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <section className="border-l-2 border-blue-200 dark:border-blue-700/80 pl-3">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Warm-up</p>
        <p className="text-sm text-foreground/90">
          {struct.warmup.duration_min} min — {struct.warmup.description}
        </p>
      </section>
      <section className="border-l-2 border-blue-500 dark:border-blue-500 pl-3">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Main set</p>
        {struct.main.intervals ? (
          <>
            <p className="text-sm text-foreground/90">
              {struct.main.intervals.reps} ×{" "}
              {struct.main.intervals.distance_m != null
                ? `${struct.main.intervals.distance_m}m`
                : struct.main.intervals.duration_min != null
                  ? `${struct.main.intervals.duration_min} min`
                  : "effort"}
              {struct.main.intervals.pace ? ` @ ${struct.main.intervals.pace}` : ""}
            </p>
            {struct.main.intervals.rest_description ? (
              <p className="text-xs text-muted-foreground mt-1">Rest: {struct.main.intervals.rest_description}</p>
            ) : null}
            {!compact && struct.main.intervals.reps > 0 && struct.main.intervals.reps <= 24 ? (
              <RepCheckRow workoutId={workout.id} reps={struct.main.intervals.reps} />
            ) : null}
          </>
        ) : (
          <p className="text-sm text-foreground/90">{struct.main.description}</p>
        )}
      </section>
      <section className="border-l-2 border-blue-200 dark:border-blue-700/80 pl-3">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Cool-down</p>
        <p className="text-sm text-foreground/90">
          {struct.cooldown.duration_min} min — {struct.cooldown.description}
        </p>
      </section>
      {struct.purpose ? (
        <p className="text-xs text-muted-foreground flex items-start gap-1.5">
          <Target className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            <span className="font-medium text-foreground/80">Purpose: </span>
            {struct.purpose}
          </span>
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <BarChart2 className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">Control:</span>
        {controlBadge(struct.control_tool)}
        <span className="text-muted-foreground">{controlDescription(struct)}</span>
      </div>
      {!compact && (onMove || onAskCoach) ? (
        <div className="flex flex-wrap gap-2 pt-1">
          {onMove ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMove();
              }}
              className="text-xs font-medium text-primary hover:underline"
            >
              Move session
            </button>
          ) : null}
          {onAskCoach ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAskCoach();
              }}
              className="text-xs font-medium text-primary hover:underline"
            >
              Ask Coach Cade
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function SessionCard({
  workout,
  isExpanded: controlledExpanded,
  onToggle,
  onMove,
  onAskCoach,
  compact = false,
  alwaysExpanded = false,
  detailsOnly = false,
  className,
}: SessionCardProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const expanded = alwaysExpanded ? true : (controlledExpanded ?? internalOpen);
  const toggle = () => {
    if (alwaysExpanded || detailsOnly) return;
    onToggle?.();
    if (controlledExpanded === undefined) setInternalOpen((o) => !o);
  };

  const struct = workout.session_structure;
  const durationMin = plannedWorkoutDurationMinutes({
    distance_km: workout.distance_km,
    duration_min: workout.duration_min,
    duration_minutes: workout.duration_min,
  } as never);

  const summaryTitle = plannedWorkoutSummary({
    name: workout.name,
    description: workout.description,
    distance_km: workout.distance_km,
    duration_min: workout.duration_min,
    pace_target: workout.pace_target,
    session_type: workout.session_type,
  } as never);
  const paceDisplay = workout.pace_target ? normalizePaceDisplay(workout.pace_target) : "";
  const descSubtitle = sessionDescriptionSubtitle(workout.description);

  if (!struct) {
    if (detailsOnly) return null;
    return (
      <div
        className={cn(
          "rounded-xl border border-border bg-card p-4 text-card-foreground",
          compact ? "p-3" : "",
          className,
        )}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={cn(
              "text-xs font-medium px-2 py-0.5 rounded-full capitalize",
              sessionTypeBadgeClass(workout.session_type),
            )}
          >
            {workout.session_type}
          </span>
          {workout.scheduled_date && (
            <span className="text-xs text-muted-foreground">
              {format(parseISO(workout.scheduled_date), "EEE MMM d")}
            </span>
          )}
        </div>
        <p className={cn("font-semibold mt-1", compact ? "text-sm" : "text-base")}>{summaryTitle}</p>
        <p className="text-sm text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {workout.distance_km != null && workout.distance_km > 0 && (
            <span>{Math.round(workout.distance_km * 10) / 10} km</span>
          )}
          {durationMin != null && durationMin > 0 && (
            <>
              {workout.distance_km != null && workout.distance_km > 0 && <span>·</span>}
              <span>{durationMin} min</span>
            </>
          )}
          {paceDisplay && (
            <>
              <span>·</span>
              <span>@{paceDisplay}</span>
            </>
          )}
        </p>
        {descSubtitle ? (
          <p className="text-sm text-muted-foreground mt-1.5 leading-snug">{descSubtitle}</p>
        ) : null}
      </div>
    );
  }

  if (detailsOnly) {
    return (
      <div className={cn("text-card-foreground", className)}>
        <SessionDetailBody
          struct={struct}
          workout={workout}
          compact={compact}
          onMove={onMove}
          onAskCoach={onAskCoach}
          detailsOnly
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card text-card-foreground p-4 shadow-sm",
        compact ? "p-3" : "",
        className,
      )}
    >
      <div
        role={alwaysExpanded ? undefined : "button"}
        tabIndex={alwaysExpanded ? undefined : 0}
        onClick={alwaysExpanded ? undefined : toggle}
        onKeyDown={alwaysExpanded ? undefined : (e) => e.key === "Enter" && toggle()}
        className={cn("w-full text-left", alwaysExpanded ? "" : "cursor-pointer")}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={cn(
              "text-xs font-medium px-2 py-0.5 rounded-full capitalize",
              sessionTypeBadgeClass(workout.session_type),
            )}
          >
            {workout.session_type}
          </span>
          {workout.scheduled_date && (
            <span className="text-xs text-muted-foreground">
              {format(parseISO(workout.scheduled_date), "EEE MMM d")}
            </span>
          )}
        </div>
        <p className={cn("font-semibold mt-1", compact ? "text-sm" : "text-base")}>{summaryTitle}</p>
        <div className="text-sm text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {workout.distance_km != null && workout.distance_km > 0 && (
            <span>{Math.round(workout.distance_km * 10) / 10} km</span>
          )}
          {durationMin != null && durationMin > 0 && (
            <>
              {workout.distance_km != null && workout.distance_km > 0 && <span>·</span>}
              <span>{durationMin} min</span>
            </>
          )}
          {paceDisplay && (
            <>
              <span>·</span>
              <span>@{paceDisplay}</span>
            </>
          )}
          {!alwaysExpanded && (
            <span className="ml-auto inline-flex items-center gap-1 text-xs text-primary">
              {expanded ? (
                <>
                  Hide session <ChevronUp className="w-3.5 h-3.5" />
                </>
              ) : (
                <>
                  Show session <ChevronDown className="w-3.5 h-3.5" />
                </>
              )}
            </span>
          )}
        </div>
        {!expanded && descSubtitle ? (
          <p className="text-sm text-muted-foreground mt-1.5 leading-snug pr-8">{descSubtitle}</p>
        ) : null}
      </div>

      {expanded ? (
        <SessionDetailBody
          struct={struct}
          workout={workout}
          compact={compact}
          onMove={onMove}
          onAskCoach={onAskCoach}
          detailsOnly={false}
        />
      ) : null}
    </div>
  );
}

/** Link to coach with session context */
export function askCoachAboutWorkoutLink(workout: TrainingPlanWorkoutForCard): string {
  const visible = plannedWorkoutSummary({
    name: workout.name,
    description: workout.description,
    distance_km: workout.distance_km,
    duration_min: workout.duration_min,
    pace_target: workout.pace_target,
    session_type: workout.session_type,
  } as never);
  return `/coach?from=plan&session=${encodeURIComponent(visible)}`;
}

export function AskCoachLink({
  workout,
  children,
}: {
  workout: TrainingPlanWorkoutForCard;
  children: React.ReactElement;
}) {
  return <Link to={askCoachAboutWorkoutLink(workout)}>{children}</Link>;
}
