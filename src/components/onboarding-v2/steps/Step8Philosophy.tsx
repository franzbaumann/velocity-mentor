import { useState, useEffect } from "react";
import type { StepProps, PhilosophyRecommendation } from "../types";
import { OnboardingLayout } from "../OnboardingLayout";

interface Step8Props extends StepProps {
  recommendation: PhilosophyRecommendation | null;
  loading: boolean;
  error: string | null;
  onSelectPhilosophy: (philosophy: string) => void;
  onRetry?: () => void;
}

const PHILOSOPHY_META: Record<string, { icon: string; tagline: string }> = {
  "80_20_polarized": {
    icon: "⚡",
    tagline: "Easy days easy, hard days hard — 80% low intensity, 20% high.",
  },
  jack_daniels: {
    icon: "📊",
    tagline: "VDOT-based zones with structured E/T/I/R workouts.",
  },
  lydiard: {
    icon: "🏔️",
    tagline: "Build a massive aerobic base, then layer in speed.",
  },
  hansons: {
    icon: "🔥",
    tagline: "Cumulative fatigue — train on tired legs to simulate race day.",
  },
  pfitzinger: {
    icon: "📈",
    tagline: "High mileage with lactate threshold emphasis.",
  },
  kenyan_model: {
    icon: "🇰🇪",
    tagline: "Double-day structure with fartlek and easy group running.",
  },
};

const ANALYSE_STEPS = [
  "Reading your training data",
  "Evaluating your goals & timeline",
  "Matching physiology to methodology",
  "Ranking philosophies for you",
];

export function Step8Philosophy({
  onBack,
  recommendation,
  loading,
  error,
  onSelectPhilosophy,
  onRetry,
}: Step8Props) {
  const [visibleAnalyse, setVisibleAnalyse] = useState(0);

  useEffect(() => {
    if (!loading) {
      setVisibleAnalyse(ANALYSE_STEPS.length);
      return;
    }
    setVisibleAnalyse(0);
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setVisibleAnalyse(i);
      if (i >= ANALYSE_STEPS.length) clearInterval(interval);
    }, 700);
    return () => clearInterval(interval);
  }, [loading]);

  return (
    <OnboardingLayout fullWidth>
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Back button */}
        {onBack && !loading && (
          <button
            onClick={onBack}
            className="group flex items-center gap-1.5 text-[13px] text-muted-foreground/70 hover:text-muted-foreground transition-colors"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="transition-transform group-hover:-translate-x-0.5"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back
          </button>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 space-y-8">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
              <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <div className="absolute inset-2 rounded-full border border-primary/10 border-b-transparent animate-spin" style={{ animationDirection: "reverse", animationDuration: "1.5s" }} />
            </div>

            <div className="text-center space-y-2">
              <h1 className="text-[28px] font-bold text-foreground tracking-tight">Analysing your profile</h1>
              <p className="text-sm text-muted-foreground/70">Finding the philosophy that fits you best</p>
            </div>

            <div className="text-left space-y-3 w-full max-w-xs">
              {ANALYSE_STEPS.map((s, i) => (
                <div
                  key={s}
                  className="flex items-center gap-3 transition-all duration-500"
                  style={{
                    opacity: i < visibleAnalyse ? 1 : 0,
                    transform: i < visibleAnalyse ? "translateY(0)" : "translateY(8px)",
                    transitionDelay: `${i * 50}ms`,
                  }}
                >
                  {i < visibleAnalyse - 1 || !loading ? (
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-full border border-primary/40 border-t-transparent animate-spin flex-shrink-0" />
                  )}
                  <span className={`text-sm ${i < visibleAnalyse - 1 || !loading ? "text-muted-foreground" : "text-muted-foreground/70"}`}>
                    {s}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="flex flex-col items-center justify-center py-20 space-y-5">
            <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

        {/* Recommendation results */}
        {!loading && !error && recommendation && (
          <>
            {/* Header */}
            <div>
              <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-primary mb-3">
                Based on your profile
              </p>
              <h1 className="text-[36px] lg:text-[44px] font-extrabold text-foreground tracking-tight leading-[1.05]">
                Here&apos;s what fits you.
              </h1>
            </div>

            {/* Primary recommendation — hero card */}
            <div className="relative rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/[0.06] to-transparent p-8 space-y-5 overflow-hidden">
              <div className="absolute top-0 right-0 w-48 h-48 bg-primary/[0.03] rounded-full -translate-y-1/2 translate-x-1/4 blur-2xl pointer-events-none" />

              <div className="flex items-center justify-between relative">
                <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-primary">
                  Best match for you
                </p>
                <ConfidenceChip confidence={recommendation.primary.confidence} />
              </div>

              <div className="flex items-center gap-4 relative">
                <span className="text-4xl">
                  {PHILOSOPHY_META[recommendation.primary.philosophy]?.icon ?? "🏃"}
                </span>
                <div>
                  <h2 className="text-[22px] font-bold text-foreground leading-tight">
                    {formatPhilosophyName(recommendation.primary.philosophy)}
                  </h2>
                  <p className="text-xs text-muted-foreground/70 mt-0.5">
                    {PHILOSOPHY_META[recommendation.primary.philosophy]?.tagline}
                  </p>
                </div>
              </div>

              <p className="text-[15px] text-muted-foreground leading-relaxed relative">
                {recommendation.primary.reason}
              </p>

              <button
                onClick={() => onSelectPhilosophy(recommendation.primary.philosophy)}
                className="group relative w-full py-4 rounded-2xl bg-primary text-primary-foreground font-semibold text-[15px] hover:bg-primary/90 active:scale-[0.98] transition-all shadow-[0_0_32px_hsl(var(--primary)/0.15)]"
              >
                Build my plan with {formatPhilosophyName(recommendation.primary.philosophy)}
                <span className="inline-block ml-1.5 transition-transform group-hover:translate-x-0.5">→</span>
              </button>
            </div>

            {/* Alternative recommendations */}
            {recommendation.alternatives.length > 0 && (
              <div>
                <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-muted-foreground/70 mb-4">
                  Also a good fit
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {recommendation.alternatives.slice(0, 2).map((alt) => (
                    <div
                      key={alt.philosophy}
                      className="group rounded-2xl border border-border bg-card p-6 space-y-3 hover:border-foreground/15 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">
                          {PHILOSOPHY_META[alt.philosophy]?.icon ?? "🏃"}
                        </span>
                        <div className="min-w-0">
                          <p className="text-[15px] font-bold text-foreground truncate">
                            {formatPhilosophyName(alt.philosophy)}
                          </p>
                          <p className="text-[11px] text-muted-foreground/70 mt-0.5 truncate">
                            {PHILOSOPHY_META[alt.philosophy]?.tagline}
                          </p>
                        </div>
                      </div>

                      <p className="text-[13px] text-muted-foreground/70 leading-relaxed line-clamp-3">
                        {alt.reason}
                      </p>

                      <button
                        onClick={() => onSelectPhilosophy(alt.philosophy)}
                        className="text-[13px] text-primary font-semibold hover:underline transition-colors"
                      >
                        Choose this instead
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </OnboardingLayout>
  );
}

function ConfidenceChip({ confidence }: { confidence: number }) {
  const clamp = Math.min(100, Math.max(0, confidence));
  return (
    <div className="flex items-center gap-2 bg-primary/10 rounded-full px-3 py-1">
      <div className="relative w-4 h-4">
        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90 text-primary">
          <circle
            cx="18" cy="18" r="15"
            fill="none"
            stroke="hsl(var(--primary) / 0.15)"
            strokeWidth="3"
          />
          <circle
            cx="18" cy="18" r="15"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeDasharray={`${(clamp / 100) * 94.25} 94.25`}
            strokeLinecap="round"
          />
        </svg>
      </div>
      <span className="text-xs font-bold text-primary tabular-nums">{clamp}%</span>
    </div>
  );
}

function formatPhilosophyName(id: string): string {
  const names: Record<string, string> = {
    "80_20_polarized": "80/20 Polarized",
    jack_daniels: "Jack Daniels VDOT",
    lydiard: "Lydiard Base Building",
    hansons: "Hansons Marathon Method",
    pfitzinger: "Pfitzinger",
    kenyan_model: "Kenyan Model",
  };
  return names[id] ?? id;
}
