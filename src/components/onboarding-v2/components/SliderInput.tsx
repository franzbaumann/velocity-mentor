import { useCallback, useRef, useState, useEffect } from "react";

interface SliderInputProps {
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  label: string;
  unit?: string;
  formatValue?: (value: number) => string;
}

export function SliderInput({
  min,
  max,
  step = 1,
  value,
  onChange,
  label,
  unit = "",
  formatValue,
}: SliderInputProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const fraction = max > min ? (value - min) / (max - min) : 0;
  const displayValue = formatValue ? formatValue(value) : `~${value}${unit}`;

  const updateFromPointer = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const raw = (clientX - rect.left) / rect.width;
      const clamped = Math.min(1, Math.max(0, raw));
      const stepped = Math.round((clamped * (max - min)) / step) * step + min;
      onChange(Math.min(max, Math.max(min, stepped)));
    },
    [min, max, step, onChange]
  );

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => updateFromPointer(e.clientX);
    const onUp = () => setDragging(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, updateFromPointer]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{label}</label>
        <span className="text-sm font-bold text-foreground tabular-nums">{displayValue}</span>
      </div>

      {/* Custom track */}
      <div
        ref={trackRef}
        className="relative h-10 flex items-center cursor-pointer select-none touch-none"
        onPointerDown={(e) => {
          setDragging(true);
          updateFromPointer(e.clientX);
        }}
      >
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-border">
          <div
            className="absolute left-0 top-0 h-full rounded-full bg-primary transition-[width] duration-75"
            style={{ width: `${fraction * 100}%` }}
          />
        </div>

        {/* Thumb */}
        <div
          className={`absolute -translate-x-1/2 w-5 h-5 rounded-full border-2 border-primary bg-background transition-shadow ${dragging ? "shadow-[0_0_12px_hsl(var(--primary)/0.4)] scale-110" : "hover:shadow-[0_0_8px_hsl(var(--primary)/0.2)]"}`}
          style={{ left: `${fraction * 100}%` }}
        />
      </div>

      <div className="flex justify-between text-[10px] text-muted-foreground/50 font-medium">
        <span>{min}{unit}</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  );
}
