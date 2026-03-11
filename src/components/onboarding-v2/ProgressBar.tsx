interface ProgressBarProps {
  progress: number;
}

export function ProgressBar({ progress }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, progress));

  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      <div className="h-[3px] bg-card">
        <div
          className="h-full bg-primary transition-all duration-500 ease-out will-change-[width]"
          style={{ width: `${clamped}%` }}
        />
      </div>
      {clamped > 0 && (
        <span className="absolute right-5 top-2.5 text-[10px] font-bold text-muted-foreground/70 tabular-nums tracking-wider">
          {Math.round(clamped)}%
        </span>
      )}
    </div>
  );
}
