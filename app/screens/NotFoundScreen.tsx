import { FC } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ScreenContainer } from "../components/ScreenContainer";
import { GlassCard } from "../components/GlassCard";
import { useTheme } from "../context/ThemeContext";

export const NotFoundScreen: FC = () => {
  const { colors } = useTheme();
  return (
    <ScreenContainer contentContainerStyle={styles.content}>
      <GlassCard>
        <Text style={[styles.title, { color: colors.foreground }]}>Not found</Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>
          This screen is shown when a route cannot be resolved. In the mobile app most navigation is guarded.
        </Text>
      </GlassCard>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  content: { gap: 16 },
  title: { fontSize: 20, fontWeight: "600", marginBottom: 8 },
  body: { fontSize: 14, lineHeight: 20 },
});
