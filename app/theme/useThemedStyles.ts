import { useCallback, useMemo, useRef } from "react";
import { StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";
import type { AppTheme } from "./themes";

export function useThemedStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (theme: AppTheme) => T,
): T {
  const { theme, themeName } = useTheme();
  const factoryRef = useRef(factory);
  factoryRef.current = factory;
  const stableFactory = useCallback((t: AppTheme) => factoryRef.current(t), []);
  return useMemo(() => StyleSheet.create(stableFactory(theme)), [stableFactory, themeName]);
}
