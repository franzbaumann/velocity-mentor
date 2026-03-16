import { FC } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../context/ThemeContext";

const NUTRITION_ACCENT = "#10b981";

type Props = { content: string };

/**
 * Mobile equivalent of web Coach NutritionCard.
 * Shows recovery nutrition content in a styled card (emerald border/bg).
 * Used when message_type === "nutrition" or content matches nutrition patterns.
 */
export const NutritionCard: FC<Props> = ({ content }) => {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { borderColor: NUTRITION_ACCENT + "4D", backgroundColor: NUTRITION_ACCENT + "0D" }]}>
      <View style={styles.header}>
        <Text style={styles.emoji}>🥗</Text>
        <Text style={[styles.title, { color: NUTRITION_ACCENT }]}>Recovery Nutrition</Text>
      </View>
      <Text style={[styles.body, { color: colors.foreground }]}>{content}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  emoji: { fontSize: 18 },
  title: { fontSize: 13, fontWeight: "600" },
  body: { fontSize: 14, lineHeight: 22 },
});
