import { AppLayout } from "@/components/AppLayout";
import { useTrainingPlan } from "@/hooks/use-training-plan";
import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { Calendar, CalendarDays, List, ChevronDown, ChevronRight, Activity, GripVertical, Check, MessageCircle, Sparkles, RefreshCw } from "lucide-react";
import { UnifiedCalendar } from "@/components/UnifiedCalendar";
import { useState, useMemo, useEffect } from "react";
import { format, parseISO, startOfWeek, endOfWeek, isWithinInterval } from "date-fns";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { DateWheelPicker } from "@/components/ui/date-wheel-picker";
import { plannedWorkoutDurationMinutes, plannedWorkoutSummary } from "@/lib/format";

// ── Workout Steps ──────────────────────────────────────────────────────────────
type WorkoutStep = {
  phase: "warmup" | "main" | "cooldown" | "note";
  label: string;
  duration_min?: number | null;
  distance_km?: number | null;
  target_pace?: string | null;
  target_hr_zone?: number | null;
  notes?: string | null;
  // main-phase only
  reps?: number | null;
  rep_distance_km?: number | null;
  rest_label?: string | null;
};

function parseSteps(raw: unknown): WorkoutStep[] | null {
  if (!raw) return null;
  try {
    const arr = Array.isArray(raw) ? raw : JSON.parse(String(raw));
    if (Array.isArray(arr) && arr.length > 0) return arr as WorkoutStep[];
  } catch { /* ignore */ }
  return null;
}

const PHASE_STYLES: Record<string, { border: string; bg: string; badge: string; label: string }> = {
  warmup:   { border: "border-l-emerald-500",       bg: "bg-emerald-500/5",     badge: "bg-emerald-500/15 text-emerald-400",    label: "Warm-up"  },
  main:     { border: "border-l-primary",            bg: "bg-primary/5",         badge: "bg-primary/15 text-primary",            label: "Main Set" },
  cooldown: { border: "border-l-muted-foreground/40", bg: "bg-muted/20",          badge: "bg-muted text-muted-foreground",         label: "Cool-down"},
  note:     { border: "border-l-muted-foreground/20", bg: "bg-muted/10",          badge: "bg-muted text-muted-foreground",         label: "Note"    },
};

function WorkoutStepsDisplay({ steps }: { steps: WorkoutStep[] }) {
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

/** Match app theme for session badges */
const SESSION_COLORS: Record<string, string> = {
  easy: "bg-accent/15 text-accent",
  tempo: "bg-primary/15 text-primary",
  interval: "bg-destructive/15 text-destructive",
  intervals: "bg-destructive/15 text-destructive",
  long: "bg-warning/15 text-warning",
  recovery: "bg-muted text-muted-foreground",
  rest: "bg-muted text-muted-foreground",
  strides: "bg-accent/15 text-accent",
};

function SessionCard({
  session,
  onReschedule,
  onMarkDone,
  onAskCoachCade,
  onSessionClick,
}: {
  session: SessionLike;
  onReschedule: (args: { sessionId: string; newDate: string }) => void;
  onMarkDone: (args: { sessionId: string; done: boolean }) => void;
  onAskCoachCade?: (session: SessionLike) => void;
  onSessionClick?: (session: SessionLike) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [newDate, setNewDate] = useState(session.scheduled_date || "");

  const badgeClass = SESSION_COLORS[session.session_type] || "bg-primary/10 text-primary";
  const isDone = !!session.completed_at;
  const durationMin = plannedWorkoutDurationMinutes(session);

  return (
    <div
      className={`flex items-start gap-3 p-4 card-standard hover:border-primary/20 transition-colors group cursor-pointer ${isDone ? "opacity-75" : ""}`}
      onClick={() => onSessionClick?.(session)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onSessionClick?.(session)}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onMarkDone({ sessionId: session.id, done: !isDone }); }}
        className={`shrink-0 mt-0.5 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${isDone ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40 hover:border-primary/50"}`}
        title={isDone ? "Mark not done" : "Mark done"}
      >
        {isDone && <Check className="w-3.5 h-3.5" />}
      </button>
      <GripVertical className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badgeClass}`}>
            {session.session_type}
          </span>
          {session.scheduled_date && (
            <span className="text-xs text-muted-foreground">
              {format(parseISO(session.scheduled_date), "EEE MMM d")}
            </span>
          )}
        </div>
        <p className="text-sm font-medium text-foreground mt-1">{plannedWorkoutSummary(session)}</p>
        <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
          {session.distance_km != null && <span>{session.distance_km} km</span>}
          {durationMin != null && <span>{durationMin} min</span>}
          {session.pace_target && <span>@{session.pace_target}</span>}
        </div>
        {editing ? (
          <div className="flex gap-2 mt-3 items-center" onClick={(e) => e.stopPropagation()}>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs font-normal">
                  {newDate ? format(parseISO(newDate), "MMM d, yyyy") : "Pick date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <DateWheelPicker
                  value={newDate ? parseISO(newDate) : new Date()}
                  onChange={(d) => setNewDate(format(d, "yyyy-MM-dd"))}
                  size="sm"
                />
              </PopoverContent>
            </Popover>
            <Button size="sm" onClick={() => { onReschedule({ sessionId: session.id, newDate }); setEditing(false); }}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        ) : (
          <div className="flex gap-2 mt-2">
            <button
              onClick={(e) => { e.stopPropagation(); setEditing(true); }}
              className="text-xs text-primary hover:underline"
            >
              Move session
            </button>
            {onAskCoachCade && (
              <button
                onClick={(e) => { e.stopPropagation(); onAskCoachCade(session); }}
                className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
              >
                <MessageCircle className="w-3 h-3" />
                Ask Coach Cade
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

type SessionLike = {
  id: string;
  scheduled_date: string | null;
  session_type: string;
  description: string;
  distance_km: number | null;
  duration_min: number | null;
  pace_target: string | null;
  completed_at: string | null;
  key_focus?: string | null;
  target_hr_zone?: number | null;
  coach_note?: string | null;
  adjustment_notes?: string | null;
  supportsCoachNote?: boolean;
  workout_steps?: unknown;
};

function SessionDetailModal({
  session,
  onClose,
  onMarkDone,
  onAskCoachCade,
  onCoachNoteFetched,
}: {
  session: SessionLike;
  onClose: () => void;
  onMarkDone: (args: { sessionId: string; done: boolean }) => void;
  onAskCoachCade?: (session: SessionLike) => void;
  onCoachNoteFetched?: () => void;
}) {
  const [coachNote, setCoachNote] = useState<string | null>(session.coach_note ?? null);
  const [coachNoteLoading, setCoachNoteLoading] = useState(false);
  const [coachNoteError, setCoachNoteError] = useState<string | null>(null);

  const [steps, setSteps] = useState<WorkoutStep[] | null>(parseSteps(session.workout_steps));
  const [stepsLoading, setStepsLoading] = useState(false);
  const [stepsError, setStepsError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const isRestDay = session.session_type?.toLowerCase() === "rest";

  const fetchSteps = async (regenerate = false) => {
    setStepsLoading(true);
    setStepsError(null);
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession?.access_token) {
        setStepsError("Not signed in");
        return;
      }
      const { data, error } = await supabase.functions.invoke("intervals-proxy", {
        headers: { Authorization: `Bearer ${authSession.access_token}` },
        body: { action: "workout_steps", workoutId: session.id, regenerate },
      });
      if (error) throw error;
      const res = data as { steps?: unknown[]; error?: string };
      if (res?.error) { setStepsError(res.error); return; }
      if (Array.isArray(res?.steps)) {
        setSteps(res.steps as WorkoutStep[]);
        queryClient.invalidateQueries({ queryKey: ["training-plan"] });
      }
    } catch (e) {
      let msg = (e as Error).message ?? "Failed to generate";
      if (e instanceof FunctionsHttpError && e.context) {
        try {
          const body = (await e.context.json()) as { error?: string };
          if (body?.error) msg = String(body.error);
        } catch {
          /* keep default */
        }
      }
      setStepsError(msg);
    } finally {
      setStepsLoading(false);
    }
  };

  const fetchCoachNote = async (regenerate = false) => {
    setCoachNoteLoading(true);
    setCoachNoteError(null);
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession?.access_token) {
        setCoachNoteError("Not signed in");
        return;
      }
      const { data, error } = await supabase.functions.invoke("intervals-proxy", {
        headers: { Authorization: `Bearer ${authSession.access_token}` },
        body: { action: "workout_coach_note", workoutId: session.id, regenerate },
      });
      if (error) throw error;
      const res = data as { note?: string; error?: string };
      if (res?.error) {
        setCoachNoteError(res.error);
        return;
      }
      const note = res?.note;
      if (note) {
        setCoachNote(note);
        onCoachNoteFetched?.();
        queryClient.invalidateQueries({ queryKey: ["training-plan"] });
      }
    } catch (e) {
      let msg = (e as Error).message ?? "Failed to generate";
      if (e instanceof FunctionsHttpError && e.context) {
        try {
          const body = (await e.context.json()) as { error?: string };
          if (body?.error) msg = String(body.error);
        } catch {
          /* keep default */
        }
      }
      setCoachNoteError(msg);
    } finally {
      setCoachNoteLoading(false);
    }
  };

  useEffect(() => {
    setCoachNote(session.coach_note ?? null);
    setCoachNoteError(null);
    setSteps(parseSteps(session.workout_steps));
    setStepsError(null);

    if (!isRestDay && !parseSteps(session.workout_steps)) {
      fetchSteps();
    }
    if (session.supportsCoachNote !== false && !session.coach_note) {
      fetchCoachNote();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  const durationMin = plannedWorkoutDurationMinutes(session);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="glass-card p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${SESSION_COLORS[session.session_type] ?? "bg-primary/10 text-primary"}`}>
            {session.session_type}
          </span>
          {session.scheduled_date && (
            <span className="text-xs text-muted-foreground">{format(parseISO(session.scheduled_date), "EEEE, MMM d")}</span>
          )}
        </div>

        {/* Title */}
        <p className="text-base font-semibold text-foreground mb-2">{plannedWorkoutSummary(session)}</p>

        {/* Metrics summary */}
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mb-2">
          {session.distance_km != null && <span className="font-medium">{session.distance_km} km</span>}
          {durationMin != null && <span>{durationMin} min</span>}
          {session.pace_target && <span>@{session.pace_target}</span>}
          {session.target_hr_zone != null && <span>HR zone {session.target_hr_zone}</span>}
        </div>
        {session.key_focus && (
          <p className="text-xs text-muted-foreground mb-4 italic">{session.key_focus}</p>
        )}

        {/* Session Breakdown */}
        {!isRestDay && (
          <div className="mb-4">
            {stepsLoading && (
              <div className="space-y-2 mb-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Session Breakdown</p>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="border-l-[3px] border-l-muted/30 rounded-r-lg pl-3 pr-3 py-2.5 bg-muted/10 animate-pulse">
                    <div className="h-3 bg-muted/30 rounded w-3/4 mb-1.5" />
                    <div className="h-2.5 bg-muted/20 rounded w-1/2" />
                  </div>
                ))}
              </div>
            )}
            {stepsError && (
              <div className="mb-4">
                <p className="text-xs text-destructive mb-1">{stepsError}</p>
                <Button size="sm" variant="outline" onClick={() => fetchSteps(true)}>Retry</Button>
              </div>
            )}
            {steps && steps.length > 0 && (
              <div>
                <WorkoutStepsDisplay steps={steps} />
                <button
                  onClick={() => fetchSteps(true)}
                  className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground flex items-center gap-1 mb-4"
                >
                  <RefreshCw className="w-2.5 h-2.5" /> Regenerate breakdown
                </button>
              </div>
            )}
          </div>
        )}

        {/* Why this session */}
        {session.supportsCoachNote !== false && (
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 mb-4">
            <p className="text-xs font-medium text-primary flex items-center gap-1.5 mb-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Why this session for you
            </p>
            {coachNoteLoading ? (
              <p className="text-xs text-muted-foreground">Generating personalized description...</p>
            ) : coachNoteError ? (
              <div>
                <p className="text-xs text-destructive mb-1">{coachNoteError}</p>
                <Button size="sm" variant="outline" onClick={() => fetchCoachNote(true)}>Retry</Button>
              </div>
            ) : coachNote ? (
              <p className="text-sm text-foreground/90">{coachNote}</p>
            ) : (
              <p className="text-xs text-muted-foreground">—</p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => {
              onMarkDone({ sessionId: session.id, done: !session.completed_at });
              onClose();
            }}
          >
            {session.completed_at ? "Mark Incomplete" : "Mark Complete"}
          </Button>
          {onAskCoachCade && (
            <Button size="sm" variant="outline" onClick={() => onAskCoachCade(session)}>
              <MessageCircle className="w-3.5 h-3.5 mr-1" />
              Ask Coach Cade about this
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}

export default function TrainingPlan() {
  const { plan, isLoading, rescheduleSession, markSessionDone } = useTrainingPlan();
  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(new Set([1]));
  const [view, setView] = useState<"list" | "calendar">("list");
  const [selectedSession, setSelectedSession] = useState<SessionLike | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleAskCoachCade = (session: SessionLike) => {
    const weeks = plan?.weeks ?? [];
    const sessionWeek = weeks.find((w) => w.sessions.some((s: SessionLike) => s.id === session.id));
    const weekNum = sessionWeek?.week_number ?? "?";
    const planName = plan?.plan?.plan_name ?? plan?.plan?.philosophy ?? "training plan";

    const durationMin = plannedWorkoutDurationMinutes(session);
    const details = [
      session.distance_km && `${session.distance_km}km`,
      durationMin != null && `${durationMin}min`,
      session.pace_target && `@${session.pace_target}`,
    ].filter(Boolean).join(" · ");

    const visibleMsg = `${plannedWorkoutSummary(session)}${details ? ` (${details})` : ""}`;
    const hiddenMeta = JSON.stringify({
      fromPlan: true,
      planName,
      weekNumber: weekNum,
      sessionType: session.session_type,
      description: session.description,
      distanceKm: session.distance_km,
      durationMin,
      paceTarget: session.pace_target,
      hrZone: session.target_hr_zone,
      adjustmentNotes: session.adjustment_notes ?? null,
    });

    navigate(`/coach?from=plan&session=${encodeURIComponent(visibleMsg)}&planMeta=${encodeURIComponent(hiddenMeta)}`);
  };

  const toggleWeek = (n: number) => {
    setExpandedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="animate-fade-in space-y-6">
          <h1 className="text-2xl font-semibold text-foreground">Training Plan</h1>
          <div className="glass-card p-12 text-center">
            <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">Loading your plan...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!plan?.plan) {
    return (
      <AppLayout>
        <div className="animate-fade-in space-y-6">
          <h1 className="text-2xl font-semibold text-foreground">Training Plan</h1>
          <div className="glass-card p-12 text-center">
            <Calendar className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-medium text-foreground mb-2">No plan yet</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
              Complete the onboarding with Coach Cade to get a personalized training plan, or chat to build one from conversation.
            </p>
            <button
              onClick={() => navigate("/coach?from=plan")}
              className="pill-button bg-primary text-primary-foreground"
            >
              Get started with Coach Cade
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  const { plan: p, weeks } = plan;

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Training Plan</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {p.plan_name || p.race_type || "Training Plan"}
              {(p.goal_date || p.race_date) && ` · ${format(parseISO(p.goal_date || p.race_date || ""), "MMM d, yyyy")}`}
              {(p.goal_time || p.target_time) && ` · ${p.goal_time || p.target_time}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setView("list")}
              className={`p-2 rounded-lg transition-colors ${view === "list" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
              title="List view"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView("calendar")}
              className={`p-2 rounded-lg transition-colors ${view === "calendar" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
              title="Calendar view"
            >
              <CalendarDays className="w-4 h-4" />
            </button>
          </div>
        </div>

        {view === "calendar" ? (
          <div className="glass-card overflow-hidden">
            <UnifiedCalendar defaultView="plan" />
          </div>
        ) : (
        <div className="space-y-3">
          {(() => {
            const today = new Date();
            const mon = startOfWeek(today, { weekStartsOn: 1 });
            const sun = endOfWeek(today, { weekStartsOn: 1 });
            const thisWeekData = weeks.find((w) => {
              const start = parseISO(w.start_date);
              const end = new Date(start);
              end.setDate(end.getDate() + 6);
              return isWithinInterval(today, { start, end });
            });
            const thisWeekSessions = thisWeekData?.sessions ?? [];
            const doneCount = thisWeekSessions.filter((s: { completed_at?: string | null }) => s.completed_at).length;
            const plannedKm = thisWeekSessions.reduce((s: number, x: { distance_km?: number | null }) => s + (x.distance_km ?? 0), 0);
            return thisWeekData ? (
              <div className="glass-card p-5 mb-4 border-primary/20">
                <p className="text-sm font-semibold text-foreground mb-2">This week</p>
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full border-2 border-primary flex items-center justify-center">
                    <span className="text-lg font-bold text-primary">{doneCount}/{thisWeekSessions.length}</span>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{Math.round(plannedKm)}km planned</p>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-400">
                      On track
                    </span>
                  </div>
                </div>
              </div>
            ) : null;
          })()}
          {weeks.map((week) => {
            const isExpanded = expandedWeeks.has(week.week_number);
            return (
              <div key={week.id} className="glass-card overflow-hidden">
                <button
                  onClick={() => toggleWeek(week.week_number)}
                  className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-secondary/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )}
                    <Activity className="w-4 h-4 text-primary" />
                    <span className="font-semibold text-foreground">Week {week.week_number}</span>
                    {(week as { phase?: string }).phase && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary capitalize">
                        {(week as { phase?: string }).phase}
                      </span>
                    )}
                    <span className="text-sm text-muted-foreground">
                      {format(parseISO(week.start_date), "MMM d")} – {format(new Date(new Date(week.start_date).getTime() + 6 * 24 * 60 * 60 * 1000), "MMM d")}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {week.sessions.length} sessions
                    {(week as { total_km?: number }).total_km != null && ` · ${Math.round((week as { total_km?: number }).total_km ?? 0)}km`}
                  </span>
                </button>
                {isExpanded && (
                  <div className="px-5 pb-5 pt-0 space-y-2 border-t border-border">
                    {week.sessions.map((session) => (
                      <SessionCard
                        key={session.id}
                        session={session}
                        onReschedule={rescheduleSession}
                        onMarkDone={markSessionDone}
                        onAskCoachCade={handleAskCoachCade}
                        onSessionClick={setSelectedSession}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        )}
        {selectedSession && (
          <SessionDetailModal
            session={selectedSession}
            onClose={() => setSelectedSession(null)}
            onMarkDone={markSessionDone}
            onAskCoachCade={handleAskCoachCade}
            onCoachNoteFetched={() => queryClient.invalidateQueries({ queryKey: ["training-plan"] })}
          />
        )}
      </div>
    </AppLayout>
  );
}
