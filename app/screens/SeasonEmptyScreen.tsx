import { FC } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { ScreenContainer } from "../components/ScreenContainer";
import { spacing } from "../theme/theme";

type Props = {
  onCreatePress: () => void;
};

export const SeasonEmptyScreen: FC<Props> = ({ onCreatePress }) => {
  const { theme, colors } = useTheme();

  return (
    <ScreenContainer scroll contentContainerStyle={styles.content}>
      <View style={styles.centered}>
        <View style={[styles.iconWrap, { backgroundColor: colors.border }]}>
          <Text style={styles.emoji}>🏆</Text>
        </View>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Plan your season</Text>
        <Text style={[styles.subtitle, { color: theme.textMuted }]}>
          Build a full-season strategy so training peaks when it matters most.
        </Text>
        <View style={styles.bullets}>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>📅 Plan your races across the full season</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>🎯 Set A, B and C race priorities</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>⚡ Coach peaks you for the races that matter</Text>
        </View>
        <TouchableOpacity
          onPress={onCreatePress}
          activeOpacity={0.8}
          style={[styles.primaryButton, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
            Create your season
          </Text>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: spacing.screenBottom,
  },
  centered: {
    alignItems: "center",
    paddingHorizontal: 8,
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  emoji: { fontSize: 48 },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 16,
    maxWidth: 320,
  },
  bullets: {
    gap: 8,
    marginBottom: 22,
  },
  bullet: {
    fontSize: 14,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    minHeight: 48,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
});
