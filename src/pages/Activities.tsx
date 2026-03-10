import { AppLayout } from "@/components/AppLayout";
import { useIntervalsIntegration } from "@/hooks/useIntervalsIntegration";
import { useMergedActivities } from "@/hooks/useMergedIntervalsData";
import { Activity, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { formatDistance } from "@/lib/format";
import { isNonDistanceActivity } from "@/lib/analytics";
function formatDuration(sec: number | null): string {
  if (sec == null) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m >= 60) return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function Activities() {
  const navigate = useNavigate();
  const { isConnected } = useIntervalsIntegration();
  const { data: activities = [], isLoading } = useMergedActivities(730);

  const runs = activities
    .map((a) => {
      const km = a.distance_km ?? 0;
      const nonDist = isNonDistanceActivity(a.type);
      const useKm = !nonDist && km >= 0.01;
      const hasDur = a.duration_seconds != null && a.duration_seconds > 0;
      const dur = formatDuration(a.duration_seconds);
      const detailId = a.external_id && a.source === "intervals_icu"
        ? `icu_${a.external_id}`
        : a.id;
      const displayName = a.name
        ? a.name
        : useKm
          ? `${a.type ?? "Run"} — ${formatDistance(km)}`
          : `${a.type ?? "Activity"}${hasDur ? ` (${dur})` : ""}`;
      return {
        id: detailId,
        date: new Date(a.date),
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
    .filter((r) => r.nonDist ? r.duration && r.duration !== "" : r.km >= 0.01 || (r.duration && r.duration !== ""))
    .sort((a, b) => b.date.getTime() - a.date.getTime());

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
              Import your Garmin data in Settings, or connect intervals.icu to sync from Garmin, Strava, and more.
            </p>
            <button onClick={() => navigate("/settings")} className="pill-button bg-primary text-primary-foreground mt-6 gap-2">
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
                : "Import your Garmin export in Settings, or connect intervals.icu to sync."}
            </p>
            <div className="flex flex-wrap gap-2 justify-center mt-6">
              <button onClick={() => window.location.reload()} className="pill-button bg-primary text-primary-foreground gap-2">
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

  const byDate = runs.reduce<Map<string, typeof runs>>((acc, r) => {
    const key = format(r.date, "yyyy-MM-dd");
    if (!acc.has(key)) acc.set(key, []);
    acc.get(key)!.push(r);
    return acc;
  }, new Map());
  const dateHeaders = Array.from(byDate.keys()).sort((a, b) => b.localeCompare(a));

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <h1 className="text-2xl font-semibold text-foreground">Activities</h1>
        <div className="glass-card overflow-hidden">
          <div className="divide-y divide-border max-h-[70vh] overflow-y-auto">
            {dateHeaders.map((dateKey) => {
              const dayRuns = byDate.get(dateKey)!;
              const dateLabel = format(new Date(dateKey), "EEEE, MMMM d, yyyy");
              return (
                <div key={dateKey}>
                  <div className="px-5 py-2.5 bg-muted/40 text-sm font-medium text-foreground sticky top-0 z-10">
                    {dateLabel}
                  </div>
                  {dayRuns.map((r, i) => (
                    <div
                      key={r.id ?? i}
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/activities/${r.id}`)}
                      onKeyDown={(e) => e.key === "Enter" && navigate(`/activities/${r.id}`)}
                      className="px-5 py-4 flex items-center justify-between gap-4 hover:bg-secondary/30 transition-colors cursor-pointer pl-8"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground truncate">{r.name}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          {r.pace && <span className="tabular-nums">{r.pace}</span>}
                          {r.duration && <span className="tabular-nums">· {r.duration}</span>}
                          {r.hr != null && <span>{r.hr} bpm</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0 text-sm">
                        {r.nonDist ? (
                          <span className="font-medium text-foreground tabular-nums">{r.duration}</span>
                        ) : (
                          <span className="font-medium text-foreground tabular-nums">{formatDistance(r.km)}</span>
                        )}
                        <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-secondary">{r.type}</span>
                        {r.source && <span className="text-[10px] text-muted-foreground/70">{r.source}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
