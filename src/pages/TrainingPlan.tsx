import { AppLayout } from "@/components/AppLayout";
import { useTrainingPlan } from "@/hooks/use-training-plan";
import { Calendar, CalendarDays, List, ChevronDown, ChevronRight, Activity, GripVertical, Check } from "lucide-react";
import { useState, useMemo } from "react";
import { format, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SESSION_COLORS: Record<string, string> = {
  easy: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  tempo: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  intervals: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  long: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  recovery: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
  rest: "bg-muted text-muted-foreground",
};

function SessionCard({
  session,
  onReschedule,
  onMarkDone,
}: {
  session: { id: string; scheduled_date: string | null; session_type: string; description: string; distance_km: number | null; duration_min: number | null; pace_target: string | null; completed_at: string | null };
  onReschedule: (args: { sessionId: string; newDate: string }) => void;
  onMarkDone: (args: { sessionId: string; done: boolean }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [newDate, setNewDate] = useState(session.scheduled_date || "");

  const badgeClass = SESSION_COLORS[session.session_type] || "bg-primary/10 text-primary";
  const isDone = !!session.completed_at;

  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl bg-card/60 border border-border hover:border-primary/20 transition-colors group ${isDone ? "opacity-75" : ""}`}>
      <button
        type="button"
        onClick={() => onMarkDone({ sessionId: session.id, done: !isDone })}
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
        <p className="text-sm font-medium text-foreground mt-1">{session.description}</p>
        <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
          {session.distance_km != null && <span>{session.distance_km} km</span>}
          {session.duration_min != null && <span>{session.duration_min} min</span>}
          {session.pace_target && <span>@{session.pace_target}</span>}
        </div>
        {editing ? (
          <div className="flex gap-2 mt-3">
            <Input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="h-8 text-xs"
            />
            <Button size="sm" onClick={() => { onReschedule({ sessionId: session.id, newDate }); setEditing(false); }}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-primary hover:underline mt-2"
          >
            Move session
          </button>
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
};

const PILL_COLORS: Record<string, string> = {
  easy: "bg-emerald-500 text-white",
  tempo: "bg-amber-500 text-white",
  interval: "bg-rose-500 text-white",
  intervals: "bg-rose-500 text-white",
  long: "bg-blue-500 text-white",
  rest: "bg-muted text-muted-foreground",
  race: "bg-purple-500 text-white",
  recovery: "bg-slate-400 text-white",
};

function CalendarView({
  sessions,
  onMarkDone,
}: {
  sessions: SessionLike[];
  onMarkDone: (args: { sessionId: string; done: boolean }) => void;
}) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedSession, setSelectedSession] = useState<SessionLike | null>(null);

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, SessionLike[]>();
    for (const s of sessions) {
      if (!s.scheduled_date) continue;
      const key = s.scheduled_date.slice(0, 10);
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    }
    return map;
  }, [sessions]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="text-sm text-muted-foreground hover:text-foreground px-2 py-1">
          &larr; Prev
        </button>
        <h3 className="text-sm font-semibold text-foreground">{format(currentMonth, "MMMM yyyy")}</h3>
        <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="text-sm text-muted-foreground hover:text-foreground px-2 py-1">
          Next &rarr;
        </button>
      </div>
      <div className="grid grid-cols-7 gap-px bg-border rounded-xl overflow-hidden">
        {DAY_NAMES.map((d) => (
          <div key={d} className="bg-secondary px-2 py-1.5 text-center text-xs font-medium text-muted-foreground">
            {d}
          </div>
        ))}
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const daySessions = sessionsByDate.get(key) ?? [];
          const inMonth = isSameMonth(day, currentMonth);
          return (
            <div
              key={key}
              className={`bg-card min-h-[80px] p-1.5 ${!inMonth ? "opacity-40" : ""}`}
            >
              <p className={`text-xs mb-1 ${isSameDay(day, new Date()) ? "font-bold text-primary" : "text-muted-foreground"}`}>
                {format(day, "d")}
              </p>
              <div className="space-y-0.5">
                {daySessions.map((s) => {
                  const pill = PILL_COLORS[s.session_type] ?? "bg-primary/20 text-primary";
                  return (
                    <button
                      key={s.id}
                      onClick={() => setSelectedSession(s)}
                      className={`w-full text-left text-[10px] px-1.5 py-0.5 rounded-md truncate ${pill} ${s.completed_at ? "ring-2 ring-emerald-400" : ""}`}
                    >
                      {s.completed_at && <Check className="w-2.5 h-2.5 inline mr-0.5" />}
                      {s.description.slice(0, 20)}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {selectedSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setSelectedSession(null)}>
          <div className="glass-card p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${SESSION_COLORS[selectedSession.session_type] ?? "bg-primary/10 text-primary"}`}>
                {selectedSession.session_type}
              </span>
              {selectedSession.scheduled_date && (
                <span className="text-xs text-muted-foreground">{format(parseISO(selectedSession.scheduled_date), "EEEE, MMM d")}</span>
              )}
            </div>
            <p className="text-sm font-medium text-foreground mb-2">{selectedSession.description}</p>
            <div className="flex gap-3 text-xs text-muted-foreground mb-4">
              {selectedSession.distance_km != null && <span>{selectedSession.distance_km} km</span>}
              {selectedSession.duration_min != null && <span>{selectedSession.duration_min} min</span>}
              {selectedSession.pace_target && <span>@{selectedSession.pace_target}</span>}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  onMarkDone({ sessionId: selectedSession.id, done: !selectedSession.completed_at });
                  setSelectedSession(null);
                }}
              >
                {selectedSession.completed_at ? "Mark Incomplete" : "Mark Complete"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setSelectedSession(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TrainingPlan() {
  const { plan, isLoading, rescheduleSession, markSessionDone } = useTrainingPlan();
  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(new Set([1]));
  const [view, setView] = useState<"list" | "calendar">("list");
  const navigate = useNavigate();

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
              Have a conversation with Kipcoachee to share your running history, goals, and context. When you're ready, ask them to build your plan — it will sync here and adapt as you connect Garmin and intervals.icu.
            </p>
            <button
              onClick={() => navigate("/coach")}
              className="pill-button bg-primary text-primary-foreground"
            >
              Chat with Kipcoachee
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
              {p.race_type}
              {p.race_date && ` · ${format(parseISO(p.race_date), "MMM d, yyyy")}`}
              {p.target_time && ` · ${p.target_time}`}
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
          <CalendarView
            sessions={weeks.flatMap((w) => w.sessions)}
            onMarkDone={markSessionDone}
          />
        ) : (
        <div className="space-y-3">
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
                    <span className="text-sm text-muted-foreground">
                      {format(parseISO(week.start_date), "MMM d")} – {format(new Date(new Date(week.start_date).getTime() + 6 * 24 * 60 * 60 * 1000), "MMM d")}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {week.sessions.length} sessions
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
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        )}
      </div>
    </AppLayout>
  );
}
