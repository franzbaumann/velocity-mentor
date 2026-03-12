import { useMemo } from "react";
import { differenceInWeeks, format, parseISO, isValid } from "date-fns";
import type { StepProps } from "../types";
import { TwoColumnLayout } from "../OnboardingLayout";
import { ExpandableText } from "../components/ExpandableText";

const DISTANCES = [
  { id: "5K", label: "5K" },
  { id: "10K", label: "10K" },
  { id: "Half Marathon", label: "Half" },
  { id: "Marathon", label: "Marathon" },
  { id: "Ultra", label: "Ultra" },
] as const;

const DISTANCE_KM: Record<string, number> = {
  "5K": 5,
  "10K": 10,
  "Half Marathon": 21.0975,
  Marathon: 42.195,
};

function parseGoalTimeSeconds(time: string): number | null {
  const parts = time.split(":").map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

function formatPace(totalSeconds: number, distanceKm: number): string {
  const paceSeconds = totalSeconds / distanceKm;
  const min = Math.floor(paceSeconds / 60);
  const sec = Math.round(paceSeconds % 60);
  return `${min}:${String(sec).padStart(2, "0")}/km`;
}

export function Step3RaceTarget({ answers, onUpdate, onNext, onBack }: StepProps) {
  const canProceed = answers.raceDistance && answers.raceDate;

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
      const totalSec = parseGoalTimeSeconds(answers.goalTime);
      const km = DISTANCE_KM[answers.raceDistance];
      if (!totalSec || !km) return null;
      return formatPace(totalSec, km);
    })();

    const dateFormatted = (() => {
      if (!answers.raceDate) return null;
      try {
        const d = parseISO(answers.raceDate);
        return isValid(d) ? format(d, "MMMM d, yyyy") : null;
      } catch {
        return null;
      }
    })();

    return { weeksAway, pace, dateFormatted };
  }, [answers.raceDate, answers.goalTime, answers.raceDistance]);

  const hasPreviewData = answers.raceName || answers.raceDistance || answers.raceDate;

  const leftContent = hasPreviewData ? (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-2 onboarding-slide-forward">
      <p className="text-base font-bold text-foreground">
        {answers.raceName || answers.raceDistance || "Your race"}
      </p>
      <div className="flex items-center gap-2 text-sm text-muted-foreground/70 flex-wrap">
        {preview.dateFormatted && <span>{preview.dateFormatted}</span>}
        {preview.weeksAway && (
          <>
            {preview.dateFormatted && <span className="text-muted-foreground/50">·</span>}
            <span className="text-primary font-semibold">{preview.weeksAway} weeks</span>
          </>
        )}
      </div>
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
          <label className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wider block mb-2.5">Race name</label>
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
          <label className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wider block mb-2.5">Distance</label>
          <div className="flex gap-2 flex-wrap">
            {DISTANCES.map((d) => (
              <button
                key={d.id}
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
          <label className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wider block mb-2.5">Race date</label>
          <input
            type="date"
            value={answers.raceDate}
            onChange={(e) => onUpdate({ raceDate: e.target.value })}
            min={format(new Date(), "yyyy-MM-dd")}
            className="w-full rounded-2xl border border-border bg-card px-4 py-3.5 text-sm text-foreground outline-none focus:border-primary/60 transition-colors [color-scheme:dark]"
          />
        </div>

        {/* Goal time */}
        <div>
          <label className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wider block mb-2.5">Goal time</label>
          <input
            type="text"
            value={answers.goalTime}
            onChange={(e) => {
              const raw = e.target.value;
              const clean = raw.replace(/[^\d:]/g, "");
              onUpdate({ goalTime: clean });
            }}
            placeholder={answers.raceDistance === "Marathon" ? "e.g. 2:55:00" : answers.raceDistance === "Half Marathon" ? "e.g. 1:25:00" : "e.g. 45:00"}
            className="w-full rounded-2xl border border-border bg-card px-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60 transition-colors tabular-nums"
          />
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
