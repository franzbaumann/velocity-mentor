import { lightColors } from "./theme";

export type ThemeName = "light" | "darkPro";

export type AppTheme = {
  name: string;
  appBackground: string;
  cardBackground: string;
  cardBorder: string;
  surfaceElevated: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textLabel: string;
  accentBlue: string;
  accentGreen: string;
  accentOrange: string;
  accentRed: string;
  accentTeal: string;
  positive: string;
  negative: string;
  warning: string;
  chartLine: string;
  chartLineCTL: string;
  chartLineATL: string;
  chartLineTSB: string;
  chartGrid: string;
  chartDot: string;
  chartFill: string;
  cardRadius: number;
  cardPadding: number;
  cardShadow: string | undefined;
  cardBorderWidth: number;
  navBackground: string;
  navBorder: string;
  navIconActive: string;
  navIconInactive: string;
  overlayBackdrop: string;
  primaryForeground: string;
};

/** Light theme – current default, formalized from theme.ts lightColors */
export const lightTheme: AppTheme = {
  name: "Light",
  appBackground: lightColors.background,
  cardBackground: lightColors.card,
  cardBorder: "rgba(0,0,0,0.08)",
  surfaceElevated: lightColors.surface,
  textPrimary: lightColors.textPrimary,
  textSecondary: lightColors.textSecondary,
  textMuted: lightColors.mutedForeground,
  textLabel: lightColors.mutedForeground,
  accentBlue: lightColors.primary,
  accentGreen: lightColors.accent,
  accentOrange: lightColors.warning,
  accentRed: lightColors.destructive,
  accentTeal: "#14b8a6",
  positive: lightColors.accent,
  negative: lightColors.destructive,
  warning: lightColors.warning,
  chartLine: lightColors.primary,
  chartLineCTL: lightColors.primary,
  chartLineATL: lightColors.warning,
  chartLineTSB: lightColors.accent,
  chartGrid: "#e5e7eb",
  chartDot: lightColors.textPrimary,
  chartFill: "rgba(59,130,246,0.15)",
  cardRadius: 16,
  cardPadding: 16,
  cardShadow: "0 1px 4px rgba(0,0,0,0.08)",
  cardBorderWidth: 0,
  navBackground: lightColors.background,
  navBorder: "rgba(0,0,0,0.06)",
  navIconActive: lightColors.primary,
  navIconInactive: lightColors.mutedForeground,
  overlayBackdrop: "rgba(0,0,0,0.35)",
  primaryForeground: "#ffffff",
};

/** Dark Pro – intervals.icu inspired */
export const darkProTheme: AppTheme = {
  name: "Dark Pro",
  appBackground: "#0f0f0f",
  cardBackground: "#1a1a1a",
  cardBorder: "#2a2a2a",
  surfaceElevated: "#222222",
  textPrimary: "#ffffff",
  textSecondary: "#9ca3af",
  textMuted: "#6b7280",
  textLabel: "#6b7280",
  accentBlue: "#3b82f6",
  accentGreen: "#22c55e",
  accentOrange: "#f97316",
  accentRed: "#ef4444",
  accentTeal: "#14b8a6",
  positive: "#22c55e",
  negative: "#ef4444",
  warning: "#f97316",
  chartLine: "#3b82f6",
  chartLineCTL: "#3b82f6",
  chartLineATL: "#f97316",
  chartLineTSB: "#22c55e",
  chartGrid: "#1f2937",
  chartDot: "#ffffff",
  chartFill: "rgba(59,130,246,0.15)",
  cardRadius: 16,
  cardPadding: 16,
  cardShadow: undefined,
  cardBorderWidth: 1,
  navBackground: "#111111",
  navBorder: "#1f1f1f",
  navIconActive: "#3b82f6",
  navIconInactive: "#6b7280",
  overlayBackdrop: "rgba(0,0,0,0.5)",
  primaryForeground: "#ffffff",
};

export const THEMES: Record<ThemeName, AppTheme> = {
  light: lightTheme,
  darkPro: darkProTheme,
};
