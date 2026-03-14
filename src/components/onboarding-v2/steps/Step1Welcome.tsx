import { useMemo } from "react";
import { resolveCtlAtlTsb } from "@/hooks/useReadiness";
import { isRunningActivity } from "@/lib/analytics";
import type { StepWithDataProps } from "../types";
import { OnboardingLayout } from "../OnboardingLayout";
import { Marquee } from "@/components/ui/marquee";

export function Step1Welcome({ onNext, intervalsData }: StepWithDataProps) {
  const stats = useMemo(() => {
    if (!intervalsData?.isConnected) return null;

    const readiness = intervalsData.readiness;
    const activities = intervalsData.activities;
    if (!readiness.length && !activities.length) return null;

    const latestWithCtl = [...readiness].reverse().find((r) => {
      const { ctl } = resolveCtlAtlTsb(r);
      return ctl != null && ctl > 0;
    });
    const ctl = latestWithCtl ? resolveCtlAtlTsb(latestWithCtl).ctl : null;

    const runs = activities.filter((a) => isRunningActivity(a.type) && (a.distance_km ?? 0) > 0.5);

    const totalDays = readiness.length;

    return { ctl, totalDays, totalRuns: runs.length };
  }, [intervalsData]);

  return (
    <OnboardingLayout fullWidth>
      <div className="flex flex-col items-center text-center max-w-2xl mx-auto">
        {/* Logo */}
        <div className="mb-12">
          <div className="inline-flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>
            <span className="text-lg font-bold text-foreground tracking-tight">Cade</span>
          </div>
        </div>

        {/* Hero */}
        <p className="text-[11px] font-bold tracking-[0.3em] uppercase text-primary mb-6">
          Your AI Running Coach
        </p>

        <h1 className="text-[48px] sm:text-[56px] lg:text-[64px] font-extrabold leading-[1.02] text-foreground tracking-[-0.02em] mb-6">
          Train like the
          <br />
          best in the world.
        </h1>

        <p className="text-[17px] text-muted-foreground/70 max-w-md leading-relaxed mb-10">
          Coach Cade builds your plan from real data —
          your fitness, your physiology, your goal.
        </p>

        {/* Data card */}
        {stats && (
          <div className="w-full max-w-md mb-10 onboarding-slide-forward">
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] px-6 py-5">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgb(16 185 129)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <span className="text-sm font-semibold text-emerald-400">We found your training data</span>
              </div>

              <div className="flex items-baseline gap-1.5 text-sm text-muted-foreground">
                {stats.ctl != null && (
                  <>
                    <span className="text-foreground font-semibold">CTL {Math.round(stats.ctl)}</span>
                    <span className="text-muted-foreground/70">·</span>
                  </>
                )}
                <span>{stats.totalDays.toLocaleString()} days</span>
                <span className="text-muted-foreground/70">·</span>
                <span>{stats.totalRuns.toLocaleString()} runs</span>
              </div>

              <p className="text-xs text-muted-foreground/70 mt-2">This onboarding will be quick.</p>
            </div>
          </div>
        )}

        {/* CTA */}
        <button
          onClick={onNext}
          className="group w-full max-w-[400px] py-4 rounded-2xl bg-primary text-primary-foreground font-semibold text-[15px] hover:bg-primary/90 active:scale-[0.98] transition-all shadow-[0_0_30px_hsl(var(--primary)/0.15)]"
        >
          Build my plan
          <span className="inline-block ml-1.5 transition-transform group-hover:translate-x-0.5">→</span>
        </button>

        <p className="text-xs text-muted-foreground/70 mt-5">Takes about 3 minutes</p>

        <div className="mt-10 overflow-hidden -mx-4 py-3 border-t border-border/50">
          <Marquee pauseOnHover direction="left" duration={35} className="py-1" fadeAmount={15}>
            <span className="mx-5 text-xs text-muted-foreground/80">Garmin</span>
            <span className="mx-5 text-muted-foreground/40">·</span>
            <span className="mx-5 text-xs text-muted-foreground/80">Coros</span>
            <span className="mx-5 text-muted-foreground/40">·</span>
            <span className="mx-5 text-xs text-muted-foreground/80">intervals.icu</span>
            <span className="mx-5 text-muted-foreground/40">·</span>
            <span className="mx-5 text-xs text-muted-foreground/80">80/20 · Lydiard · Pfitzinger</span>
          </Marquee>
        </div>
      </div>
    </OnboardingLayout>
  );
}
