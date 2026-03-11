import { getUserStepLabel } from "./types";

interface OnboardingLayoutProps {
  children: React.ReactNode;
  fullWidth?: boolean;
}

export function OnboardingLayout({ children, fullWidth }: OnboardingLayoutProps) {
  return (
    <div className={`min-h-[calc(100vh-6rem)] flex items-center justify-center px-6 ${fullWidth ? "" : ""}`}>
      <div className="w-full max-w-[1100px]">{children}</div>
    </div>
  );
}

interface TwoColumnProps {
  step: number;
  goal: string;
  title: string;
  description?: string;
  leftContent?: React.ReactNode;
  children: React.ReactNode;
  onBack?: () => void;
}

export function TwoColumnLayout({
  step,
  goal,
  title,
  description,
  leftContent,
  children,
  onBack,
}: TwoColumnProps) {
  const label = getUserStepLabel(step, goal);

  return (
    <OnboardingLayout>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-10 lg:gap-20 items-start">
        {/* Left column — 40% */}
        <div className="lg:col-span-2 space-y-5">
          {onBack && (
            <button
              onClick={onBack}
              className="group flex items-center gap-1.5 text-[13px] text-muted-foreground/70 hover:text-muted-foreground transition-colors mb-4"
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

          {label && (
            <p className="text-[11px] font-bold tracking-[0.25em] uppercase text-primary">
              Step {label.num} of {label.total}
            </p>
          )}

          <h1 className="text-[34px] lg:text-[42px] font-extrabold leading-[1.08] text-foreground tracking-[-0.01em]">
            {title}
          </h1>

          {description && (
            <p className="text-[15px] text-muted-foreground/70 leading-relaxed max-w-sm">
              {description}
            </p>
          )}

          {leftContent}
        </div>

        {/* Right column — 60% */}
        <div className="lg:col-span-3">{children}</div>
      </div>
    </OnboardingLayout>
  );
}
