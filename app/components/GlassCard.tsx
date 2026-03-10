import { PropsWithChildren } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { colors, spacing } from "../theme/theme";

type GlassCardProps = PropsWithChildren<{
  style?: ViewStyle;
  padding?: number;
}>;

export function GlassCard({ children, style, padding = spacing.cardPadding }: GlassCardProps) {
  return <View style={[styles.card, { padding }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: spacing.radiusLg,
    backgroundColor: colors.glassBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: "hidden",
  },
});
