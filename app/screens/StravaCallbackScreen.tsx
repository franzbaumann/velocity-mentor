import { FC } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ScreenContainer } from "../components/ScreenContainer";
import { GlassCard } from "../components/GlassCard";
import { useTheme } from "../context/ThemeContext";
import { typography } from "../theme/theme";

export const StravaCallbackScreen: FC = () => {
  const { colors } = useTheme();
  return (
    <ScreenContainer contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: colors.foreground }]}>Strava connection</Text>
      <GlassCard>
        <Text style={[styles.sectionHeader, typography.sectionHeader, { color: colors.mutedForeground }]}>OAuth callback</Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>
          This screen handles the Strava OAuth callback and connection status, matching the web flow.
        </Text>
      </GlassCard>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  content: { gap: 16 },
  title: { fontSize: 22, fontWeight: "600" },
  sectionHeader: {},
  body: { fontSize: 14, lineHeight: 20 },
});
