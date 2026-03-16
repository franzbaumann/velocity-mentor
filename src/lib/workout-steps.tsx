/** Shared workout steps types and display for Training Plan and Workout Invites */

export type WorkoutStep = {
  phase: "warmup" | "main" | "cooldown" | "note";
  label: string;
  duration_min?: number | null;
  distance_km?: number | null;
  target_pace?: string | null;
  target_hr_zone?: number | null;
  notes?: string | null;
  reps?: number | null;
  rep_distance_km?: number | null;
  rest_label?: string | null;
};

export function parseSteps(raw: unknown): WorkoutStep[] | null {
  if (!raw) return null;
  try {
    const arr = Array.isArray(raw) ? raw : JSON.parse(String(raw));
    if (Array.isArray(arr) && arr.length > 0) return arr as WorkoutStep[];
  } catch { /* ignore */ }
  return null;
}

export const PHASE_STYLES: Record<string, { border: string; bg: string; badge: string; label: string }> = {
  warmup:   { border: "border-l-emerald-500",       bg: "bg-emerald-500/5",     badge: "bg-emerald-500/15 text-emerald-400",    label: "Warm-up"  },
  main:     { border: "border-l-primary",            bg: "bg-primary/5",         badge: "bg-primary/15 text-primary",            label: "Main Set" },
  cooldown: { border: "border-l-muted-foreground/40", bg: "bg-muted/20",          badge: "bg-muted text-muted-foreground",         label: "Cool-down"},
  note:     { border: "border-l-muted-foreground/20", bg: "bg-muted/10",          badge: "bg-muted text-muted-foreground",         label: "Note"    },
};

export function WorkoutStepsDisplay({ steps }: { steps: WorkoutStep[] }) {
  if (steps.length === 0) return null;
  return (
    <div className="space-y-2 mb-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Session Breakdown</p>
      {steps.map((step, i) => {
        const style = PHASE_STYLES[step.phase] ?? PHASE_STYLES.note;
        const isMain = step.phase === "main";
        return (
          <div key={i} className={`border-l-[3px] rounded-r-lg pl-3 pr-3 py-2.5 ${style.border} ${style.bg}`}>
            <div className="flex items-start gap-2 flex-wrap">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0 ${style.badge}`}>
                {style.label}
              </span>
              <span className="text-sm font-medium text-foreground leading-snug">{step.label}</span>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-xs text-muted-foreground">
              {isMain && step.reps != null && step.rep_distance_km != null && (
                <span className="font-medium text-foreground/80">{step.reps} × {step.rep_distance_km} km</span>
              )}
              {step.target_pace && <span>{step.target_pace}</span>}
              {step.target_hr_zone != null && <span>HR zone {step.target_hr_zone}</span>}
              {step.duration_min != null && !isMain && <span>{step.duration_min} min</span>}
              {step.distance_km != null && !isMain && <span>{step.distance_km} km</span>}
            </div>
            {isMain && step.rest_label && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide">Rest:</span>
                <span className="text-xs text-muted-foreground">{step.rest_label}</span>
              </div>
            )}
            {step.notes && (
              <p className="text-xs text-muted-foreground/70 mt-1 italic">{step.notes}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Combined-workout format from AI: shared_warmup, shared_cooldown, athlete_a, athlete_b, notes */
export type CombinedWorkoutPreview = {
  summary?: string;
  shared_warmup?: string;
  shared_cooldown?: string;
  athlete_a?: { name: string; original_workout?: string; workout?: string; adapted_workout?: string };
  athlete_b?: { name: string; original_workout?: string; workout?: string; adapted_workout?: string };
  notes?: string;
};

/** Renders combined-workout AI response in same visual style as WorkoutStepsDisplay */
export function CombinedWorkoutDisplay({ data }: { data: CombinedWorkoutPreview }) {
  const hasWarmup = data.shared_warmup?.trim();
  const hasCooldown = data.shared_cooldown?.trim();
  const athleteA = data.athlete_a?.adapted_workout ?? data.athlete_a?.workout;
  const athleteB = data.athlete_b?.adapted_workout ?? data.athlete_b?.workout;
  const hasMain = athleteA || athleteB || data.summary?.trim();
  const hasNotes = data.notes?.trim();

  if (!hasWarmup && !hasCooldown && !hasMain && !hasNotes) return null;

  const warmupStyle = PHASE_STYLES.warmup;
  const mainStyle = PHASE_STYLES.main;
  const cooldownStyle = PHASE_STYLES.cooldown;

  return (
    <div className="space-y-2 mb-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Session Breakdown</p>
      {hasWarmup && (
        <div className={`border-l-[3px] rounded-r-lg pl-3 pr-3 py-2.5 ${warmupStyle.border} ${warmupStyle.bg}`}>
          <div className="flex items-start gap-2 flex-wrap">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0 ${warmupStyle.badge}`}>
              Warm-up
            </span>
            <span className="text-sm font-medium text-foreground leading-snug">{data.shared_warmup}</span>
          </div>
        </div>
      )}
      {hasMain && (
        <div className={`border-l-[3px] rounded-r-lg pl-3 pr-3 py-2.5 ${mainStyle.border} ${mainStyle.bg}`}>
          <div className="flex items-start gap-2 flex-wrap">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0 ${mainStyle.badge}`}>
              Main Set
            </span>
            {data.summary?.trim() && (
              <span className="text-sm font-medium text-foreground leading-snug">{data.summary}</span>
            )}
          </div>
          {athleteA && (
            <p className={`text-xs text-muted-foreground ${data.summary?.trim() ? "mt-1.5" : ""}`}>
              <span className="font-medium text-foreground/80">{data.athlete_a?.name ?? "You"}:</span> {athleteA}
            </p>
          )}
          {athleteB && (
            <p className="text-xs text-muted-foreground mt-0.5">
              <span className="font-medium text-foreground/80">{data.athlete_b?.name ?? "Friend"}:</span> {athleteB}
            </p>
          )}
        </div>
      )}
      {hasCooldown && (
        <div className={`border-l-[3px] rounded-r-lg pl-3 pr-3 py-2.5 ${cooldownStyle.border} ${cooldownStyle.bg}`}>
          <div className="flex items-start gap-2 flex-wrap">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0 ${cooldownStyle.badge}`}>
              Cool-down
            </span>
            <span className="text-sm font-medium text-foreground leading-snug">{data.shared_cooldown}</span>
          </div>
        </div>
      )}
      {hasNotes && (
        <div className="border-l-[3px] border-l-muted-foreground/20 rounded-r-lg pl-3 pr-3 py-2.5 bg-muted/10">
          <p className="text-xs text-muted-foreground italic">{data.notes}</p>
        </div>
      )}
    </div>
  );
}
