import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { darkColors, lightColors, type ColorPalette } from "../theme/theme";
import { THEMES, type AppTheme, type ThemeName } from "../theme/themes";

const STORAGE_KEY = "app_theme";
const LEGACY_STORAGE_KEY = "paceiq-theme";

type ThemeContextValue = {
  themeName: ThemeName;
  theme: AppTheme;
  /** Legacy for existing code, mapped from theme */
  colors: ColorPalette;
  resolved: "light" | "dark";
  setTheme: (name: ThemeName) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function themeNameToStored(name: ThemeName): string {
  return name;
}

function storedToThemeName(stored: string | null): ThemeName {
  if (stored === "light" || stored === "darkPro") return stored;
  return "light";
}

function legacyStoredToThemeName(stored: string | null): ThemeName {
  if (stored === "dark" || stored === "system") return "darkPro";
  if (stored === "light") return "light";
  return "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeName, setThemeNameState] = useState<ThemeName>("light");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (cancelled) return null;
        const name = storedToThemeName(stored);
        setThemeNameState(name);
        if (stored === null) return AsyncStorage.getItem(LEGACY_STORAGE_KEY);
        return null;
      })
      .then((legacy) => {
        if (cancelled) return;
        if (legacy != null && typeof legacy === "string") {
          const migrated = legacyStoredToThemeName(legacy);
          setThemeNameState(migrated);
          AsyncStorage.setItem(STORAGE_KEY, themeNameToStored(migrated)).catch(() => {});
        }
        setHydrated(true);
      })
      .catch(() => !cancelled && setHydrated(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const setTheme = useCallback((name: ThemeName) => {
    setThemeNameState(name);
    AsyncStorage.setItem(STORAGE_KEY, themeNameToStored(name)).catch(() => {});
  }, []);

  const theme = THEMES[themeName];
  const resolved = themeName === "darkPro" ? "dark" : "light";
  const colors = resolved === "dark" ? darkColors : lightColors;

  const value: ThemeContextValue = { themeName, theme, colors, resolved, setTheme };

  if (!hydrated) return null;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

export type { ThemeName, AppTheme };
