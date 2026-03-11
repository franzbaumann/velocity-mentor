import { useState } from "react";
import { ReadinessRing } from "@/components/ReadinessRing";
import { WorkoutBadge } from "@/components/WorkoutBadge";
import { Sparkline } from "@/components/Sparkline";
import { AppLayout } from "@/components/AppLayout";
import { useGreeting } from "@/hooks/useGreeting";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useGarminImportStatus } from "@/hooks/useGarminImportStatus";
import { predictRaceTime, formatRaceTime, calculateZonePaces, findBestEffort } from "@/lib/race-prediction";
import { TrendingDown, Moon, Heart, ChevronRight, MessageCircle } from "lucide-react";
import { formatSleepHours } from "@/lib/format";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const RACE_DISTANCES: { km: number; label: string }[] = [
  { km: 5, label: "5K" },
  { km: 10, label: "10K" },
  { km: 21.0975, label: "Half Marathon" },
  { km: 42.195, label: "Marathon" },
];

function goalRaceToKm(goalRace: string): number {
  const t = String(goalRace || "").toLowerCase();
  if (t.includes("marathon") && !t.includes("half")) return 42.195;
  if (t.includes("half")) return 21.0975;
  if (t.includes("10")) return 10;
  if (t.includes("5")) return 5;
  return 21.0975;
}

function goalRaceToLabel(goalRace: string): string {
  const t = String(goalRace || "").toLowerCase();
  if (t.includes("marathon") && !t.includes("half")) return "Marathon";
  if (t.includes("half")) return "Half Marathon";
  if (t.includes("10")) return "10K";
  if (t.includes("5")) return "5K";
  return "Half Marathon";
}

/** Light mode: theme colors. Dark mode: match ActivityDetail bar (hex) */
const HR_ZONE_LIGHT = ["bg-secondary", "bg-accent/60", "bg-primary/60", "bg-warning/80", "bg-destructive/70"] as const;

const fadeIn = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3 },
};

function RacePredictionCard({
  activities,
  ctl,
  goalRaceType,
}: {
  activities: Array<{ distance_km: number | null; duration_seconds: number | null; date: string }>;
  ctl: number | null;
  goalRaceType: string;
}) {
  const [open, setOpen] = useState(false);
  const best = findBestEffort(activities);
  if (!best || !ctl) return null;

  const goalKm = goalRaceToKm(goalRaceType);
  const goalLabel = goalRaceToLabel(goalRaceType);
  const baselineCTL = Math.max(ctl * 0.7, 20);
  const predicted = predictRaceTime(best.timeSeconds, best.distanceKm, goalKm, ctl, baselineCTL);
  const paces = calculateZonePaces(predicted, goalKm);

  const allPredictions = RACE_DISTANCES.map(({ km, label }) => ({
    label,
    km,
    time: predictRaceTime(best.timeSeconds, best.distanceKm, km, ctl, baselineCTL),
  }));

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => e.key === "Enter" && setOpen(true)}
        className="glass-card p-5 h-full hover:opacity-95 transition-opacity cursor-pointer"
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <span className="text-sm">🏁</span>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Race Prediction</p>
            <p className="text-xs text-muted-foreground">{goalLabel}</p>
          </div>
        </div>
        <p className="text-3xl font-bold tabular-nums text-foreground mb-2">{formatRaceTime(predicted)}</p>
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>Z2 pace: {paces.zone2}</p>
          <p>Threshold: {paces.threshold}</p>
          <p>VO2max: {paces.vo2max}</p>
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">Based on best effort · CTL {Math.round(ctl)}</p>
        <div className="flex items-center gap-1 mt-2 text-xs text-primary font-medium">
          View all distances <ChevronRight className="w-3.5 h-3.5" />
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Race Predictions</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-4">
            Based on your best effort ({best.distanceKm.toFixed(1)} km) · CTL {Math.round(ctl)}
          </p>
          <div className="space-y-3">
            {allPredictions.map(({ label, km, time }) => (
              <div
                key={km}
                className="flex items-center justify-between rounded-lg border px-4 py-3 bg-muted/30"
              >
                <span className="font-medium text-foreground">{label}</span>
                <span className="tabular-nums font-semibold text-foreground">{formatRaceTime(time)}</span>
              </div>
            ))}
          </div>
          <Link
            to="/stats"
            className="block mt-4 text-center text-sm text-primary font-medium hover:underline"
            onClick={() => setOpen(false)}
          >
            View stats
          </Link>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function Dashboard() {
  const greeting = useGreeting();
  const { weekStats, lastActivity, recoveryMetrics, readiness, weekPlan, todaysWorkout, athlete, isSampleData, activities } = useDashboardData();
  const garminBanner = useGarminImportStatus();
  const progressPct = Math.round((weekStats.actualKm / weekStats.plannedKm) * 100);

  return (
    <AppLayout>
      <motion.div {...fadeIn} className="space-y-6">
        {/* Garmin import banners - hide when intervals.icu is connected and has real data */}
        {garminBanner === "never" && !isSampleData && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground flex items-center justify-between gap-3">
            <span>Import your Garmin data to unlock real stats</span>
            <Link
              to="/settings"
              className="shrink-0 text-sm font-medium text-primary hover:underline"
            >
              Settings
            </Link>
          </div>
        )}
        {garminBanner && garminBanner !== "never" && (
          <div className="rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-muted-foreground">
            {garminBanner}
          </div>
        )}
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{greeting}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Week 6 of 14 · {athlete.currentPhase} Phase · {athlete.goalRace.type} in{" "}
            {athlete.goalRace.weeksRemaining} weeks
          </p>
        </div>

        {/* Readiness Card — clickable to Stats */}
        <Link to="/stats" className="block">
          <div className="glass-card p-6 relative hover:opacity-95 transition-opacity cursor-pointer">
            {isSampleData && (
              <span className="absolute top-3 right-3 text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">Sample</span>
            )}
            <div className="flex items-center gap-6">
              <ReadinessRing score={readiness.score} size={96} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-base font-semibold text-foreground">Today's Readiness</h2>
                  <WorkoutBadge type={todaysWorkout.type} />
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {readiness.aiSummary}
                </p>
                <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Heart className="w-3 h-3" /> HRV {readiness.hrv}ms
                    <TrendingDown className="w-3 h-3 text-warning" />
                  </span>
                  <span className="flex items-center gap-1">
                    <Moon className="w-3 h-3" /> {formatSleepHours(readiness.sleepHours)} sleep
                  </span>
                  <span className="mono-text">TSB {readiness.tsb != null ? Number(readiness.tsb).toFixed(1) : "—"}</span>
                </div>
                <div className="flex items-center gap-1 mt-2 text-xs text-primary font-medium">
                  View details <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
          </div>
        </Link>

        {/* 3-column grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1 — This Week — clickable to Activities */}
          <Link to="/activities" className="block">
            <div className="glass-card p-5 space-y-4 hover:opacity-95 transition-opacity cursor-pointer h-full">
              <p className="section-header">This Week</p>
            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-foreground font-medium">
                  {weekStats.actualKm} / {weekStats.plannedKm} km
                </span>
                <span className="mono-text text-muted-foreground">{progressPct}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Quality sessions</span>
              <div className="flex gap-1.5">
                {Array.from({ length: weekStats.qualityPlanned }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-2.5 h-2.5 rounded-full ${
                      i < weekStats.qualityDone ? "bg-primary" : "bg-muted"
                    }`}
                  />
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Load trend</p>
              <Sparkline data={weekStats.tssData} />
            </div>
            <div className="flex items-center gap-1 mt-2 text-xs text-primary font-medium">
              View activities <ChevronRight className="w-3.5 h-3.5" />
            </div>
            </div>
          </Link>

          {/* Card 2 — Last Activity — clickable to Activity Detail */}
          {lastActivity.detailId ? (
            <Link to={`/activities/${lastActivity.detailId}`} className="block">
              <div className="glass-card p-5 space-y-3 hover:opacity-95 transition-opacity cursor-pointer h-full">
                <p className="section-header">Last Activity</p>
                <div className="flex items-baseline justify-between">
                  <h3 className="text-sm font-medium text-foreground">{lastActivity.type}</h3>
                  <span className="text-xs text-muted-foreground">{lastActivity.date}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Distance</p>
                    <p className="mono-text font-medium text-foreground">{lastActivity.distance} km</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Avg Pace</p>
                    <p className="mono-text font-medium text-foreground">{lastActivity.avgPace}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Avg HR</p>
                    <p className="mono-text font-medium text-foreground">{Math.round(lastActivity.avgHr)} bpm</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Duration</p>
                    <p className="mono-text font-medium text-foreground">{lastActivity.duration}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">HR Zones</p>
                  <div className="flex h-3 rounded-full overflow-hidden">
                    <div className={`${HR_ZONE_LIGHT[0]} dark:bg-[#94a3b8]`} style={{ width: `${lastActivity.hrZones.z1}%` }} />
                    <div className={`${HR_ZONE_LIGHT[1]} dark:bg-[#3b82f6]`} style={{ width: `${lastActivity.hrZones.z2}%` }} />
                    <div className={`${HR_ZONE_LIGHT[2]} dark:bg-[#22c55e]`} style={{ width: `${lastActivity.hrZones.z3}%` }} />
                    <div className={`${HR_ZONE_LIGHT[3]} dark:bg-[#f97316]`} style={{ width: `${lastActivity.hrZones.z4}%` }} />
                    <div className={`${HR_ZONE_LIGHT[4]} dark:bg-[#ef4444]`} style={{ width: `${lastActivity.hrZones.z5}%` }} />
                  </div>
                  <div className="flex mt-1 text-[10px] text-muted-foreground">
                    {([1, 2, 3, 4, 5] as const).map((i) => {
                      const pct = lastActivity.hrZones[`z${i}` as keyof typeof lastActivity.hrZones] ?? 0;
                      return (
                        <span key={i} className="text-center shrink-0" style={{ width: `${pct}%`, minWidth: pct > 0 ? "1ch" : 0 }}>
                          {pct >= 5 ? `Z${i}` : pct > 0 ? "+" : ""}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-1 mt-2 text-xs text-primary font-medium">
                  View activity <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </Link>
          ) : (
            <div className="glass-card p-5 space-y-3 h-full">
              <p className="section-header">Last Activity</p>
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-medium text-foreground">{lastActivity.type}</h3>
                <span className="text-xs text-muted-foreground">{lastActivity.date}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Distance</p>
                  <p className="mono-text font-medium text-foreground">{lastActivity.distance} km</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Avg Pace</p>
                  <p className="mono-text font-medium text-foreground">{lastActivity.avgPace}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Avg HR</p>
                  <p className="mono-text font-medium text-foreground">{Math.round(lastActivity.avgHr)} bpm</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Duration</p>
                  <p className="mono-text font-medium text-foreground">{lastActivity.duration}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">HR Zones</p>
                <div className="flex h-3 rounded-full overflow-hidden">
                  <div className={`${HR_ZONE_LIGHT[0]} dark:bg-[#94a3b8]`} style={{ width: `${lastActivity.hrZones.z1}%` }} />
                  <div className={`${HR_ZONE_LIGHT[1]} dark:bg-[#3b82f6]`} style={{ width: `${lastActivity.hrZones.z2}%` }} />
                  <div className={`${HR_ZONE_LIGHT[2]} dark:bg-[#22c55e]`} style={{ width: `${lastActivity.hrZones.z3}%` }} />
                  <div className={`${HR_ZONE_LIGHT[3]} dark:bg-[#f97316]`} style={{ width: `${lastActivity.hrZones.z4}%` }} />
                  <div className={`${HR_ZONE_LIGHT[4]} dark:bg-[#ef4444]`} style={{ width: `${lastActivity.hrZones.z5}%` }} />
                </div>
                <div className="flex mt-1 text-[10px] text-muted-foreground">
                  {([1, 2, 3, 4, 5] as const).map((i) => {
                    const pct = lastActivity.hrZones[`z${i}` as keyof typeof lastActivity.hrZones] ?? 0;
                    return (
                      <span key={i} className="text-center shrink-0" style={{ width: `${pct}%`, minWidth: pct > 0 ? "1ch" : 0 }}>
                        {pct >= 5 ? `Z${i}` : pct > 0 ? "+" : ""}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Card 3 — Recovery Metrics — clickable to Stats */}
          <Link to="/stats" className="block">
            <div className="glass-card p-5 space-y-3 hover:opacity-95 transition-opacity cursor-pointer h-full">
            <p className="section-header">Recovery</p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">HRV</p>
                <div className="flex items-center gap-1.5">
                  <span className="mono-text text-lg font-semibold text-foreground">
                    {recoveryMetrics.hrv}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    / {recoveryMetrics.hrv7dayAvg} avg
                  </span>
                  <TrendingDown className="w-3.5 h-3.5 text-warning" />
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Sleep</p>
                <div className="flex items-center gap-1.5">
                  <span className="mono-text text-lg font-semibold text-foreground">
                    {formatSleepHours(recoveryMetrics.sleepHours)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {recoveryMetrics.sleepScore != null
                      ? `Score ${recoveryMetrics.sleepScore}`
                      : recoveryMetrics.sleepQuality != null
                        ? `${recoveryMetrics.sleepQuality}/10`
                        : ""}
                  </span>
                </div>
              </div>
            </div>
                <div>
              <p className="text-xs text-muted-foreground mb-1">HRV (7 days)</p>
              <Sparkline data={recoveryMetrics.hrvTrend} color="hsl(141, 72%, 50%)" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Resting HR (7 days)</p>
              <Sparkline data={recoveryMetrics.restingHrTrend} color="hsl(0, 84%, 60%)" />
            </div>
            <div className="flex items-center gap-1 mt-2 text-xs text-primary font-medium">
              View stats <ChevronRight className="w-3.5 h-3.5" />
            </div>
            </div>
          </Link>

          {/* Card 4 — Race Prediction — clickable to show all distances */}
          <RacePredictionCard
            activities={activities}
            ctl={readiness.ctl}
            goalRaceType={athlete.goalRace.type}
          />

          {/* Ask Kipcoachee — prominent CTA in open space */}
          <Link to="/coach" className="block md:col-span-2">
            <div className="glass-card p-5 h-full min-h-[140px] flex flex-col justify-center items-center gap-3 hover:opacity-95 transition-opacity cursor-pointer border-2 border-dashed border-primary/30 hover:border-primary/50">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <MessageCircle className="w-6 h-6 text-primary" />
              </div>
              <p className="text-base font-semibold text-foreground">Ask Kipcoachee</p>
              <p className="text-xs text-muted-foreground text-center">Get training advice, adjust your plan, or chat about your goals</p>
              <div className="flex items-center gap-1 text-xs text-primary font-medium">
                Open chat <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </div>
          </Link>
        </div>

        {/* Upcoming 7 days */}
        <div>
          <p className="section-header">Next 7 Days</p>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
            {weekPlan.map((day) => {
              const content = (
                <div
                  className={`glass-card glass-card-hover p-4 cursor-pointer min-w-[140px] flex-shrink-0 ${
                    day.isToday ? "ring-2 ring-primary/30" : ""
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-medium ${day.isToday ? "text-primary" : "text-muted-foreground"}`}>
                      {day.isToday ? "Today" : day.day}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{day.date}</span>
                  </div>
                  <WorkoutBadge type={day.type} />
                  <p className="text-sm font-medium text-foreground mt-2 leading-tight">{day.title}</p>
                  {day.distance > 0 && (
                    <p className="mono-text text-xs text-muted-foreground mt-1">
                      {day.distance} km
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-1">{day.detail}</p>
                </div>
              );
              return day.detailId ? (
                <Link key={day.day} to={`/activities/${day.detailId}`} className="block">
                  {content}
                </Link>
              ) : (
                <Link key={day.day} to="/activities" className="block">
                  {content}
                </Link>
              );
            })}
          </div>
        </div>
      </motion.div>
    </AppLayout>
  );
}
