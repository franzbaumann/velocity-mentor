import { useMemo } from "react";
import { differenceInWeeks, format, parseISO, isValid } from "date-fns";
import type { StepWithDataProps } from "../types";
import { TwoColumnLayout } from "../OnboardingLayout";
import { ExpandableText } from "../components/ExpandableText";
import { DateWheelPicker } from "@/components/ui/date-wheel-picker";
import { TimeWheelPicker } from "@/components/ui/time-wheel-picker";
import { parseGoalTimeToSeconds, formatSecondsToGoalTime } from "@/lib/format";
import { calculateVDOT } from "@/lib/training/vdot";
import {
  classifyGoalFeasibility,
  estimateMaxVdotFromRecentRuns,
  getRaceDistanceMetersForVdot,
} from "@/lib/onboarding/estimateBaselineVdot";

const DISTANCES = [
  { id: "1500m", label: "1500m" },
  { id: "Mile", label: "Mile" },
  { id: "5K", label: "5K" },
  { id: "10K", label: "10K" },
  { id: "Half Marathon", label: "Half" },
  { id: "Marathon", label: "Marathon" },
  { id: "Ultra", label: "Ultra" },
] as const;

const DISTANCE_KM: Record<string, number> = {
  "1500m": 1.5,
  Mile: 1.60934,
  "5K": 5,
  "10K": 10,
  "Half Marathon": 21.0975,
  Marathon: 42.195,
  Ultra: 50,
};

function formatPace(totalSeconds: number, distanceKm: number): string {
  const paceSeconds = totalSeconds / distanceKm;
  let min = Math.floor(paceSeconds / 60);
  let sec = Math.round(paceSeconds % 60);
  if (sec >= 60) {
    min += 1;
    sec = 0;
  }
  return `${min}:${String(sec).padStart(2, "0")}/km`;
}

function feasibilityLabel(f: ReturnType<typeof classifyGoalFeasibility>): {
  text: string;
  className: string;
} | null {
  if (!f) return null;
  if (f === "achievable") return { text: "Achievable", className: "text-emerald-500 font-semibold" };
  if (f === "stretch") return { text: "Stretch goal", className: "text-amber-500 font-semibold" };
  return { text: "Very ambitious", className: "text-red-400 font-semibold" };
}

export function Step3RaceTarget({ answers, onUpdate, onNext, onBack, intervalsData }: StepWithDataProps) {
  const canProceed = answers.raceDistance && answers.raceDate;

  const baselineVdot = useMemo(
    () =>
      answers.raceDistance
        ? estimateMaxVdotFromRecentRunsForGoal(intervalsData.activities, answers.raceDistance)
        : null,
    [intervalsData.activities, answers.raceDistance]
  );

  const preview = useMemo(() => {
    const weeksAway = (() => {
      if (!answers.raceDate) return null;
      try {
        const d = parseISO(answers.raceDate);
        if (!isValid(d)) return null;
        const w = differenceInWeeks(d, new Date());
        return w > 0 ? w : null;
      } catch {
        return null;
      }
    })();

    const pace = (() => {
      if (!answers.goalTime || !answers.raceDistance) return null;
      const totalSec = parseGoalTimeToSeconds(answers.goalTime);
      const km = DISTANCE_KM[answers.raceDistance];
      if (!totalSec || !km) return null;
      return formatPace(totalSec, km);
    })();

    const dateShort = (() => {
      if (!answers.raceDate) return null;
      try {
        const d = parseISO(answers.raceDate);
        return isValid(d) ? format(d, "MMM d") : null;
      } catch {
        return null;
      }
    })();

    const goalVdot = (() => {
      if (!answers.goalTime || !answers.raceDistance) return null;
      const totalSec = parseGoalTimeToSeconds(answers.goalTime);
      const meters = getRaceDistanceMetersForVdot(answers.raceDistance);
      if (!totalSec || !meters) return null;
      return calculateVDOT(meters, totalSec);
    })();

    const feasibility = goalVdot != null ? classifyGoalFeasibility(goalVdot, baselineVdot) : null;

    return { weeksAway, pace, dateShort, goalVdot, feasibility };
  }, [
    answers.raceDate,
    answers.goalTime,
    answers.raceDistance,
    baselineVdot,
  ]);

  const hasPreviewData = answers.raceName || answers.raceDistance || answers.raceDate;
  const feasibilityUi = feasibilityLabel(preview.feasibility);

  const leftContent = hasPreviewData ? (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-2 onboarding-slide-forward">
      <p className="text-base font-bold text-foreground">
        {answers.raceName || answers.raceDistance || "Your race"}
      </p>
      <div className="flex items-center gap-2 text-sm text-muted-foreground/70 flex-wrap">
        {preview.dateShort && <span>{preview.dateShort}</span>}
        {preview.weeksAway && (
          <>
            {preview.dateShort && <span className="text-muted-foreground/50">·</span>}
            <span className="text-primary font-semibold">{preview.weeksAway} weeks</span>
          </>
        )}
      </div>
      {preview.goalVdot != null && (
        <p className="text-sm text-muted-foreground">
          Implied by your goal:{" "}
          <span className="text-foreground font-semibold tabular-nums">~{Math.round(preview.goalVdot)} VDOT</span>
        </p>
      )}
      {feasibilityUi && (
        <p className={`text-sm ${feasibilityUi.className}`}>
          {feasibilityUi.text}
        </p>
      )}
      {answers.goalTime && (
        <p className="text-sm text-muted-foreground">
          Target: <span className="text-foreground font-semibold">{answers.goalTime}</span>
        </p>
      )}
      {preview.pace && (
        <p className="text-sm text-muted-foreground">
          Required pace: <span className="text-foreground font-semibold">{preview.pace}</span>
        </p>
      )}
    </div>
  ) : null;

  return (
    <TwoColumnLayout
      step={3}
      goal={answers.goal}
      title="Tell me about your race."
      leftContent={leftContent}
      onBack={onBack}
    >
      <div className="space-y-6">
        {/* Race name */}
        <div>
          <label className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wider block mb-2.5">
            Race name
          </label>
          <input
            type="text"
            value={answers.raceName}
            onChange={(e) => onUpdate({ raceName: e.target.value })}
            placeholder="e.g. Stockholm Marathon"
            className="w-full rounded-2xl border border-border bg-card px-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60 transition-colors"
          />
        </div>

        {/* Distance pills */}
        <div>
          <label className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wider block mb-2.5">
            Distance
          </label>
          <div className="flex gap-2 flex-wrap">
            {DISTANCES.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  onUpdate({ raceDistance: d.id });
                  if (d.id === "Marathon" && answers.goal === "first_marathon" && !answers.raceName) {
                    onUpdate({ raceDistance: d.id });
                  }
                }}
                className={`px-5 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-150 ${
                  answers.raceDistance === d.id
                    ? "bg-primary text-primary-foreground shadow-[0_0_16px_hsl(var(--primary)/0.15)]"
                    : "bg-card border border-border text-muted-foreground hover:border-foreground/15 hover:text-foreground/70"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Race date */}
        <div>
          <label className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wider block mb-2.5">
            Race date
          </label>
          <div className="rounded-2xl border border-border bg-card p-3">
            <DateWheelPicker
              value={answers.raceDate ? parseISO(answers.raceDate) : new Date()}
              onChange={(d) => onUpdate({ raceDate: format(d, "yyyy-MM-dd") })}
              minYear={new Date().getFullYear()}
              size="sm"
            />
          </div>
        </div>

        {/* Goal time */}
        <div>
          <label className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wider block mb-2.5">
            Goal time
          </label>
          <div className="rounded-2xl border border-border bg-card p-3">
            <TimeWheelPicker
              value={parseGoalTimeToSeconds(answers.goalTime)}
              onChange={(sec) => onUpdate({ goalTime: formatSecondsToGoalTime(sec) })}
              size="sm"
            />
          </div>
        </div>

        {/* Optional detail */}
        <ExpandableText
          label="Tell me more about this race"
          value={answers.goalDetail}
          onChange={(v) => onUpdate({ goalDetail: v })}
          placeholder="E.g. It's a flat course, my third attempt at this distance..."
        />

        {/* Continue */}
        {canProceed && (
          <button
            type="button"
            onClick={onNext}
            className="group w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 active:scale-[0.98] transition-all mt-2"
          >
            Continue
            <span className="inline-block ml-1 transition-transform group-hover:translate-x-0.5">→</span>
          </button>
        )}
      </div>
    </TwoColumnLayout>
  );
}
