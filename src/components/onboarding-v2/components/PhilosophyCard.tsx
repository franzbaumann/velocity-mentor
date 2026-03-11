interface PhilosophyCardProps {
  name: string;
  reason: string;
  confidence?: number;
  primary?: boolean;
  onSelect: () => void;
}

export function PhilosophyCard({ name, reason, confidence, primary, onSelect }: PhilosophyCardProps) {
  return (
    <div
      className={`rounded-xl border p-6 space-y-4 ${
        primary
          ? "border-primary/30 bg-primary/5"
          : "border-border bg-card"
      }`}
    >
      <div className="flex items-start justify-between">
        <p className={`text-xs font-semibold tracking-wider uppercase ${primary ? "text-primary" : "text-muted-foreground/70"}`}>
          {primary ? "Best match for you" : "Also consider"}
        </p>
        {confidence != null && (
          <span className="text-xs font-bold text-primary">{confidence}% match</span>
        )}
      </div>
      <h3 className="text-lg font-bold text-foreground">{name}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{reason}</p>
      <button
        onClick={onSelect}
        className={`text-sm font-medium transition-colors ${
          primary
            ? "w-full py-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
            : "text-primary hover:underline"
        }`}
      >
        {primary ? `Build my plan with ${name} →` : "Choose this instead"}
      </button>
    </div>
  );
}
