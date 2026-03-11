interface BubbleOption {
  id: string;
  label: string;
  emoji?: string;
  sub?: string;
}

interface BubbleGridProps {
  options: BubbleOption[];
  selected: string | string[];
  onSelect: (id: string) => void;
  columns?: 1 | 2 | 3;
  size?: "default" | "compact";
}

export function BubbleGrid({ options, selected, onSelect, columns = 2, size = "default" }: BubbleGridProps) {
  const isSelected = (id: string) =>
    Array.isArray(selected) ? selected.includes(id) : selected === id;

  const gridCols =
    columns === 1
      ? "grid-cols-1"
      : columns === 3
        ? "grid-cols-3"
        : "grid-cols-2";

  const padding = size === "compact" ? "px-4 py-3" : "p-5 min-h-[110px]";

  return (
    <div className={`grid gap-3 ${gridCols}`}>
      {options.map((opt) => {
        const active = isSelected(opt.id);
        return (
          <button
            key={opt.id}
            onClick={() => onSelect(opt.id)}
            className={`group text-left rounded-2xl border transition-all duration-200 ${padding} ${
              active
                ? "border-primary bg-primary/[0.08] shadow-[0_0_20px_hsl(var(--primary)/0.08)]"
                : "border-border bg-card hover:border-foreground/15"
            }`}
          >
            {opt.emoji && (
              <span className={`text-[26px] block mb-2 transition-transform duration-200 ${active ? "scale-110" : "group-hover:scale-105"}`}>
                {opt.emoji}
              </span>
            )}
            <span className={`text-[13px] font-semibold block leading-tight ${active ? "text-foreground" : "text-foreground/90"}`}>
              {opt.label}
            </span>
            {opt.sub && (
              <span className="text-[11px] text-muted-foreground/70 block mt-1 leading-snug">{opt.sub}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
