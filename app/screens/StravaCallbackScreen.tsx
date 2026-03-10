import { FC } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ScreenContainer } from "../components/ScreenContainer";
import { GlassCard } from "../components/GlassCard";
import { colors, typography } from "../theme/theme";

export const StravaCallbackScreen: FC = () => {
  return (
    <ScreenContainer contentContainerStyle={styles.content}>
      <Text style={styles.title}>Strava connection</Text>
      <GlassCard>
        <Text style={[styles.sectionHeader, typography.sectionHeader]}>OAuth callback</Text>
        <Text style={styles.body}>
          This screen handles the Strava OAuth callback and connection status, matching the web flow.
        </Text>
      </GlassCard>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  content: { gap: 16 },
  title: { fontSize: 22, fontWeight: "600", color: colors.foreground },
  sectionHeader: {},
  body: { fontSize: 14, color: colors.mutedForeground, lineHeight: 20 },
});
