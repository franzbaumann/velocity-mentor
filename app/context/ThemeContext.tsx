import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Appearance, ColorSchemeName } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { darkColors, lightColors, type ColorPalette } from "../theme/theme";

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "paceiq-theme";

function getSystemPreference(): "light" | "dark" {
  const scheme = Appearance.getColorScheme();
  return scheme === "dark" ? "dark" : "light";
}

type ThemeContextValue = {
  theme: Theme;
  resolved: "light" | "dark";
  colors: ColorPalette;
  setTheme: (t: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolved, setResolved] = useState<"light" | "dark">(getSystemPreference());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === "light" || stored === "dark" || stored === "system") {
          setThemeState(stored);
        }
        setHydrated(true);
      })
      .catch(() => setHydrated(true));
  }, []);

  const applyResolved = useCallback((next: "light" | "dark") => {
    setResolved(next);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const next = theme === "system" ? getSystemPreference() : theme;
    applyResolved(next);
  }, [theme, hydrated, applyResolved]);

  useEffect(() => {
    if (theme !== "system") return;
    const sub = Appearance.addChangeListener(({ colorScheme }: { colorScheme: ColorSchemeName }) => {
      applyResolved(colorScheme === "dark" ? "dark" : "light");
    });
    return () => sub.remove();
  }, [theme, applyResolved]);

  const setTheme = useCallback(
    (t: Theme) => {
      setThemeState(t);
      AsyncStorage.setItem(STORAGE_KEY, t).catch(() => {});
    },
    []
  );

  const colors = resolved === "dark" ? darkColors : lightColors;

  const value: ThemeContextValue = { theme, resolved, colors, setTheme };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
