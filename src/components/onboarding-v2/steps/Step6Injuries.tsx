import type { StepProps } from "../types";
import { TwoColumnLayout } from "../OnboardingLayout";

const INJURIES = [
  { id: "achilles", label: "Achilles tendon", icon: "🦶" },
  { id: "shin", label: "Shin splints", icon: "🦴" },
  { id: "knee", label: "Runner's knee", icon: "🦵" },
  { id: "hip", label: "Hip flexor", icon: "🏃" },
  { id: "plantar", label: "Plantar fasciitis", icon: "👟" },
  { id: "it_band", label: "IT band", icon: "🔗" },
  { id: "stress_fracture", label: "Stress fracture", icon: "⚠️" },
  { id: "back", label: "Back pain", icon: "🔙" },
  { id: "none", label: "Nothing currently", icon: "✅" },
] as const;

export function Step6Injuries({ answers, onUpdate, onNext, onBack }: StepProps) {
  const toggle = (id: string) => {
    if (id === "none") {
      onUpdate({ injuries: ["none"], injuryDetail: "" });
      return;
    }
    const current = answers.injuries.filter((i) => i !== "none");
    const next = current.includes(id) ? current.filter((i) => i !== id) : [...current, id];
    onUpdate({ injuries: next.length > 0 ? next : [] });
  };

  const hasInjury = answers.injuries.length > 0 && !answers.injuries.includes("none");
  const canProceed = answers.injuries.length > 0 && (!hasInjury || answers.injuryDetail.trim().length > 0);

  const selectedNames = answers.injuries
    .filter((id) => id !== "none")
    .map((id) => INJURIES.find((i) => i.id === id)?.label)
    .filter(Boolean) as string[];

  const injuryPrompt =
    selectedNames.length === 1
      ? `Tell me more about your ${selectedNames[0]}`
      : "Tell me more about your injuries";

  return (
    <TwoColumnLayout
      step={6}
      goal={answers.goal}
      title="Any injuries I should know about?"
      description="This shapes your plan more than anything else. Don't minimize — tell me the full story."
      onBack={onBack}
    >
      <div className="space-y-5">
        {/* Injury grid */}
        <div className="grid grid-cols-2 gap-2.5">
          {INJURIES.map((inj) => {
            const selected = answers.injuries.includes(inj.id);
            const isNone = inj.id === "none";

            return (
              <button
                key={inj.id}
                onClick={() => toggle(inj.id)}
                className={`group text-left px-4 py-3.5 rounded-xl text-[13px] font-medium transition-all duration-200 flex items-center gap-2.5 ${
                  isNone && selected
                    ? "bg-emerald-500/10 border border-emerald-500/40 text-emerald-400"
                    : selected
                      ? "bg-primary/[0.08] border border-primary text-foreground shadow-[0_0_16px_hsl(var(--primary)/0.06)]"
                      : "bg-card border border-border text-muted-foreground hover:border-foreground/15 hover:text-foreground/70"
                } ${isNone ? "col-span-2" : ""}`}
              >
                <span className={`text-base transition-transform duration-200 ${selected ? "scale-110" : "group-hover:scale-105"}`}>
                  {inj.icon}
                </span>
                <span>{inj.label}</span>
              </button>
            );
          })}
        </div>

        {/* Required injury detail */}
        {hasInjury && (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.03] p-5 space-y-3 onboarding-slide-forward">
            <p className="text-sm font-semibold text-foreground">{injuryPrompt}</p>
            <textarea
              value={answers.injuryDetail}
              onChange={(e) => onUpdate({ injuryDetail: e.target.value })}
              placeholder="How long has it been bothering you? Does it affect your running?"
              rows={5}
              className="w-full rounded-xl border border-border bg-background px-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60 transition-colors resize-none leading-relaxed"
            />
            {!answers.injuryDetail.trim() && (
              <div className="flex items-center gap-2 text-xs text-amber-400/70">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span>Required — this protects you from a plan that makes it worse.</span>
              </div>
            )}
          </div>
        )}

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
