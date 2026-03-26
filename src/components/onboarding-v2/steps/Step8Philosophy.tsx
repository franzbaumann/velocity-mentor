import { useState, useEffect, useMemo } from "react";
import { differenceInWeeks, format, parseISO, isValid, startOfWeek, addDays } from "date-fns";
import type { StepProps, PhilosophyRecommendation } from "../types";
import { OnboardingLayout } from "../OnboardingLayout";
import {
  formatSummaryRaceDistance,
  getPhilosophyHeadline,
  getPhilosophyPitch,
  normalizeRaceDistanceToConstraintKey,
} from "@/lib/onboarding/philosophyConstraints";
import { formatStrengthMobilityCapsShort, parseStrengthMobilityCaps } from "@/lib/onboarding/strengthMobilityCaps";

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
  answers,
  onUpdate,
  onBack,
  recommendation,
  loading,
  error,
  onSelectPhilosophy,
  onRetry,
}: Step8Props) {
  const [visibleAnalyse, setVisibleAnalyse] = useState(0);

  const distKey = normalizeRaceDistanceToConstraintKey(answers.raceDistance);
  const headline = getPhilosophyHeadline(distKey);

  const summaryLine = useMemo(() => {
    const distLabel = formatSummaryRaceDistance(answers.raceDistance);
    let weeksPart: number | null = null;
    if (answers.raceDate) {
      try {
        const d = parseISO(answers.raceDate);
        if (isValid(d)) {
          const w = differenceInWeeks(d, new Date());
          weeksPart = w > 0 ? w : null;
        }
      } catch {
        weeksPart = null;
      }
    }
    const thisMonday = startOfWeek(new Date(), { weekStartsOn: 1 });
    const planStart =
      (answers.planStartWhen ?? "next_week") === "this_week"
        ? addDays(new Date(), answers.planFirstDayOffset ?? 0)
        : addDays(thisMonday, 7);
    const startLabel = format(planStart, "MMM d");
    const phil = recommendation
      ? formatPhilosophyName(recommendation.primary.philosophy)
      : "—";
    const { strength, mobility } = parseStrengthMobilityCaps(answers);
    const parts = [
      distLabel,
      weeksPart != null ? `${weeksPart} weeks` : null,
      `Starting ${startLabel}`,
      formatStrengthMobilityCapsShort(strength, mobility),
      phil,
    ].filter(Boolean);
    return parts.join(" · ");
  }, [
    answers.raceDate,
    answers.raceDistance,
    answers.planStartWhen,
    answers.planFirstDayOffset,
    answers.strengthSessionsPerWeekCap,
    answers.mobilitySessionsPerWeekCap,
    recommendation?.primary.philosophy,
  ]);

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

  useEffect(() => {
    if (!recommendation || loading || error) return;
    // #region agent log
    fetch("http://127.0.0.1:7707/ingest/cba70274-43f3-47c4-bdfd-0db115d1b756", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "72c67a" },
      body: JSON.stringify({
        sessionId: "72c67a",
        location: "Step8Philosophy.tsx:render-primary",
        message: "philosophy UI primary",
        data: {
          raceDistance: answers.raceDistance,
          primary: recommendation.primary.philosophy,
          alternatives: recommendation.alternatives.map((a) => a.philosophy),
        },
        timestamp: Date.now(),
        hypothesisId: "C",
        runId: "pre-fix",
      }),
    }).catch(() => {});
    // #endregion
  }, [recommendation, loading, error, answers.raceDistance]);

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
                {headline}
              </h1>
              <p className="text-sm text-muted-foreground/80 mt-3 leading-relaxed">{summaryLine}</p>
            </div>

            {/* When to start */}
            <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
              <p className="text-[13px] font-semibold text-foreground">When do you want to start?</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() =>
                    onUpdate({
                      planStartWhen: "this_week",
                      planFirstDayOffset: answers.planFirstDayOffset ?? 0,
                    })
                  }
                  className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all ${
                    (answers.planStartWhen ?? "next_week") === "this_week"
                      ? "bg-primary text-primary-foreground ring-2 ring-primary"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  This week
                </button>
                <button
                  type="button"
                  onClick={() => onUpdate({ planStartWhen: "next_week" })}
                  className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all ${
                    (answers.planStartWhen ?? "next_week") === "next_week"
                      ? "bg-primary text-primary-foreground ring-2 ring-primary"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  Next week
                </button>
              </div>
              {(answers.planStartWhen ?? "next_week") === "this_week" && (
                <div className="space-y-2 pt-1">
                  <p className="text-[11px] font-medium text-foreground/90">First workout from:</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onUpdate({ planFirstDayOffset: 0 })}
                      className={`flex-1 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all ${
                        (answers.planFirstDayOffset ?? 0) === 0
                          ? "bg-primary/15 text-primary ring-1 ring-primary/40"
                          : "bg-muted/40 text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdate({ planFirstDayOffset: 1 })}
                      className={`flex-1 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all ${
                        answers.planFirstDayOffset === 1
                          ? "bg-primary/15 text-primary ring-1 ring-primary/40"
                          : "bg-muted/40 text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      Tomorrow
                    </button>
                  </div>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground/70">
                {(answers.planStartWhen ?? "next_week") === "this_week"
                  ? (answers.planFirstDayOffset ?? 0) === 1
                    ? "No sessions on calendar days before tomorrow — calendar weeks stay Mon–Sun."
                    : "No sessions on days that have already passed — calendar weeks stay Mon–Sun."
                  : "Plan starts next Monday (recommended)."}
              </p>
            </div>

            {/* Primary recommendation — hero card */}
            <div className="relative rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/[0.06] to-transparent p-8 space-y-5 overflow-hidden">
              <div className="absolute top-0 right-0 w-48 h-48 bg-primary/[0.03] rounded-full -translate-y-1/2 translate-x-1/4 blur-2xl pointer-events-none" />

              <div className="flex items-center justify-between relative">
                <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-primary">
                  Best match for you
                </p>
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
                {getPhilosophyPitch(recommendation.primary.philosophy, distKey)}
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
                        {getPhilosophyPitch(alt.philosophy, distKey)}
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
