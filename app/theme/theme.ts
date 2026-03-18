// Matches src/index.css :root (light) and .dark (dark)
export type ColorPalette = {
  background: string;
  foreground: string;
  card: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  destructive: string;
  warning: string;
  border: string;
  surface: string;
  glassBg: string;
  textPrimary: string;
  textSecondary: string;
};

export const lightColors: ColorPalette = {
  // Darker cool blue‑grey so glossy white cards pop harder
  background: "hsl(210, 40%, 98%)",
  foreground: "hsl(0, 0%, 11.4%)",
  // very bright, slightly cool card to emphasize gloss
  card: "#FFFFFF",
  // electric blue, still readable on white
  primary: "hsl(211, 100%, 55%)",
  primaryForeground: "hsl(0, 0%, 100%)",
  secondary: "hsl(0, 0%, 94%)",
  muted: "hsl(0, 0%, 94%)",
  mutedForeground: "hsl(0, 0%, 45%)",
  // neon lime
  accent: "hsl(141, 100%, 50%)",
  // neon red
  destructive: "hsl(0, 100%, 60%)",
  // bright neon orange/yellow
  warning: "hsl(36, 100%, 55%)",
  // stronger edge + slightly cool white for a very glossy card look
  border: "hsla(0, 0%, 0%, 0.12)",
  surface: "rgba(248, 250, 255, 0.99)", // tiny blue hint
  glassBg: "rgba(248, 250, 255, 0.97)",
  textPrimary: "#1f2937",
  textSecondary: "#6b7280",
};

export const darkColors: ColorPalette = {
  // Very dark blue‑grey instead of pure neutral
  background: "hsl(215, 25%, 6%)",
  foreground: "hsl(0, 0%, 96%)",
  card: "hsl(0, 0%, 10%)",
  // full-on neon electric blue
  primary: "hsl(211, 100%, 70%)",
  primaryForeground: "hsl(0, 0%, 0%)",
  secondary: "hsl(0, 0%, 15%)",
  muted: "hsl(0, 0%, 15%)",
  mutedForeground: "hsl(0, 0%, 60%)",
  // neon lime
  accent: "hsl(141, 100%, 60%)",
  // hot neon red / pink
  destructive: "hsl(350, 100%, 65%)",
  // neon amber
  warning: "hsl(45, 100%, 60%)",
  border: "hsla(0, 0%, 100%, 0.08)",
  surface: "rgba(31, 41, 55, 0.95)",
  glassBg: "rgba(31, 41, 55, 0.8)",
  textPrimary: "#f3f4f6",
  textSecondary: "#9ca3af",
};

/** @deprecated Use useTheme().colors for theme-aware colors */
export const colors = darkColors;

export const spacing = {
  screenHorizontal: 20,
  screenTop: 56,
  screenBottom: 32,
  cardPadding: 20,
  gap: 16,
  radius: 16,
  radiusLg: 20,
};

export const typography = {
  sectionHeader: {
    fontSize: 11,
    fontWeight: "600" as const,
    letterSpacing: 0.8,
    textTransform: "uppercase" as const,
    marginTop: 20,
    marginBottom: 8,
  },
  mono: {
    fontVariant: ["tabular-nums" as const],
  },
};
