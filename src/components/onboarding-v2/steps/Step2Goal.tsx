import { useState } from "react";
import type { StepProps } from "../types";
import { TwoColumnLayout } from "../OnboardingLayout";
import { ExpandableText } from "../components/ExpandableText";

const INLINE_DISTANCE_GOALS = new Set(["faster_race", "shorter_faster"]);

const INLINE_DISTANCES = [
  { id: "1500m", label: "1500m" },
  { id: "Mile", label: "Mile" },
  { id: "5K", label: "5K" },
  { id: "10K", label: "10K" },
  { id: "Half Marathon", label: "Half" },
  { id: "Marathon", label: "Marathon" },
  { id: "Ultra", label: "Ultra" },
] as const;

const GOALS = [
  { id: "faster_race", label: "Run a faster race", sub: "Train for a PR at any distance", emoji: "🏅" },
  { id: "first_marathon", label: "Finish my first marathon", sub: "From zero to 42.2km", emoji: "🏃" },
  { id: "plan_season", label: "Plan my season", sub: "Multiple races, one strategy", emoji: "📅" },
  { id: "aerobic_base", label: "Build my aerobic base", sub: "Lay the foundation for speed later", emoji: "📈" },
  { id: "return_injury", label: "Return from injury", sub: "Get back safely and stay there", emoji: "🦵" },
  { id: "shorter_faster", label: "Get faster at short distances", sub: "5K and 10K speed", emoji: "⚡" },
  { id: "stay_consistent", label: "Stay consistent", sub: "Build the habit, not burn out", emoji: "🔄" },
] as const;

export function Step2Goal({ answers, onUpdate, onNext, onBack }: StepProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const needsInlineDistance = INLINE_DISTANCE_GOALS.has(answers.goal);
  const canContinue = Boolean(answers.goal && (!needsInlineDistance || answers.raceDistance));

  return (
    <TwoColumnLayout
      step={2}
      goal={answers.goal}
      title="What do you want to achieve?"
      description="Be specific — the more precise your goal, the better your plan."
      onBack={onBack}
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3">
          {GOALS.map((g) => {
            const selected = answers.goal === g.id;
            const isHovered = hovered === g.id;

            return (
              <button
                key={g.id}
                type="button"
                onClick={() => {
                  const nextClearsDistance = !INLINE_DISTANCE_GOALS.has(g.id);
                  onUpdate({
                    goal: g.id,
                    ...(nextClearsDistance ? { raceDistance: "" } : {}),
                  });
                }}
                onMouseEnter={() => setHovered(g.id)}
                onMouseLeave={() => setHovered(null)}
                className={`group text-left rounded-2xl border p-5 min-h-[120px] flex flex-col justify-between transition-all duration-200 ${
                  selected
                    ? "border-primary bg-primary/[0.08] shadow-[0_0_20px_hsl(var(--primary)/0.08)]"
                    : isHovered
                      ? "border-foreground/15 bg-card"
                      : "border-border bg-card"
                }`}
              >
                <span className={`text-[28px] block mb-3 transition-transform duration-200 ${selected ? "scale-110" : "group-hover:scale-105"}`}>
                  {g.emoji}
                </span>
                <div>
                  <span className={`text-[13px] font-semibold block leading-tight ${selected ? "text-foreground" : "text-foreground/90"}`}>
                    {g.label}
                  </span>
                  <span className="text-[11px] text-muted-foreground/70 block mt-1 leading-snug">{g.sub}</span>
                </div>
              </button>
            );
          })}
        </div>

        {needsInlineDistance && (
          <div className="space-y-3 rounded-2xl border border-border bg-card/50 p-5">
            <p className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wider">
              Race distance
            </p>
            <p className="text-sm text-muted-foreground/80">Pick your focus distance — you can fine-tune on the next step.</p>
            <div className="flex flex-wrap gap-2">
              {INLINE_DISTANCES.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => onUpdate({ raceDistance: d.id })}
                  className={`px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-150 ${
                    answers.raceDistance === d.id
                      ? "bg-primary text-primary-foreground shadow-[0_0_16px_hsl(var(--primary)/0.15)]"
                      : "bg-background border border-border text-muted-foreground hover:border-foreground/15 hover:text-foreground/70"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Expandable detail */}
        <ExpandableText
          label="Describe your goal in your own words"
          value={answers.goalDetail}
          onChange={(v) => onUpdate({ goalDetail: v })}
          placeholder="E.g. I want to break 3 hours at Stockholm marathon in August..."
        />

        {/* Continue */}
        {canContinue && (
          <button
            type="button"
            onClick={onNext}
            className="group w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 active:scale-[0.98] transition-all"
          >
            Continue
            <span className="inline-block ml-1 transition-transform group-hover:translate-x-0.5">→</span>
          </button>
        )}
      </div>
    </TwoColumnLayout>
  );
}
