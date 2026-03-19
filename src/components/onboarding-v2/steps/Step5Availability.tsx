import type { StepProps } from "../types";
import { TwoColumnLayout } from "../OnboardingLayout";
import { ExpandableText } from "../components/ExpandableText";

const DAY_OPTIONS = [3, 4, 5, 6, 7];

const SESSION_OPTIONS = [
  { id: "45", label: "45 min" },
  { id: "60", label: "1 hour" },
  { id: "90", label: "90 min" },
  { id: "120", label: "2+ hours" },
];

const WEEKDAY_OPTIONS = [
  { id: "monday", label: "Mon" },
  { id: "tuesday", label: "Tue" },
  { id: "wednesday", label: "Wed" },
  { id: "thursday", label: "Thu" },
  { id: "friday", label: "Fri" },
  { id: "saturday", label: "Sat" },
  { id: "sunday", label: "Sun" },
] as const;

const DOUBLE_RUN_DAY_OPTIONS = WEEKDAY_OPTIONS.filter((d) =>
  ["monday", "tuesday", "wednesday", "thursday", "friday"].includes(d.id)
);

const DOUBLE_DURATION_OPTIONS = [
  { id: 30, label: "30 min" },
  { id: 45, label: "45 min" },
  { id: 60, label: "60 min" },
];

export function Step5Availability({ answers, onUpdate, onNext, onBack }: StepProps) {
  const canProceed =
    answers.daysPerWeek > 0 &&
    answers.sessionLength &&
    !!answers.preferredLongRunDay &&
    !!answers.preferredQualityDay;

  const toggleDoubleDay = (day: string) => {
    const current = answers.doubleRunDays ?? [];
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : current.length < 3
        ? [...current, day]
        : current;
    onUpdate({ doubleRunDays: next });
  };

  return (
    <TwoColumnLayout
      step={5}
      goal={answers.goal}
      title="How much can you train?"
      description="Be honest — consistency beats ambitious plans that fall apart."
      onBack={onBack}
    >
      <div className="space-y-10">
        {/* Days per week */}
        <div>
          <label className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wider block mb-4">
            Days per week
          </label>
          <div className="flex gap-3">
            {DAY_OPTIONS.map((d) => {
              const selected = answers.daysPerWeek === d;
              return (
                <button
                  key={d}
                  onClick={() => onUpdate({ daysPerWeek: d })}
                  className={`relative w-[72px] h-[72px] rounded-2xl text-xl font-bold transition-all duration-200 ${
                    selected
                      ? "bg-primary text-primary-foreground shadow-[0_0_24px_hsl(var(--primary)/0.2)]"
                      : "bg-card border border-border text-muted-foreground/70 hover:border-foreground/15 hover:text-muted-foreground"
                  }`}
                >
                  {d}
                  {selected && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary border-2 border-background flex items-center justify-center">
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Long run + quality days */}
        <div>
          <label className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wider block mb-2">
            Long run day
          </label>
          <p className="text-xs text-muted-foreground/70 mb-3">
            Which day should your weekly long run usually land on?
          </p>
          <div className="flex gap-2 flex-wrap">
            {WEEKDAY_OPTIONS.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => onUpdate({ preferredLongRunDay: d.id })}
                className={`px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-150 ${
                  answers.preferredLongRunDay === d.id
                    ? "bg-primary text-primary-foreground shadow-[0_0_16px_hsl(var(--primary)/0.15)]"
                    : "bg-card border border-border text-muted-foreground hover:border-foreground/15 hover:text-foreground/70"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wider block mb-2">
            Quality session day
          </label>
          <p className="text-xs text-muted-foreground/70 mb-3">
            Primary harder workout (tempo, intervals, threshold) — can differ from your long run.
          </p>
          <div className="flex gap-2 flex-wrap">
            {WEEKDAY_OPTIONS.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => onUpdate({ preferredQualityDay: d.id })}
                className={`px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-150 ${
                  answers.preferredQualityDay === d.id
                    ? "bg-primary text-primary-foreground shadow-[0_0_16px_hsl(var(--primary)/0.15)]"
                    : "bg-card border border-border text-muted-foreground hover:border-foreground/15 hover:text-foreground/70"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Longest session */}
        <div>
          <label className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wider block mb-4">
            Longest session available
          </label>
          <div className="flex gap-2.5 flex-wrap">
            {SESSION_OPTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => onUpdate({ sessionLength: s.id })}
                className={`px-6 py-3 rounded-xl text-[13px] font-semibold transition-all duration-150 ${
                  answers.sessionLength === s.id
                    ? "bg-primary text-primary-foreground shadow-[0_0_16px_hsl(var(--primary)/0.15)]"
                    : "bg-card border border-border text-muted-foreground hover:border-foreground/15 hover:text-foreground/70"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Double runs */}
        <div>
          <label className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wider block mb-4">
            Can you train twice on some days?
          </label>
          <div className="flex gap-2.5">
            {[
              { val: false, label: "No, single sessions only" },
              { val: true, label: "Yes, morning + evening" },
            ].map((opt) => (
              <button
                key={String(opt.val)}
                onClick={() =>
                  onUpdate({
                    doubleRunsEnabled: opt.val,
                    ...(!opt.val ? { doubleRunDays: [], doubleRunDuration: 0 } : {}),
                  })
                }
                className={`px-5 py-3 rounded-xl text-[13px] font-semibold transition-all duration-150 ${
                  answers.doubleRunsEnabled === opt.val
                    ? "bg-primary text-primary-foreground shadow-[0_0_16px_hsl(var(--primary)/0.15)]"
                    : "bg-card border border-border text-muted-foreground hover:border-foreground/15 hover:text-foreground/70"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {answers.doubleRunsEnabled && (
            <div className="mt-6 space-y-6">
              <div>
                <label className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wider block mb-3">
                  Which days work for doubles? <span className="text-muted-foreground/50">(max 3)</span>
                </label>
                <div className="flex gap-2.5 flex-wrap">
                  {DOUBLE_RUN_DAY_OPTIONS.map((d) => {
                    const selected = (answers.doubleRunDays ?? []).includes(d.id);
                    return (
                      <button
                        key={d.id}
                        onClick={() => toggleDoubleDay(d.id)}
                        className={`px-5 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-150 ${
                          selected
                            ? "bg-primary text-primary-foreground shadow-[0_0_16px_hsl(var(--primary)/0.15)]"
                            : "bg-card border border-border text-muted-foreground hover:border-foreground/15 hover:text-foreground/70"
                        }`}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wider block mb-3">
                  How long for the second run?
                </label>
                <div className="flex gap-2.5">
                  {DOUBLE_DURATION_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => onUpdate({ doubleRunDuration: opt.id })}
                      className={`px-5 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-150 ${
                        answers.doubleRunDuration === opt.id
                          ? "bg-primary text-primary-foreground shadow-[0_0_16px_hsl(var(--primary)/0.15)]"
                          : "bg-card border border-border text-muted-foreground hover:border-foreground/15 hover:text-foreground/70"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Scheduling constraints */}
        <ExpandableText
          label="Any scheduling constraints?"
          value={answers.schedulingNote}
          onChange={(v) => onUpdate({ schedulingNote: v })}
          placeholder="E.g. I travel for work every other week, long runs only on Sundays..."
        />

        {/* Continue */}
        {canProceed && (
          <button
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
