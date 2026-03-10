import { ReadinessRing } from "@/components/ReadinessRing";
import { WorkoutBadge } from "@/components/WorkoutBadge";
import { Sparkline } from "@/components/Sparkline";
import { AppLayout } from "@/components/AppLayout";
import { useGreeting } from "@/hooks/useGreeting";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useGarminImportStatus } from "@/hooks/useGarminImportStatus";
import { predictRaceTime, formatRaceTime, calculateZonePaces, findBestEffort } from "@/lib/race-prediction";
import { TrendingDown, Moon, Heart } from "lucide-react";
import { formatSleepHours } from "@/lib/format";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";

const fadeIn = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3 },
};

function RacePredictionCard({ activities, ctl }: { activities: Array<{ distance_km: number | null; duration_seconds: number | null; date: string }>; ctl: number | null }) {
  const best = findBestEffort(activities);
  if (!best || !ctl) return null;

  const goalKm = 21.1;
  const baselineCTL = Math.max(ctl * 0.7, 20);
  const predicted = predictRaceTime(best.timeSeconds, best.distanceKm, goalKm, ctl, baselineCTL);
  const paces = calculateZonePaces(predicted, goalKm);

  return (
    <div className="glass-card p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <span className="text-sm">🏁</span>
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Race Prediction</p>
          <p className="text-xs text-muted-foreground">Half Marathon</p>
        </div>
      </div>
      <p className="text-3xl font-bold tabular-nums text-foreground mb-2">{formatRaceTime(predicted)}</p>
      <div className="space-y-1 text-xs text-muted-foreground">
        <p>Z2 pace: {paces.zone2}</p>
        <p>Threshold: {paces.threshold}</p>
        <p>VO2max: {paces.vo2max}</p>
      </div>
      <p className="text-[10px] text-muted-foreground mt-3">Based on best effort · CTL {Math.round(ctl)}</p>
    </div>
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

        {/* Readiness Card */}
        <div className="glass-card p-6 relative">
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
            </div>
          </div>
        </div>

        {/* 3-column grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1 — This Week */}
          <div className="glass-card p-5 space-y-4">
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
          </div>

          {/* Card 2 — Last Activity */}
          <div className="glass-card p-5 space-y-3">
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
            {/* HR Zones mini bar */}
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">HR Zones</p>
              <div className="flex h-3 rounded-full overflow-hidden">
                <div className="bg-secondary" style={{ width: `${lastActivity.hrZones.z1}%` }} />
                <div className="bg-accent/60" style={{ width: `${lastActivity.hrZones.z2}%` }} />
                <div className="bg-primary/60" style={{ width: `${lastActivity.hrZones.z3}%` }} />
                <div className="bg-warning/80" style={{ width: `${lastActivity.hrZones.z4}%` }} />
                <div className="bg-destructive/70" style={{ width: `${lastActivity.hrZones.z5}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>Z1</span><span>Z2</span><span>Z3</span><span>Z4</span><span>Z5</span>
              </div>
            </div>
          </div>

          {/* Card 3 — Recovery Metrics */}
          <div className="glass-card p-5 space-y-3">
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
                    {recoveryMetrics.sleepQuality}/10
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
          </div>

          {/* Card 4 — Race Prediction */}
          <RacePredictionCard activities={activities} ctl={readiness.ctl} />
        </div>

        {/* Upcoming 7 days */}
        <div>
          <p className="section-header">Next 7 Days</p>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
            {weekPlan.map((day) => (
              <div
                key={day.day}
                className={`glass-card glass-card-hover p-4 min-w-[140px] flex-shrink-0 cursor-pointer ${
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
            ))}
          </div>
        </div>
      </motion.div>
    </AppLayout>
  );
}
