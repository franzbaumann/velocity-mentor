import { PropsWithChildren } from "react";
import { Platform, StyleSheet, View, ViewStyle } from "react-native";
import { useTheme } from "../context/ThemeContext";

type GlassCardProps = PropsWithChildren<{
  style?: ViewStyle;
  padding?: number;
}>;

export function GlassCard({ children, style, padding }: GlassCardProps) {
  const { themeName, theme } = useTheme();
  const isDarkPro = themeName === "darkPro";
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.cardBackground,
          borderRadius: theme.cardRadius,
          padding: padding ?? theme.cardPadding,
          borderWidth: theme.cardBorderWidth,
          borderColor: theme.cardBorder,
          ...(isDarkPro
            ? {}
            : Platform.select({
                ios: {
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.06,
                  shadowRadius: 4,
                },
                android: { elevation: 2 },
              })),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: "hidden",
  },
});
