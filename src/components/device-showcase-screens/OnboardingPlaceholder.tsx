/** Mobile placeholder for Onboarding — Train like the best + CTA */
export function OnboardingPlaceholder() {
  return (
    <div className="h-full w-full bg-background flex flex-col items-center justify-center p-4 text-center">
      <div className="space-y-4">
        <p className="text-[10px] font-bold tracking-widest uppercase text-primary">
          Your AI Running Coach
        </p>
        <h3 className="text-lg font-bold text-foreground leading-tight">
          Train like the
          <br />
          best in the world.
        </h3>
        <p className="text-xs text-muted-foreground max-w-[160px] mx-auto">
          Coach Cade builds your plan from real data.
        </p>
        <div className="w-full max-w-[140px] mx-auto rounded-full bg-primary py-2.5 px-4">
          <p className="text-xs font-semibold text-primary-foreground">Build my plan</p>
        </div>
      </div>
    </div>
  );
}
