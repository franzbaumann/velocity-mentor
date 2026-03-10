// Dark theme – matches src/index.css .dark
export const colors = {
  background: "hsl(0, 0%, 7%)",
  foreground: "hsl(0, 0%, 96%)",
  card: "hsl(0, 0%, 10%)",
  primary: "hsl(211, 100%, 52%)",
  primaryForeground: "hsl(0, 0%, 100%)",
  secondary: "hsl(0, 0%, 15%)",
  muted: "hsl(0, 0%, 15%)",
  mutedForeground: "hsl(0, 0%, 60%)",
  accent: "hsl(141, 72%, 50%)",
  destructive: "hsl(0, 84%, 60%)",
  warning: "hsl(36, 100%, 52%)",
  border: "hsla(0, 0%, 100%, 0.08)",
  // Convenience
  surface: "rgba(31, 41, 55, 0.95)",
  glassBg: "rgba(31, 41, 55, 0.8)",
  textPrimary: "#f3f4f6",
  textSecondary: "#9ca3af",
};

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
    letterSpacing: 0.5,
    textTransform: "uppercase" as const,
    color: colors.mutedForeground,
    marginBottom: 12,
  },
  mono: {
    fontVariant: ["tabular-nums" as const],
  },
};
