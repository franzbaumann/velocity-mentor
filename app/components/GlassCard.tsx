import { PropsWithChildren } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { spacing } from "../theme/theme";

type GlassCardProps = PropsWithChildren<{
  style?: ViewStyle;
  padding?: number;
}>;

export function GlassCard({ children, style, padding = spacing.cardPadding }: GlassCardProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.glassBg, borderColor: colors.border, padding },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: spacing.radiusLg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
});
