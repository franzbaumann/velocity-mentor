import { useState } from "react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/useTheme";

const sizeClasses = {
  sm: "h-6",
  md: "h-8",
  lg: "h-10",
  xl: "h-12",
} as const;

export interface CadeLogoProps {
  variant?: "full" | "icon";
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

/** Inline SVG fallback when PNG fails to load — runner icon, uses currentColor */
function LogoFallback({ variant, size }: { variant: "full" | "icon"; size: keyof typeof sizeClasses }) {
  const iconSize = variant === "icon" ? "w-8 h-8" : cn(sizeClasses[size], "w-auto");
  const icon = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      className={cn("shrink-0", iconSize)}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <g transform="translate(4, 3) scale(1.15)">
        <circle cx="12" cy="5" r="2.5" />
        <path d="M12 8v3.5l-2.5 1.5 1 4 2.5-1.5 1-2.5 2 1" />
      </g>
    </svg>
  );
  return (
    <span
      className={cn(
        "inline-flex items-center text-foreground min-w-8 min-h-8",
        variant === "icon" ? "w-8 h-8" : sizeClasses[size]
      )}
      aria-label="Cade"
    >
      {variant === "icon" ? (
        icon
      ) : (
        <>
          {icon}
          <span className="ml-2 font-semibold text-sm tracking-tight">Cade</span>
        </>
      )}
    </span>
  );
}

/**
 * CadeLogo — theme-aware. Uses transparent PNG assets from user-provided design.
 * Light mode: full logo (icon + text) and icon (blue squircle). Dark mode: icon PNG works on dark;
 * full logo uses SVG fallback (black text invisible on dark). Falls back to SVG on PNG load error.
 */
export function CadeLogo({ variant = "full", size = "md", className }: CadeLogoProps) {
  const { resolved } = useTheme();
  const [imgError, setImgError] = useState(false);
  const isDark = resolved === "dark";

  const v = "7";
  const logoFull = `/logo-cade-light.png?v=${v}`;
  const logoIcon = `/logo-cade-icon-light.png?v=${v}`;

  if (imgError) {
    return (
      <span className={cn("inline-flex", className)}>
        <LogoFallback variant={variant} size={size} />
      </span>
    );
  }

  if (isDark && variant === "full") {
    return (
      <span className={cn("inline-flex", className)}>
        <LogoFallback variant={variant} size={size} />
      </span>
    );
  }

  const src = variant === "icon" ? logoIcon : logoFull;

  return (
    <img
      src={src}
      alt="Cade"
      decoding="async"
      loading="eager"
      draggable={false}
      onError={() => setImgError(true)}
      className={cn(
        "object-contain shrink-0 select-none min-w-8 min-h-8",
        variant === "icon" ? "w-8 h-8" : cn("w-auto", sizeClasses[size]),
        className
      )}
    />
  );
}
