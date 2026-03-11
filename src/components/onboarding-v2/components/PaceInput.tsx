interface PaceInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
}

export function PaceInput({ value, onChange, placeholder = "e.g. 1:25:00", label }: PaceInputProps) {
  const handleChange = (raw: string) => {
    const clean = raw.replace(/[^\d:]/g, "");
    onChange(clean);
  };

  return (
    <div>
      {label && (
        <label className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wider block mb-2.5">
          {label}
        </label>
      )}
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-border bg-card px-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60 transition-colors tabular-nums"
      />
    </div>
  );
}
