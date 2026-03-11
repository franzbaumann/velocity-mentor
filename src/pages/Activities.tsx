import { useState, useMemo } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useIntervalsIntegration } from "@/hooks/useIntervalsIntegration";
import { useMergedActivities } from "@/hooks/useMergedIntervalsData";
import { Activity, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
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
} from "date-fns";
import { formatDistance } from "@/lib/format";
import { isNonDistanceActivity } from "@/lib/analytics";
import { dailyTSSFromActivities } from "@/lib/analytics";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

function formatDuration(sec: number | null): string {
  if (sec == null) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m >= 60) return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Map activity type/name to app theme colors (accent=green, primary=blue, warning=orange, destructive=red) */
function activityTypeToColor(type: string, name?: string): string {
  const t = String(type || "").toLowerCase();
  const n = String(name || "").toLowerCase();
  const combined = `${t} ${n}`;
  if (/easy|recovery|jog|base/i.test(combined)) return "bg-accent";      // green
  if (/tempo|threshold|steady/i.test(combined)) return "bg-primary";   // blue
  if (/interval|vo2|fartlek|speed|hiit/i.test(combined)) return "bg-destructive"; // red
  if (/long|endurance/i.test(combined)) return "bg-warning";            // orange
  if (/rest|rest day/i.test(combined)) return "bg-muted";
  return "bg-primary"; // default blue for run, ride, swim, etc.
}

export default function Activities() {
  const navigate = useNavigate();
  const { isConnected } = useIntervalsIntegration();
  const { data: activities = [], isLoading } = useMergedActivities(730);

  const runs = useMemo(
    () =>
      activities
        .map((a) => {
          const km = a.distance_km ?? 0;
          const nonDist = isNonDistanceActivity(a.type);
          const useKm = !nonDist && km >= 0.01;
          const hasDur = a.duration_seconds != null && a.duration_seconds > 0;
          const dur = formatDuration(a.duration_seconds);
          const detailId =
            a.external_id && a.source === "intervals_icu" ? `icu_${a.external_id}` : a.id;
          const displayName = a.name
            ? a.name
            : useKm
              ? `${a.type ?? "Run"} — ${formatDistance(km)}`
              : `${a.type ?? "Activity"}${hasDur ? ` (${dur})` : ""}`;
          return {
            id: detailId,
            date: a.date,
            dateObj: new Date(a.date),
            name: displayName,
            type: a.type ?? "Run",
            km,
            nonDist,
            pace: nonDist ? null : a.avg_pace ?? null,
            duration: dur,
            hr: a.avg_hr ?? null,
            source: a.source ?? "garmin",
          };
        })
        .filter((r) =>
          r.nonDist ? r.duration && r.duration !== "" : r.km >= 0.01 || (r.duration && r.duration !== "")
        )
        .sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime()),
    [activities]
  );

  const activitiesByDate = useMemo(() => {
    const map = new Map<string, typeof runs>();
    for (const r of runs) {
      const key = r.date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return map;
  }, [runs]);

  const dailyTSS = useMemo(
    () => dailyTSSFromActivities(activities as { date: string; avg_hr?: number | null; duration_seconds?: number | null; distance_km?: number | null; icu_training_load?: number | null; trimp?: number | null }[]),
    [activities]
  );

  const maxTSS = useMemo(() => {
    let max = 0;
    for (const v of dailyTSS.values()) if (v > max) max = v;
    return Math.max(max, 1);
  }, [dailyTSS]);

  const [viewMonth, setViewMonth] = useState(() => new Date());

  const calendarWeeks = useMemo(() => {
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
  }, [viewMonth]);

  const hasAnyData = runs.length > 0;
  const isLoadingAny = isLoading;

  if (!isConnected && !hasAnyData && !isLoading) {
    return (
      <AppLayout>
        <div className="animate-fade-in space-y-6">
          <h1 className="text-2xl font-semibold text-foreground">Activities</h1>
          <div className="glass-card p-12 text-center">
            <Activity className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-medium text-foreground mb-2">Add your activities</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
              Connect intervals.icu in Settings to sync your activities.
            </p>
            <button
              onClick={() => navigate("/settings")}
              className="pill-button bg-primary text-primary-foreground mt-6 gap-2"
            >
              Go to Settings
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (isLoadingAny) {
    return (
      <AppLayout>
        <div className="animate-fade-in space-y-6">
          <h1 className="text-2xl font-semibold text-foreground">Activities</h1>
          <div className="glass-card p-12 text-center text-muted-foreground">Loading activities…</div>
        </div>
      </AppLayout>
    );
  }

  if (runs.length === 0) {
    return (
      <AppLayout>
        <div className="animate-fade-in space-y-6">
          <h1 className="text-2xl font-semibold text-foreground">Activities</h1>
          <div className="glass-card p-12 text-center">
            <Activity className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-medium text-foreground mb-2">No activities yet</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
              {isConnected
                ? "Connected to intervals.icu — if you have activities there, they should sync. Try refreshing the page or check Settings."
                : "Connect intervals.icu in Settings to sync your activities."}
            </p>
            <div className="flex flex-wrap gap-2 justify-center mt-6">
              <button
                onClick={() => window.location.reload()}
                className="pill-button bg-primary text-primary-foreground gap-2"
              >
                Refresh page
              </button>
              <Button onClick={() => navigate("/settings")} variant="outline" className="gap-2">
                Go to Settings
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <h1 className="text-2xl font-semibold text-foreground">Activities</h1>

        {/* Calendar grid — larger to fill space */}
        <div className="glass-card overflow-hidden w-full">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setViewMonth((m) => subMonths(m, 1))}
              className="h-8 w-8"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <button
              type="button"
              onClick={() => setViewMonth(new Date())}
              className="text-base font-semibold text-foreground tabular-nums hover:text-primary transition-colors"
            >
              {format(viewMonth, "MMMM yyyy")}
            </button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setViewMonth((m) => addMonths(m, 1))}
              className="h-8 w-8"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="p-5">
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-2 mb-2">
              {WEEKDAYS.map((d) => (
                <div
                  key={d}
                  className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider"
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-2">
              {calendarWeeks.flatMap((week) =>
                week.map((day) => {
                  const dateKey = format(day, "yyyy-MM-dd");
                  const dayActivities = activitiesByDate.get(dateKey) ?? [];
                  const tss = dailyTSS.get(dateKey) ?? 0;
                  const intensity = maxTSS > 0 ? Math.min(1, tss / maxTSS) : 0;
                  const inMonth = isSameMonth(day, viewMonth);
                  const today = isToday(day);

                  const dayButton = (
                    <button
                      type="button"
                      className={`
                        relative flex flex-col items-center justify-center min-h-[72px] sm:min-h-[88px] rounded-lg text-sm transition-colors
                        ${!inMonth ? "text-muted-foreground/50" : "text-foreground"}
                        ${today ? "ring-1 ring-primary/50" : ""}
                        ${dayActivities.length > 0 ? "cursor-pointer hover:bg-primary/15" : "cursor-default"}
                        ${dayActivities.length > 0 && inMonth ? "bg-primary/[0.07]" : ""}
                      `}
                    >
                      <span className={today ? "font-semibold text-primary" : ""}>
                        {format(day, "d")}
                      </span>
                      {dayActivities.length > 0 && (
                        <div className="flex flex-wrap justify-center gap-0.5 mt-1">
                          {dayActivities.slice(0, 4).map((r, i) => (
                            <div
                              key={i}
                              className={`w-2 h-2 rounded-full ${activityTypeToColor(r.type, r.name)}`}
                              style={{
                                opacity: 0.6 + intensity * 0.4,
                              }}
                              title={r.name}
                            />
                          ))}
                          {dayActivities.length > 4 && (
                            <span className="text-[9px] text-muted-foreground font-medium">
                              +{dayActivities.length - 4}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  );

                  if (dayActivities.length === 0) {
                    return (
                      <div key={dateKey} className="flex items-center justify-center">
                        {dayButton}
                      </div>
                    );
                  }

                  return (
                    <Popover key={dateKey}>
                      <PopoverTrigger asChild>{dayButton}</PopoverTrigger>
                      <PopoverContent className="w-80 p-0" align="center">
                        <div className="p-2 border-b border-border">
                          <p className="text-sm font-medium text-foreground">
                            {format(day, "EEEE, MMMM d")}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {dayActivities.length} {dayActivities.length === 1 ? "activity" : "activities"}
                          </p>
                        </div>
                        <div className="max-h-[280px] overflow-y-auto">
                          {dayActivities.map((r, i) => (
                            <button
                              key={r.id ?? i}
                              type="button"
                              onClick={() => navigate(`/activities/${r.id}`)}
                              className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-secondary/50 transition-colors text-left"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-foreground truncate text-sm">{r.name}</p>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                  {r.pace && <span className="tabular-nums">{r.pace}</span>}
                                  {r.duration && <span className="tabular-nums">· {r.duration}</span>}
                                  {r.hr != null && <span>{r.hr} bpm</span>}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {r.nonDist ? (
                                  <span className="text-sm font-medium text-foreground tabular-nums">
                                    {r.duration}
                                  </span>
                                ) : (
                                  <span className="text-sm font-medium text-foreground tabular-nums">
                                    {formatDistance(r.km)}
                                  </span>
                                )}
                                <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-secondary">
                                  {r.type}
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  );
                })
              )}
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground px-5 py-3 border-t border-border">
            Click a day to see activities · Click an activity to view details
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
