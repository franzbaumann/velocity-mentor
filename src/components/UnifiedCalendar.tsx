import { useState, useMemo } from "react";
import { useMergedActivities } from "@/hooks/useMergedIntervalsData";
import { useTrainingPlan } from "@/hooks/use-training-plan";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameMonth,
  isToday,
  addWeeks,
  subWeeks,
} from "date-fns";
import { ChevronLeft, ChevronRight, Check, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatDistance } from "@/lib/format";
import { isNonDistanceActivity } from "@/lib/analytics";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Workout pill colors per spec */
const WORKOUT_COLORS: Record<string, { bg: string; text: string }> = {
  easy: { bg: "#22C55E", text: "#fff" },
  long: { bg: "#F97316", text: "#fff" },
  tempo: { bg: "#EAB308", text: "#000" },
  interval: { bg: "#EF4444", text: "#fff" },
  intervals: { bg: "#EF4444", text: "#fff" },
  rest: { bg: "#9CA3AF", text: "#fff" },
  recovery: { bg: "#9CA3AF", text: "#fff" },
  strides: { bg: "#22C55E", text: "#fff" },
  race: { bg: "#0A84FF", text: "#fff" },
};

const COMPLETED_BLUE = "#0A84FF";

function getWorkoutColor(type: string): { bg: string; text: string } {
  const t = String(type || "easy").toLowerCase();
  return WORKOUT_COLORS[t] ?? { bg: "#0A84FF", text: "#fff" };
}

function formatDuration(sec: number | null): string {
  if (sec == null) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m >= 60) return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export type PlannedWorkout = {
  id: string;
  scheduled_date: string | null;
  session_type: string;
  type?: string;
  description: string;
  distance_km: number | null;
  duration_min: number | null;
  duration_minutes?: number | null;
  pace_target: string | null;
  target_pace?: string | null;
  target_hr_zone?: number | null;
  completed_at?: string | null;
  completed?: boolean;
  key_focus?: string | null;
  coach_note?: string | null;
};

export type CompletedActivity = {
  id: string;
  detailId: string;
  date: string;
  name: string;
  type: string;
  km: number;
  pace: string | null;
  duration: string;
  hr: number | null;
  nonDist: boolean;
  hrZones?: Record<string, number>;
};

export type UnifiedCalendarProps = {
  defaultView?: "plan" | "activities";
  onAskCoachCade?: (date: string, workout?: PlannedWorkout, activity?: CompletedActivity) => void;
};

export function UnifiedCalendar({ defaultView = "plan", onAskCoachCade }: UnifiedCalendarProps) {
  const navigate = useNavigate();
  const { data: activities = [] } = useMergedActivities(730);
  const { plan } = useTrainingPlan();

  const workouts = useMemo(() => {
    const weeks = plan?.weeks ?? [];
    return weeks.flatMap((w) =>
      (w.sessions ?? []).map((s) => ({
        id: s.id,
        scheduled_date: s.scheduled_date,
        session_type: s.session_type ?? s.type ?? "easy",
        type: s.session_type ?? s.type,
        description: s.description ?? "",
        distance_km: s.distance_km,
        duration_min: s.duration_min ?? s.duration_minutes,
        pace_target: s.pace_target ?? s.target_pace,
        target_hr_zone: s.target_hr_zone,
        completed_at: s.completed_at,
        completed: s.completed ?? !!s.completed_at,
        key_focus: s.key_focus,
        coach_note: s.coach_note,
      }))
    ) as PlannedWorkout[];
  }, [plan]);

  const completedActivities = useMemo(() => {
    return activities
      .map((a) => {
        const km = a.distance_km ?? 0;
        const nonDist = isNonDistanceActivity(a.type);
        const detailId =
          a.external_id && a.source === "intervals_icu" ? `icu_${a.external_id}` : a.id;
        return {
          id: a.id,
          detailId,
          date: a.date,
          name: a.name ?? `${a.type ?? "Run"}`,
          type: a.type ?? "Run",
          km,
          nonDist,
          pace: a.avg_pace ?? null,
          duration: formatDuration(a.duration_seconds),
          hr: a.avg_hr ?? null,
          hrZones: a.hr_zone_times
            ? Object.fromEntries(
                (a.hr_zone_times as number[]).map((v, i) => [`z${i + 1}`, v])
              )
            : undefined,
        } as CompletedActivity;
      })
      .filter((r) => r.nonDist || r.km >= 0.01 || (r.duration && r.duration !== ""));
  }, [activities]);

  const workoutsByDate = useMemo(() => {
    const map = new Map<string, PlannedWorkout[]>();
    for (const w of workouts) {
      const key = w.scheduled_date?.slice(0, 10);
      if (!key) continue;
      const arr = map.get(key) ?? [];
      arr.push(w);
      map.set(key, arr);
    }
    return map;
  }, [workouts]);

  const activitiesByDate = useMemo(() => {
    const map = new Map<string, CompletedActivity[]>();
    for (const a of completedActivities) {
      const arr = map.get(a.date) ?? [];
      arr.push(a);
      map.set(a.date, arr);
    }
    return map;
  }, [completedActivities]);

  const [viewMonth, setViewMonth] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const calendarWeeks = useMemo(() => {
    if (viewMode === "week") {
      const weekStart = startOfWeek(viewMonth, { weekStartsOn: 1 });
      const weeks: Date[][] = [];
      for (let i = 0; i < 7; i++) {
        weeks.push([addDays(weekStart, i)]);
      }
      return weeks.map((w) => w);
    }
    const monthStart = startOfMonth(viewMonth);
    const monthEnd = endOfMonth(viewMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const weeks: Date[][] = [];
    let d = new Date(calStart);
    while (d <= calEnd) {
      const week: Date[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(new Date(d));
        d = addDays(d, 1);
      }
      weeks.push(week);
    }
    return weeks;
  }, [viewMonth, viewMode]);

  const goToToday = () => {
    setViewMonth(new Date());
  };

  const selectedWorkouts = selectedDate ? workoutsByDate.get(selectedDate) ?? [] : [];
  const selectedActivities = selectedDate ? activitiesByDate.get(selectedDate) ?? [] : [];
  const firstWorkout = selectedWorkouts[0];
  const firstActivity = selectedActivities[0];

  const matchStatus = useMemo(() => {
    if (!selectedDate) return null;
    const hasPlan = selectedWorkouts.length > 0;
    const hasActivity = selectedActivities.length > 0;
    if (!hasPlan && !hasActivity) return null;
    if (hasPlan && !hasActivity) return "Not completed";
    if (!hasPlan && hasActivity) return "Unplanned run";
    const planned = firstWorkout!.distance_km ?? 0;
    const actual = firstActivity!.km ?? 0;
    if (actual >= planned * 0.95) return "Completed as planned";
    if (actual >= planned * 0.7) return "Completed — slightly short";
    return "Completed — shorter than planned";
  }, [selectedDate, selectedWorkouts, selectedActivities, firstWorkout, firstActivity]);

  const handleAskCoachCade = () => {
    if (!selectedDate) return;
    onAskCoachCade?.(selectedDate, firstWorkout, firstActivity);
    if (!onAskCoachCade) {
      const details = [
        firstWorkout?.description,
        firstWorkout?.distance_km && `${firstWorkout.distance_km}km planned`,
        firstActivity && `✓ ${firstActivity.km}km done`,
      ]
        .filter(Boolean)
        .join(" · ");
      navigate(`/coach?from=calendar&date=${selectedDate}&context=${encodeURIComponent(details)}`);
    }
  };

  return (
    <div className="w-full">
      {/* Navigation */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#E5E7EB] dark:border-border">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              setViewMonth((m) => (viewMode === "month" ? subMonths(m, 1) : subWeeks(m, 1)))
            }
            className="h-8 w-8"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              setViewMonth((m) => (viewMode === "month" ? addMonths(m, 1) : addWeeks(m, 1)))
            }
            className="h-8 w-8"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <button
            type="button"
            onClick={goToToday}
            className="text-sm font-medium text-[#0A84FF] hover:underline px-2"
          >
            Today
          </button>
        </div>
        <h3 className="text-base font-semibold text-foreground tabular-nums">
          {viewMode === "month"
            ? format(viewMonth, "MMMM yyyy")
            : `Week of ${format(startOfWeek(viewMonth, { weekStartsOn: 1 }), "MMM d")}`}
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setViewMode("month")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              viewMode === "month" ? "bg-[#0A84FF] text-white" : "text-[#6B7280] hover:bg-secondary/50"
            }`}
          >
            Month
          </button>
          <button
            onClick={() => setViewMode("week")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              viewMode === "week" ? "bg-[#0A84FF] text-white" : "text-[#6B7280] hover:bg-secondary/50"
            }`}
          >
            Week
          </button>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 px-4 py-2 border-b border-[#E5E7EB] dark:border-border">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="text-center text-xs font-medium text-[#6B7280] uppercase tracking-wider"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="p-4">
        <div className="grid grid-cols-7 gap-1">
          {viewMode === "week"
            ? calendarWeeks.map((week, wi) => (
                <div key={wi} className="col-span-1">
                  {week.map((day) => {
                    const dateKey = format(day, "yyyy-MM-dd");
                    return (
                      <DayCell
                        key={dateKey}
                        day={day}
                        viewMonth={viewMonth}
                        workouts={workoutsByDate.get(dateKey) ?? []}
                        activities={activitiesByDate.get(dateKey) ?? []}
                        defaultView={defaultView}
                        isWeekView
                        onSelect={() => setSelectedDate(dateKey)}
                      />
                    );
                  })}
                </div>
              ))
            : calendarWeeks.flatMap((week) =>
                week.map((day) => {
                  const dateKey = format(day, "yyyy-MM-dd");
                  return (
                    <DayCell
                      key={dateKey}
                      day={day}
                      viewMonth={viewMonth}
                      workouts={workoutsByDate.get(dateKey) ?? []}
                      activities={activitiesByDate.get(dateKey) ?? []}
                      defaultView={defaultView}
                      isWeekView={false}
                      onSelect={() => setSelectedDate(dateKey)}
                    />
                  );
                })
              )}
        </div>
      </div>

      {/* Slide-up panel */}
      <Sheet open={!!selectedDate} onOpenChange={(open) => !open && setSelectedDate(null)}>
        <SheetContent side="bottom" className="max-h-[85vh] rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>
              {selectedDate ? format(new Date(selectedDate), "EEEE, MMMM d, yyyy") : ""}
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-4 max-h-[60vh] overflow-y-auto">
            {selectedDate && (
              <>
                {firstWorkout && (
                  <div className="card-standard">
                    <p className="section-header mb-2">Planned workout</p>
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
                        style={{ backgroundColor: getWorkoutColor(firstWorkout.session_type).bg }}
                      >
                        {firstWorkout.session_type}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-foreground">{firstWorkout.description}</p>
                    <div className="flex gap-3 text-xs text-[#6B7280] mt-1">
                      {firstWorkout.distance_km != null && (
                        <span>{firstWorkout.distance_km} km</span>
                      )}
                      {firstWorkout.duration_min != null && (
                        <span>{firstWorkout.duration_min} min</span>
                      )}
                      {firstWorkout.pace_target && (
                        <span>@{firstWorkout.pace_target}</span>
                      )}
                      {firstWorkout.target_hr_zone != null && (
                        <span>HR zone {firstWorkout.target_hr_zone}</span>
                      )}
                    </div>
                  </div>
                )}

                {firstActivity && (
                  <div className="card-standard">
                    <p className="section-header mb-2">Completed activity</p>
                    <button
                      onClick={() => navigate(`/activities/${firstActivity.detailId}`)}
                      className="w-full text-left"
                    >
                      <p className="text-sm font-medium text-foreground">{firstActivity.name}</p>
                      <div className="flex gap-3 text-xs text-[#0A84FF] mt-1">
                        {!firstActivity.nonDist && (
                          <span>{formatDistance(firstActivity.km)}</span>
                        )}
                        {firstActivity.pace && <span>{firstActivity.pace}/km</span>}
                        {firstActivity.hr != null && <span>{firstActivity.hr} bpm</span>}
                      </div>
                    </button>
                    {firstActivity.hrZones && Object.keys(firstActivity.hrZones).length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-[#6B7280] mb-1">HR zones</p>
                        <div className="flex h-2 rounded-full overflow-hidden">
                          {[1, 2, 3, 4, 5].map((z) => {
                            const total = Object.values(firstActivity.hrZones!).reduce((a, b) => a + b, 0);
                            const pct = total > 0
                              ? ((firstActivity.hrZones![`z${z}`] ?? 0) / total) * 100
                              : 0;
                            const colors = ["#94a3b8", "#3b82f6", "#22c55e", "#f97316", "#ef4444"];
                            return (
                              <div
                                key={z}
                                className="min-w-[2px]"
                                style={{
                                  width: `${pct}%`,
                                  backgroundColor: colors[z - 1],
                                }}
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {matchStatus && (
                  <div className="text-sm">
                    <span className="text-[#6B7280]">Status: </span>
                    <span className="font-medium text-foreground">{matchStatus}</span>
                  </div>
                )}

                <Button
                  onClick={handleAskCoachCade}
                  className="w-full gap-2"
                >
                  <MessageCircle className="w-4 h-4" />
                  Ask Coach Cade about this day
                </Button>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DayCell({
  day,
  viewMonth,
  workouts,
  activities,
  defaultView,
  isWeekView,
  onSelect,
}: {
  day: Date;
  viewMonth: Date;
  workouts: PlannedWorkout[];
  activities: CompletedActivity[];
  defaultView: "plan" | "activities";
  isWeekView?: boolean;
  onSelect: () => void;
}) {
  const dateKey = format(day, "yyyy-MM-dd");
  const inMonth = isSameMonth(day, viewMonth);
  const today = isToday(day);
  const hasData = workouts.length > 0 || activities.length > 0;
  const firstWorkout = workouts[0];
  const firstActivity = activities[0];
  const hasMatch = firstWorkout && firstActivity;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`
        relative flex flex-col items-stretch rounded-lg text-left p-2 transition-colors
        ${isWeekView ? "min-h-[80px] sm:min-h-[96px]" : "min-h-[72px] sm:min-h-[88px]"}
        ${!inMonth ? "text-[#6B7280]/50" : "text-foreground"}
        ${hasData ? "cursor-pointer hover:bg-[#0A84FF]/10" : "cursor-pointer"}
      `}
    >
      <span className={`text-sm mb-1 ${today ? "font-semibold text-[#0A84FF]" : ""}`}>
        {format(day, "d")}
      </span>

      <div className="flex flex-row flex-wrap gap-1 min-w-0">
        {today && (
          <span
            className="text-[10px] px-2 py-0.5 rounded-full font-medium inline-flex items-center shrink-0"
            style={{ backgroundColor: "#0A84FF", color: "#fff" }}
          >
            Today
          </span>
        )}
        {firstWorkout && (
          <span
            className="text-[10px] px-2 py-0.5 rounded-full truncate font-medium inline-flex items-center gap-1 shrink-0"
            style={{
              backgroundColor: getWorkoutColor(firstWorkout.session_type).bg,
              color: getWorkoutColor(firstWorkout.session_type).text,
            }}
          >
            {hasMatch && <Check className="w-2.5 h-2.5 shrink-0" />}
            {firstWorkout.session_type} {firstWorkout.distance_km != null && `${firstWorkout.distance_km}km`}
          </span>
        )}
        {firstActivity && (
          <span
            className="text-[10px] truncate font-medium shrink-0"
            style={{ color: COMPLETED_BLUE }}
          >
            ✓ {firstActivity.nonDist ? firstActivity.duration : `${formatDistance(firstActivity.km)} · ${firstActivity.pace ?? "—"}`}
          </span>
        )}
      </div>
    </button>
  );
}
