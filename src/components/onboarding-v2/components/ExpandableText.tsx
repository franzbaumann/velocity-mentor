import { useState, useRef, useEffect } from "react";

interface ExpandableTextProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}

export function ExpandableText({ label, value, onChange, placeholder, rows = 3 }: ExpandableTextProps) {
  const [open, setOpen] = useState(!!value);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open && ref.current) {
      ref.current.focus();
    }
  }, [open]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="group inline-flex items-center gap-1 text-sm text-primary/80 hover:text-primary transition-colors"
      >
        <span>{label}</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-transform group-hover:translate-x-0.5"
        >
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </button>
    );
  }

  return (
    <div className="onboarding-slide-forward">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full rounded-2xl border border-border bg-card px-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60 transition-colors resize-none leading-relaxed"
      />
    </div>
  );
}
