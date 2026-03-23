import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { differenceInWeeks, format, parseISO, isValid } from "date-fns";
import type { StepWithDataProps } from "../types";
import { TwoColumnLayout } from "../OnboardingLayout";
import { ExpandableText } from "../components/ExpandableText";
import { TimeWheelPicker } from "@/components/ui/time-wheel-picker";
import { parseGoalTimeToSeconds, formatSecondsToGoalTime } from "@/lib/format";
import { calculateVDOT } from "@/lib/training/vdot";
import {
  classifyGoalFeasibility,
  estimateMaxVdotFromRecentRunsForGoal,
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
  emoji: string;
  className: string;
  barColor: string;
} | null {
  if (!f) return null;
  if (f === "achievable") return { text: "Achievable", emoji: "✓", className: "text-emerald-400 font-semibold", barColor: "bg-emerald-500" };
  if (f === "stretch") return { text: "Stretch goal", emoji: "↑", className: "text-amber-400 font-semibold", barColor: "bg-amber-500" };
  return { text: "Very ambitious", emoji: "⚡", className: "text-red-400 font-semibold", barColor: "bg-red-500" };
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
        return isValid(d) ? format(d, "MMM d, yyyy") : null;
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
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="relative rounded-2xl border border-border bg-card p-5 space-y-3 overflow-hidden"
    >
      {/* Subtle accent top edge */}
      <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-primary/60 via-primary to-primary/60" />

      <div>
        <p className="text-base font-bold text-foreground leading-tight">
          {answers.raceName || answers.raceDistance || "Your race"}
        </p>
        {preview.dateShort && (
          <p className="text-[13px] text-muted-foreground/70 mt-0.5">{preview.dateShort}</p>
        )}
      </div>

      {preview.weeksAway && (
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-muted-foreground/60">Time to race</span>
          <span className="text-sm font-bold text-primary">{preview.weeksAway} weeks</span>
        </div>
      )}

      {preview.goalVdot != null && (
        <div className="pt-1 border-t border-border/60 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-muted-foreground/60 uppercase tracking-wide font-semibold">Goal VDOT</span>
            <span className="text-sm font-bold text-foreground tabular-nums">~{Math.round(preview.goalVdot)}</span>
          </div>
          {preview.pace && (
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-muted-foreground/60 uppercase tracking-wide font-semibold">Required pace</span>
              <span className="text-sm font-bold text-foreground tabular-nums">{preview.pace}</span>
            </div>
          )}
        </div>
      )}

      {feasibilityUi && (
        <div className={`flex items-center gap-1.5 text-sm ${feasibilityUi.className}`}>
          <span className="text-base leading-none">{feasibilityUi.emoji}</span>
          <span>{feasibilityUi.text}</span>
        </div>
      )}

      {answers.goalTime && (
        <div className="pt-1 border-t border-border/60">
          <span className="text-[12px] text-muted-foreground/60 uppercase tracking-wide font-semibold">Target</span>
          <p className="text-xl font-extrabold text-foreground tabular-nums tracking-tight mt-0.5">{answers.goalTime}</p>
        </div>
      )}
    </motion.div>
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
            className="w-full rounded-2xl border border-border bg-card px-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all"
          />
        </div>

        {/* Distance pills */}
        <div>
          <label className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wider block mb-2.5">
            Distance
          </label>
          <div className="flex gap-2 flex-wrap">
            {DISTANCES.map((d) => {
              const isSelected = answers.raceDistance === d.id;
              return (
                <motion.button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    onUpdate({ raceDistance: d.id });
                    if (d.id === "Marathon" && answers.goal === "first_marathon" && !answers.raceName) {
                      onUpdate({ raceDistance: d.id });
                    }
                  }}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.95 }}
                  animate={isSelected ? { scale: 1.04 } : { scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  className={`px-5 py-2.5 rounded-xl text-[13px] font-semibold transition-colors duration-150 ${
                    isSelected
                      ? "bg-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-2 ring-offset-background shadow-[0_0_20px_hsl(var(--primary)/0.2)]"
                      : "bg-card border border-border text-muted-foreground hover:border-primary/30 hover:text-foreground hover:bg-card/80"
                  }`}
                >
                  {d.label}
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Race date */}
        <div>
          <label className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wider block mb-2.5">
            Race date
          </label>
          <input
            type="date"
            value={answers.raceDate || ""}
            min={new Date().toISOString().slice(0, 10)}
            max="2030-12-31"
            onChange={(e) => onUpdate({ raceDate: e.target.value })}
            className="w-full rounded-2xl border border-border bg-card px-4 py-3.5 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all [color-scheme:dark] cursor-pointer"
          />
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
        <AnimatePresence>
          {canProceed && (
            <motion.button
              type="button"
              onClick={onNext}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2 }}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              className="group w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm shadow-[0_0_24px_hsl(var(--primary)/0.2)] hover:shadow-[0_0_32px_hsl(var(--primary)/0.3)] transition-shadow mt-2"
            >
              Continue
              <span className="inline-block ml-1 transition-transform group-hover:translate-x-0.5">→</span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </TwoColumnLayout>
  );
}
