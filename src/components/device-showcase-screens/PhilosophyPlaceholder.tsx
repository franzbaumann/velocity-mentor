/** Mobile placeholder for Philosophy — training philosophies list */
export function PhilosophyPlaceholder() {
  const items = ["80/20 Polarized", "Jack Daniels VDOT", "Lydiard", "Hansons", "Pfitzinger", "Norwegian"];
  return (
    <div className="h-full w-full bg-background p-3 overflow-hidden">
      <div className="space-y-2">
        <div>
          <p className="text-xs font-semibold text-foreground">Training Philosophies</p>
          <p className="text-[10px] text-muted-foreground">Choose your approach</p>
        </div>
        <div className="space-y-1.5">
          {items.map((name, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg border border-border bg-card p-2">
              <div className="w-6 h-6 rounded bg-primary/20 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground truncate">{name}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
