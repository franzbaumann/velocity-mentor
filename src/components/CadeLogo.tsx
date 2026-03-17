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
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * CadeLogo uses PNG assets - transparent background, theme-aware (black text light, white text dark).
 * No blue box; logo displayed directly.
 */
export function CadeLogo({ variant = "full", size = "md", className }: CadeLogoProps) {
  const { resolved } = useTheme();
  const isDark = resolved === "dark";

  const v = "5";
  const logoFull = isDark ? `/logo-cade-dark.png?v=${v}` : `/logo-cade-light.png?v=${v}`;
  const logoIcon = isDark ? `/logo-cade-icon-dark.png?v=${v}` : `/logo-cade-icon-light.png?v=${v}`;

  const src = variant === "icon" ? logoIcon : logoFull;
  const sizeClass = sizeClasses[size];

  return (
    <img
      src={src}
      alt="Cade"
      className={cn("object-contain w-auto shrink-0", sizeClass, className)}
    />
  );
}
