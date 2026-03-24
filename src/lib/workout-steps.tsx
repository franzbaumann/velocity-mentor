/** Shared workout steps types and display for Training Plan and Workout Invites */

export type WorkoutStep = {
  phase: "warmup" | "main" | "cooldown" | "note";
  label: string;
  duration_min?: number | null;
  distance_km?: number | null;
  target_pace?: string | null;
  target_hr_zone?: number | null;
  notes?: string | null;
  /** Strength / circuit blocks */
  sets?: number | null;
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

/** Easy/recovery/long runs: show as one block. Quality sessions: show warm-up, main, cool-down. */
const EASY_TYPES = ["easy", "recovery", "long"];
function isEasyRun(workoutType?: string | null): boolean {
  const t = (workoutType ?? "").toLowerCase().trim();
  return EASY_TYPES.includes(t);
}

/** Detect easy run from step content: all main, no reps, zones <= 2 */
function looksLikeEasyRun(steps: WorkoutStep[]): boolean {
  if (steps.length === 0) return false;
  const hasReps = steps.some((s) => s.reps != null && s.reps > 0);
  const hasWarmupCooldown = steps.some((s) => s.phase === "warmup" || s.phase === "cooldown");
  const zones = steps.map((s) => s.target_hr_zone).filter((z): z is number => z != null);
  const allEasyZones = zones.length === 0 || zones.every((z) => z <= 2);
  return !hasReps && !hasWarmupCooldown && allEasyZones;
}

function collapseEasyRunSteps(steps: WorkoutStep[]): string {
  const totalKm = steps.reduce((s, st) => s + (st.distance_km ?? 0), 0);
  const totalMin = steps.reduce((s, st) => s + (st.duration_min ?? 0), 0);
  const firstPace = steps.map((s) => s.target_pace).find(Boolean) as string | undefined;
  const parts: string[] = [];
  if (totalKm > 0) parts.push(`${totalKm} km easy`);
  else if (totalMin > 0) parts.push(`${totalMin} min easy`);
  else parts.push("Easy jog");
  if (firstPace) parts.push(`@ ${firstPace}`);
  const hrZones = steps.map((s) => s.target_hr_zone).filter((z): z is number => z != null);
  if (hrZones.length > 0) {
    const minZ = Math.min(...hrZones);
    const maxZ = Math.max(...hrZones);
    parts.push(minZ === maxZ ? `HR zone ${minZ}` : `HR zone ${minZ}–${maxZ}`);
  }
  return parts.join(" ");
}

export function WorkoutStepsDisplay({
  steps,
  workoutType,
}: { steps: WorkoutStep[]; workoutType?: string | null }) {
  if (steps.length === 0) return null;

  const shouldCollapse = isEasyRun(workoutType) || looksLikeEasyRun(steps);
  if (shouldCollapse) {
    const summary = collapseEasyRunSteps(steps);
    return (
      <div className="mb-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Session</p>
        <div className="border-l-[3px] border-l-primary rounded-r-lg pl-3 pr-3 py-2.5 bg-primary/5">
          <span className="text-sm font-medium text-foreground leading-snug">{summary}</span>
        </div>
      </div>
    );
  }

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
              {isMain && step.sets != null && step.sets > 0 && (
                <span className="font-medium text-foreground/80">{step.sets} sets</span>
              )}
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

/** Athlete entry in combined workout (2-athlete or N-athlete format) */
export type CombinedWorkoutAthlete = {
  name: string;
  original_workout?: string;
  workout?: string;
  adapted_workout?: string;
};

/** Combined-workout format from AI: shared_warmup, shared_cooldown, athlete_a/athlete_b or athletes[], notes */
export type CombinedWorkoutPreview = {
  summary?: string;
  shared_warmup?: string;
  shared_cooldown?: string;
  athlete_a?: CombinedWorkoutAthlete;
  athlete_b?: CombinedWorkoutAthlete;
  athletes?: CombinedWorkoutAthlete[];
  notes?: string;
};

function getAthletesFromData(data: CombinedWorkoutPreview): CombinedWorkoutAthlete[] {
  if (data.athletes && data.athletes.length > 0) {
    return data.athletes;
  }
  const out: CombinedWorkoutAthlete[] = [];
  if (data.athlete_a) out.push(data.athlete_a);
  if (data.athlete_b) out.push(data.athlete_b);
  return out;
}

/** Renders combined-workout AI response in same visual style as WorkoutStepsDisplay */
export function CombinedWorkoutDisplay({ data }: { data: CombinedWorkoutPreview }) {
  const hasWarmup = data.shared_warmup?.trim();
  const hasCooldown = data.shared_cooldown?.trim();
  const athletes = getAthletesFromData(data);
  const athleteWorkouts = athletes.map((a) => a.adapted_workout ?? a.workout).filter(Boolean);
  const hasMain = athleteWorkouts.length > 0 || data.summary?.trim();
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
          {athletes.map((athlete, i) => {
            const workout = athlete.adapted_workout ?? athlete.workout;
            if (!workout) return null;
            return (
              <p
                key={i}
                className={`text-xs text-muted-foreground ${i === 0 && data.summary?.trim() ? "mt-1.5" : "mt-0.5"}`}
              >
                <span className="font-medium text-foreground/80">{athlete.name}:</span> {workout}
              </p>
            );
          })}
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
