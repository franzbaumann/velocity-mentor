import { FC } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "../components/ScreenContainer";
import { GlassCard } from "../components/GlassCard";
import { Sparkline } from "../components/Sparkline";
import { useTheme } from "../context/ThemeContext";
import { typography } from "../theme/theme";

const MOCK_CTL = [52, 54, 55, 58, 60, 62, 61, 63, 62, 64];
const MOCK_VOLUME = [45, 52, 48, 65, 70, 58, 42];

export const StatsScreen: FC = () => {
  const { colors } = useTheme();
  return (
    <ScreenContainer contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: colors.foreground }]}>Stats</Text>

      <GlassCard>
        <View style={[styles.chartHeader, { borderBottomColor: colors.border }]}>
          <Ionicons name="trending-up" size={18} color={colors.primary} />
          <Text style={[styles.chartTitle, { color: colors.foreground }]}>CTL / ATL / TSB</Text>
        </View>
        <View style={styles.chartBody}>
        <Text style={[styles.chartHint, { color: colors.mutedForeground }]}>Fitness trend (last 10 days)</Text>
        <Sparkline data={MOCK_CTL} color={colors.primary} />
        <View style={styles.legendRow}>
          <Text style={[styles.legendText, { color: colors.mutedForeground }]}>CTL 62</Text>
          <Text style={[styles.legendText, { color: colors.mutedForeground }]}>ATL 58</Text>
          <Text style={[styles.legendText, { color: colors.mutedForeground }]}>TSB -4</Text>
        </View>
        </View>
      </GlassCard>

      <GlassCard>
        <View style={[styles.chartHeader, { borderBottomColor: colors.border }]}>
          <Ionicons name="stats-chart-outline" size={18} color={colors.primary} />
          <Text style={[styles.chartTitle, { color: colors.foreground }]}>Weekly volume (km)</Text>
        </View>
        <View style={styles.chartBody}>
        <Sparkline data={MOCK_VOLUME} color={colors.accent} />
        </View>
      </GlassCard>

      <GlassCard>
        <View style={[styles.chartHeader, { borderBottomColor: colors.border }]}>
          <Ionicons name="speedometer-outline" size={18} color={colors.primary} />
          <Text style={[styles.chartTitle, { color: colors.foreground }]}>Pace trend</Text>
        </View>
        <View style={styles.chartBody}>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>Pace distribution and trend charts will appear here when data is connected.</Text>
        </View>
      </GlassCard>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  content: { gap: 16 },
  title: { fontSize: 22, fontWeight: "600" },
  chartHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  chartTitle: { fontSize: 14, fontWeight: "600" },
  chartBody: { padding: 16 },
  chartHint: { fontSize: 11, marginBottom: 8 },
  legendRow: { flexDirection: "row", gap: 16, marginTop: 8 },
  legendText: { fontSize: 12 },
  body: { fontSize: 14, lineHeight: 20 },
});
