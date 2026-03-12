import type { StepProps } from "../types";
import { TwoColumnLayout } from "../OnboardingLayout";

const LEVELS = [
  {
    id: "beginner",
    emoji: "🌱",
    label: "Just getting started",
    sub: "Running less than a year",
  },
  {
    id: "building",
    emoji: "📈",
    label: "Building runner",
    sub: "1-3 years, getting serious",
  },
  {
    id: "experienced",
    emoji: "🏃",
    label: "Experienced runner",
    sub: "3-5 years, done races",
  },
  {
    id: "competitive",
    emoji: "🏆",
    label: "Competitive runner",
    sub: "5+ years, racing regularly",
  },
] as const;

export function Step7Background({ answers, onUpdate, onNext, onBack }: StepProps) {
  return (
    <TwoColumnLayout
      step={7}
      goal={answers.goal}
      title="How experienced are you?"
      onBack={onBack}
    >
      <div className="space-y-3">
        {/* Experience cards */}
        {LEVELS.map((lvl) => {
          const selected = answers.experienceLevel === lvl.id;

          return (
            <button
              key={lvl.id}
              onClick={() => onUpdate({ experienceLevel: lvl.id })}
              className={`group w-full text-left rounded-2xl border p-5 transition-all duration-200 flex items-center gap-4 ${
                selected
                  ? "border-l-[3px] border-l-primary border-y-primary/20 border-r-primary/20 bg-primary/[0.04]"
                  : "border-border bg-card hover:border-foreground/15"
              }`}
            >
              <span className={`text-[28px] transition-transform duration-200 ${selected ? "scale-110" : "group-hover:scale-105"}`}>
                {lvl.emoji}
              </span>
              <div className="flex-1 min-w-0">
                <p className={`text-[14px] font-semibold leading-tight ${selected ? "text-primary" : "text-foreground"}`}>
                  {lvl.label}
                </p>
                <p className="text-[12px] text-muted-foreground/70 mt-0.5">{lvl.sub}</p>
              </div>
              {selected && (
                <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0 text-primary-foreground">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              )}
            </button>
          );
        })}

        {/* Expandable training history note */}
        {answers.experienceLevel && (
          <div className="pt-3 space-y-4 onboarding-slide-forward">
            <div>
              <p className="text-[13px] text-muted-foreground/70 mb-3">
                What&apos;s worked well in your training? What&apos;s blown up on you?
              </p>
              <textarea
                value={answers.trainingHistoryNote}
                onChange={(e) => onUpdate({ trainingHistoryNote: e.target.value })}
                placeholder="E.g. I respond well to high volume but always get injured when I add speed too fast..."
                rows={4}
                className="w-full rounded-2xl border border-border bg-card px-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60 transition-colors resize-none leading-relaxed"
              />
            </div>

            <button
              onClick={onNext}
              className="group w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 active:scale-[0.98] transition-all"
            >
              Continue
              <span className="inline-block ml-1 transition-transform group-hover:translate-x-0.5">→</span>
            </button>
          </div>
        )}
      </div>
    </TwoColumnLayout>
  );
}
