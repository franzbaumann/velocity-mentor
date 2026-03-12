import { useState, useEffect } from "react";
import type { PlanResult } from "../types";
import { OnboardingLayout } from "../OnboardingLayout";

interface Step9Props {
  planResult: PlanResult | null;
  loading: boolean;
  error: string | null;
  onViewPlan: () => void;
  onChat: () => void;
  onBack: () => void;
  onRetry?: () => void;
}

const PROGRESS_STEPS = [
  { label: "Calculating training zones from your data", icon: "📊" },
  { label: "Applying training structure", icon: "🧱" },
  { label: "Mapping weeks to your goal", icon: "📅" },
  { label: "Checking injury constraints", icon: "🛡️" },
  { label: "Balancing load progression", icon: "⚖️" },
  { label: "Finalising your plan", icon: "✨" },
];

const PHILOSOPHY_NAMES: Record<string, string> = {
  "80_20_polarized": "80/20 Polarized",
  jack_daniels: "Jack Daniels VDOT",
  lydiard: "Lydiard Base Building",
  hansons: "Hansons Marathon Method",
  pfitzinger: "Pfitzinger",
  kenyan_model: "Kenyan Model",
};

export function Step9PlanGeneration({
  planResult,
  loading,
  error,
  onViewPlan,
  onChat,
  onBack,
  onRetry,
}: Step9Props) {
  const [visibleSteps, setVisibleSteps] = useState(0);
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    if (!loading && planResult) {
      setVisibleSteps(PROGRESS_STEPS.length);
      const t = setTimeout(() => setShowResult(true), 400);
      return () => clearTimeout(t);
    }
    if (!loading) {
      setVisibleSteps(PROGRESS_STEPS.length);
      return;
    }
    setVisibleSteps(0);
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setVisibleSteps(i);
      if (i >= PROGRESS_STEPS.length - 1) clearInterval(interval);
    }, 900);
    return () => clearInterval(interval);
  }, [loading, planResult]);

  return (
    <OnboardingLayout fullWidth>
      <div className="max-w-lg mx-auto text-center space-y-10">
        {/* Loading state */}
        {loading && (
          <>
            {/* Spinner */}
            <div className="relative w-20 h-20 mx-auto">
              <div className="absolute inset-0 rounded-full border-2 border-primary/15" />
              <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <div className="absolute inset-2.5 rounded-full border border-primary/10 border-b-transparent animate-spin" style={{ animationDirection: "reverse", animationDuration: "1.5s" }} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xl">⚡</span>
              </div>
            </div>

            <div className="space-y-1">
              <h1 className="text-[32px] font-extrabold text-foreground tracking-tight">
                Building your plan.
              </h1>
              <p className="text-sm text-muted-foreground/70">This usually takes 30–60 seconds</p>
            </div>

            {/* Progress checklist */}
            <div className="text-left space-y-3.5 max-w-sm mx-auto">
              {PROGRESS_STEPS.map((s, i) => {
                const done = i < visibleSteps - 1 || !loading;
                const active = i === visibleSteps - 1 && loading;
                return (
                  <div
                    key={s.label}
                    className="flex items-center gap-3.5 transition-all duration-500"
                    style={{
                      opacity: i < visibleSteps ? 1 : 0,
                      transform: i < visibleSteps ? "translateY(0)" : "translateY(8px)",
                      transitionDelay: `${i * 60}ms`,
                    }}
                  >
                    {done ? (
                      <div className="w-6 h-6 rounded-full bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                    ) : active ? (
                      <div className="w-6 h-6 rounded-full border border-primary/40 border-t-transparent animate-spin flex-shrink-0" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-foreground/5 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs opacity-40">{s.icon}</span>
                      </div>
                    )}
                    <span className={`text-[13px] ${done ? "text-muted-foreground" : active ? "text-muted-foreground/70" : "text-muted-foreground/70"}`}>
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Error state */}
        {error && (
          <div className="flex flex-col items-center justify-center py-16 space-y-5">
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <p className="text-sm text-red-400/80">{error}</p>
            <div className="flex items-center gap-4">
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="text-sm text-primary font-semibold hover:underline"
                >
                  Try again
                </button>
              )}
              <button
                onClick={onBack}
                className="text-sm text-muted-foreground/70 hover:text-muted-foreground"
              >
                Go back
              </button>
            </div>
          </div>
        )}

        {/* Success state */}
        {!loading && !error && planResult && (
          <div
            className="space-y-8"
            style={{
              opacity: showResult ? 1 : 0,
              transform: showResult ? "translateY(0) scale(1)" : "translateY(12px) scale(0.98)",
              transition: "all 600ms cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {/* Celebration icon */}
            <div className="relative w-20 h-20 mx-auto">
              <div className="absolute inset-0 rounded-full bg-emerald-500/10 animate-pulse" style={{ animationDuration: "2s" }} />
              <div className="absolute inset-0 rounded-full bg-emerald-500/15 flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            </div>

            <div className="space-y-2">
              <h1 className="text-[34px] font-extrabold text-foreground tracking-tight">
                Your plan is ready.
              </h1>
              <p className="text-sm text-muted-foreground/70">Let&apos;s go — your training starts soon.</p>
            </div>

            {/* Plan summary card */}
            <div className="rounded-2xl border border-border bg-card p-6 text-left space-y-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1 min-w-0">
                  <h2 className="text-[17px] font-bold text-foreground truncate">
                    {planResult.plan_name}
                  </h2>
                  <p className="text-[13px] text-muted-foreground/70">
                    {PHILOSOPHY_NAMES[planResult.philosophy] ?? planResult.philosophy}
                  </p>
                </div>
                <div className="flex-shrink-0 bg-primary/10 rounded-full px-3 py-1">
                  <span className="text-xs font-bold text-primary tabular-nums">
                    {planResult.total_weeks} weeks
                  </span>
                </div>
              </div>

              <div className="h-px bg-foreground/[0.06]" />

              <div className="grid grid-cols-2 gap-4">
                <SummaryItem
                  label="Starts"
                  value={formatDate(planResult.start_date)}
                />
                {planResult.peak_weekly_km != null && (
                  <SummaryItem
                    label="Peak volume"
                    value={`${Math.round(planResult.peak_weekly_km)} km/week`}
                  />
                )}
              </div>

              {planResult.first_workout && (
                <>
                  <div className="h-px bg-foreground/[0.06]" />
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm">🏃</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-foreground truncate">
                        {planResult.first_workout.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground/70">
                        First session · {formatDate(planResult.first_workout.date)}
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* CTA buttons */}
            <div className="flex gap-3">
              <button
                onClick={onViewPlan}
                className="group flex-1 py-4 rounded-2xl bg-primary text-primary-foreground font-semibold text-[15px] hover:bg-primary/90 active:scale-[0.98] transition-all shadow-[0_0_32px_hsl(var(--primary)/0.15)]"
              >
                View my training plan
                <span className="inline-block ml-1 transition-transform group-hover:translate-x-0.5">→</span>
              </button>
              <button
                onClick={onChat}
                className="flex-1 py-4 rounded-2xl bg-card border border-border text-foreground font-semibold text-[15px] hover:border-foreground/15 active:scale-[0.98] transition-all"
              >
                Chat with Kipcoachee
              </button>
            </div>
          </div>
        )}
      </div>
    </OnboardingLayout>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground/70 mb-0.5">{label}</p>
      <p className="text-[14px] font-semibold text-foreground">{value}</p>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}
