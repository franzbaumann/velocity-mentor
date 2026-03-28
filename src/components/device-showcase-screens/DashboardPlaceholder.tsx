/** Desktop placeholder for MacBook — generic dashboard, no user data */
export function DashboardPlaceholder() {
  return (
    <div className="flex h-full w-full bg-background text-foreground">
      {/* Sidebar */}
      <div className="w-14 shrink-0 border-r border-border bg-muted/30 py-4 flex flex-col items-center gap-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="w-8 h-8 rounded-lg bg-muted" />
        ))}
      </div>
      {/* Main */}
      <div className="flex-1 min-w-0 p-4 space-y-4">
        <div>
          <p className="text-lg font-semibold text-foreground">Good morning</p>
          <p className="text-xs text-muted-foreground">Week 6 of 14 · Build Phase · Marathon in 14 weeks</p>
        </div>
        <div className="flex gap-4">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
            <div className="relative w-16 h-16">
              <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="28" fill="none" stroke="hsl(var(--muted))" strokeWidth="4" />
                <circle cx="32" cy="32" r="28" fill="none" stroke="hsl(141, 72%, 50%)" strokeWidth="4" strokeDasharray="176" strokeDashoffset="44" strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-bold text-foreground">85</span>
                <span className="text-[8px] text-muted-foreground uppercase">Ready</span>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Today's Readiness</p>
              <p className="text-xs text-muted-foreground">Synced from intervals.icu</p>
            </div>
          </div>
          <div className="flex-1 rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-medium text-foreground">Outdoor 2026</p>
            <p className="text-xs text-muted-foreground mt-1">Next: 5K · 12 days</p>
            <div className="h-1.5 bg-muted rounded-full mt-2 overflow-hidden">
              <div className="h-full w-1/3 bg-primary rounded-full" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {/* This Week */}
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">This Week</p>
            <p className="text-lg font-semibold text-foreground mt-1">24 / 32 km</p>
            <div className="h-1.5 bg-muted rounded-full mt-2 overflow-hidden">
              <div className="h-full w-3/4 bg-primary rounded-full" />
            </div>
          </div>
          {/* Last Activity */}
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">Last Activity</p>
            <p className="text-sm font-medium text-foreground mt-1">8.2 km · 5:30/km</p>
            <p className="text-xs text-muted-foreground">Easy run</p>
          </div>
          {/* Recovery */}
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">Recovery</p>
            <div className="flex gap-2 mt-2">
              <div className="flex-1 h-8 rounded bg-primary/20" />
              <div className="flex-1 h-8 rounded bg-primary/20" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
