import { useMemo, useState } from "react";
import { resolveCtlAtlTsb } from "@/hooks/useReadiness";
import { isRunningActivity } from "@/lib/analytics";
import { format, subDays, startOfWeek } from "date-fns";
import type { StepWithDataProps } from "../types";
import { TwoColumnLayout } from "../OnboardingLayout";
import { SliderInput } from "../components/SliderInput";
import { ExpandableText } from "../components/ExpandableText";

const RECENT_RACES = [
  { id: "none", label: "No recent races" },
  { id: "5k", label: "5K result" },
  { id: "10k", label: "10K result" },
  { id: "half", label: "Half result" },
  { id: "marathon", label: "Marathon result" },
] as const;

function computeStats(intervalsData: StepWithDataProps["intervalsData"]) {
  const readiness = intervalsData.readiness;
  const activities = intervalsData.activities;

  const latestWithCtl = [...readiness].reverse().find((r) => {
    const { ctl } = resolveCtlAtlTsb(r);
    return ctl != null && ctl > 0;
  });
  const ctl = latestWithCtl ? resolveCtlAtlTsb(latestWithCtl).ctl : null;

  const runs = activities.filter((a) => isRunningActivity(a.type) && (a.distance_km ?? 0) > 0.5);

  const fourWeeksAgo = format(subDays(new Date(), 28), "yyyy-MM-dd");
  const recentRuns = runs.filter((a) => a.date >= fourWeeksAgo);

  const weeklyKm = (() => {
    if (recentRuns.length === 0) return null;
    const weekTotals: Record<string, number> = {};
    for (const r of recentRuns) {
      const wk = format(startOfWeek(new Date(r.date), { weekStartsOn: 1 }), "yyyy-MM-dd");
      weekTotals[wk] = (weekTotals[wk] ?? 0) + (r.distance_km ?? 0);
    }
    const weeks = Object.values(weekTotals);
    return weeks.length > 0 ? Math.round(weeks.reduce((a, b) => a + b, 0) / weeks.length) : null;
  })();

  const lastRun = runs.length > 0 ? runs[runs.length - 1] : null;
  const lastRunLabel = (() => {
    if (!lastRun?.date) return null;
    const d = new Date(lastRun.date);
    const today = new Date();
    const diffDays = Math.round((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return format(d, "MMM d");
  })();

  const bestPace = (() => {
    const paces = recentRuns
      .filter((r) => r.avg_pace)
      .map((r) => {
        const parts = r.avg_pace!.split(":");
        if (parts.length === 2) return Number(parts[0]) * 60 + Number(parts[1]);
        return null;
      })
      .filter((p): p is number => p != null && p > 0);
    if (paces.length === 0) return null;
    const best = Math.min(...paces);
    const min = Math.floor(best / 60);
    const sec = Math.round(best % 60);
    return `${min}:${String(sec).padStart(2, "0")}/km`;
  })();

  return { ctl, weeklyKm, lastRunLabel, bestPace, hasData: ctl != null || weeklyKm != null };
}

export function Step4CurrentTraining({ answers, onUpdate, onNext, onBack, intervalsData }: StepWithDataProps) {
  const stats = useMemo(() => computeStats(intervalsData), [intervalsData]);
  const [manualOverride, setManualOverride] = useState(false);
  const showDataCard = stats.hasData && !manualOverride;
  const showEmptyFitnessCard =
    !showDataCard && !manualOverride && (!intervalsData.isConnected || !stats.hasData);

  const leftContent = showDataCard ? (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <p className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wider">Your Current Fitness</p>

        <div className="space-y-3">
          {stats.ctl != null && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">CTL (Fitness)</span>
              <span className="text-sm font-bold text-foreground tabular-nums">{Math.round(stats.ctl)}</span>
            </div>
          )}
          {stats.weeklyKm != null && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Weekly avg</span>
              <span className="text-sm font-bold text-foreground tabular-nums">{stats.weeklyKm} km</span>
            </div>
          )}
          {stats.lastRunLabel && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Last run</span>
              <span className="text-sm font-bold text-foreground">{stats.lastRunLabel}</span>
            </div>
          )}
          {stats.bestPace && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Best recent</span>
              <span className="text-sm font-bold text-foreground tabular-nums">{stats.bestPace}</span>
            </div>
          )}
        </div>

        <p className="text-[10px] text-muted-foreground/70 pt-1">Pulled from intervals.icu</p>
      </div>

      <button
        onClick={() => setManualOverride(true)}
        className="text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
      >
        This looks wrong →
      </button>
    </div>
  ) : showEmptyFitnessCard ? (
    <div className="rounded-2xl border border-border bg-muted/30 p-5 space-y-2">
      <p className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wider">
        Your current fitness
      </p>
      <p className="text-sm text-muted-foreground/80 leading-relaxed">
        No data yet — we&apos;ll build your baseline from scratch once you connect Intervals or describe your
        training on the right.
      </p>
    </div>
  ) : null;

  return (
    <TwoColumnLayout
      step={4}
      goal={answers.goal}
      title="Where are you right now?"
      leftContent={leftContent}
      onBack={onBack}
    >
      <div className="space-y-6">
        {showDataCard ? (
          /* Connected — just ask for qualitative info */
          <div className="space-y-5">
            <p className="text-[15px] text-muted-foreground/70 leading-relaxed">
              Your data looks good. Anything I should know that the numbers don&apos;t show?
            </p>
            <textarea
              value={answers.currentFitnessNote}
              onChange={(e) => onUpdate({ currentFitnessNote: e.target.value })}
              placeholder="E.g. I've been running 4x per week, easy runs feel comfortable at 5:30/km, but my left calf has been tight lately..."
              rows={5}
              className="w-full rounded-2xl border border-border bg-card px-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60 transition-colors resize-none leading-relaxed"
            />
          </div>
        ) : (
          /* No data — manual entry */
          <div className="space-y-8">
            <SliderInput
              min={0}
              max={150}
              step={5}
              value={answers.weeklyKm}
              onChange={(v) => onUpdate({ weeklyKm: v })}
              label="Weekly volume"
              unit=" km"
              formatValue={(v) => `~${v} km/week`}
            />

            {/* Recent race */}
            <div>
              <label className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wider block mb-3">Recent race result</label>
              <div className="flex gap-2 flex-wrap">
                {RECENT_RACES.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => onUpdate({ recentRaceType: r.id, recentRaceTime: r.id === "none" ? "" : answers.recentRaceTime })}
                    className={`px-4 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-150 ${
                      answers.recentRaceType === r.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-card border border-border text-muted-foreground hover:border-foreground/15"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>

              {answers.recentRaceType && answers.recentRaceType !== "none" && (
                <div className="mt-3 onboarding-slide-forward">
                  <input
                    type="text"
                    value={answers.recentRaceTime}
                    onChange={(e) => {
                      const clean = e.target.value.replace(/[^\d:]/g, "");
                      onUpdate({ recentRaceTime: clean });
                    }}
                    placeholder="What was your time? e.g. 22:30"
                    className="w-full rounded-2xl border border-border bg-card px-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60 transition-colors tabular-nums"
                  />
                </div>
              )}
            </div>

            {/* Free text */}
            <ExpandableText
              label="Describe your current fitness"
              value={answers.currentFitnessNote}
              onChange={(v) => onUpdate({ currentFitnessNote: v })}
              placeholder="E.g. I've been running 4x per week, easy runs feel comfortable at 5:30/km..."
            />
          </div>
        )}

        {/* Continue */}
        <button
          onClick={onNext}
          className="group w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 active:scale-[0.98] transition-all"
        >
          Continue
          <span className="inline-block ml-1 transition-transform group-hover:translate-x-0.5">→</span>
        </button>
      </div>
    </TwoColumnLayout>
  );
}
