/** Mobile placeholder for Stats — Wellness & Recovery */
export function StatsWellnessPlaceholder() {
  return (
    <div className="h-full w-full bg-background p-3 overflow-hidden">
      <div className="space-y-3">
        <div>
          <p className="text-xs font-semibold text-foreground">Wellness & Recovery</p>
          <p className="text-[10px] text-muted-foreground">Sleep · HRV · Readiness</p>
        </div>
        <div className="space-y-2">
          <div className="rounded-lg border border-border bg-card p-2">
            <p className="text-[10px] text-muted-foreground">Sleep Score</p>
            <div className="h-1.5 bg-muted rounded-full mt-1 overflow-hidden">
              <div className="h-full w-[80%] bg-primary/60 rounded-full" />
            </div>
            <p className="text-xs font-medium text-foreground mt-1">82</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-2">
            <p className="text-[10px] text-muted-foreground">HRV Trend</p>
            <div className="h-6 mt-1 flex items-end gap-0.5">
              {[60, 70, 65, 75, 72, 78, 76].map((pct, i) => (
                <div key={i} className="flex-1 rounded-sm bg-primary/30" style={{ height: `${pct}%` }} />
              ))}
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-2">
          <p className="text-[10px] text-muted-foreground">Readiness (7d)</p>
          <div className="flex gap-1 mt-1">
            {[85, 78, 82, 88, 80, 85, 90].map((s, i) => (
              <div key={i} className="flex-1 h-4 rounded bg-primary/20 flex items-center justify-center">
                <span className="text-[8px] font-medium text-foreground">{s}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
