import { FC } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ScreenContainer } from "../components/ScreenContainer";
import { GlassCard } from "../components/GlassCard";
import { colors } from "../theme/theme";

export const NotFoundScreen: FC = () => {
  return (
    <ScreenContainer contentContainerStyle={styles.content}>
      <GlassCard>
        <Text style={styles.title}>Not found</Text>
        <Text style={styles.body}>
          This screen is shown when a route cannot be resolved. In the mobile app most navigation is guarded.
        </Text>
      </GlassCard>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  content: { gap: 16 },
  title: { fontSize: 20, fontWeight: "600", color: colors.foreground, marginBottom: 8 },
  body: { fontSize: 14, color: colors.mutedForeground, lineHeight: 20 },
});
