interface ReadinessRingProps {
  score: number;
  size?: number;
}

export function ReadinessRing({ score, size = 100 }: ReadinessRingProps) {
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;

  const getColor = (s: number) => {
    if (s >= 75) return "hsl(141, 72%, 50%)"; // accent green
    if (s >= 50) return "hsl(36, 100%, 52%)"; // warning amber
    return "hsl(0, 84%, 60%)"; // destructive red
  };

  return (
    <div className="readiness-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={getColor(score)}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="mono-text text-2xl font-semibold text-foreground tabular-nums">{Math.round(score)}</span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Ready</span>
      </div>
    </div>
  );
}
