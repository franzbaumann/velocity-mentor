/** Mobile placeholder for Stats — Fitness & Fatigue chart */
export function StatsFitnessPlaceholder() {
  return (
    <div className="h-full w-full bg-background p-3 overflow-hidden">
      <div className="space-y-3">
        <div>
          <p className="text-xs font-semibold text-foreground">Fitness & Fatigue</p>
          <p className="text-[10px] text-muted-foreground">CTL · ATL · TSB</p>
        </div>
        <div className="h-20 rounded-lg bg-muted/50 flex items-end justify-around gap-1 px-1 pb-1">
          {[40, 55, 48, 62, 58, 72, 65, 78, 70, 72, 68, 75].map((pct, i) => (
            <div key={i} className="flex-1 min-w-0 flex flex-col items-center gap-0.5">
              <div className="w-full max-w-[6px] rounded-t bg-primary/60" style={{ height: `${pct}%` }} />
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>12w ago</span>
          <span>Now</span>
        </div>
        <div className="flex gap-2">
          <div className="flex-1 rounded-lg border border-border bg-card p-2 min-w-0">
            <p className="text-[10px] text-muted-foreground">CTL</p>
            <p className="text-sm font-semibold text-foreground">52</p>
          </div>
          <div className="flex-1 rounded-lg border border-border bg-card p-2 min-w-0">
            <p className="text-[10px] text-muted-foreground">TSB</p>
            <p className="text-sm font-semibold text-foreground">+8</p>
          </div>
        </div>
      </div>
    </div>
  );
}
