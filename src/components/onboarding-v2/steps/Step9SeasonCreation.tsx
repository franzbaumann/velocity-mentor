import { Trophy } from "lucide-react";
import { OnboardingLayout } from "../OnboardingLayout";

interface Step9SeasonCreationProps {
  onGoToSeason: () => void;
  onBack: () => void;
}

export function Step9SeasonCreation({ onGoToSeason, onBack }: Step9SeasonCreationProps) {
  return (
    <OnboardingLayout fullWidth>
      <div className="max-w-lg mx-auto text-center space-y-10">
        <div className="relative w-20 h-20 mx-auto">
          <div className="absolute inset-0 rounded-full bg-primary/10 flex items-center justify-center">
            <Trophy className="w-8 h-8 text-primary" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-[32px] font-extrabold text-foreground tracking-tight">
            Plan your season
          </h1>
          <p className="text-sm text-muted-foreground/80">
            You chose to plan by season. Add your races, set priorities, and Coach Cade will help you peak for the ones that matter.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 text-left space-y-3">
          <p className="text-sm text-muted-foreground">
            On the next page you can create your season: pick a season type (e.g. road, track), set the date range, and add your A, B, and C races. You won’t get a single-race Cade training plan — your focus is the full season.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={onGoToSeason}
            className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-semibold text-[15px] hover:bg-primary/90 active:scale-[0.98] transition-all"
          >
            Create my season
          </button>
          <button
            onClick={onBack}
            className="text-sm text-muted-foreground/70 hover:text-muted-foreground"
          >
            Go back
          </button>
        </div>
      </div>
    </OnboardingLayout>
  );
}
