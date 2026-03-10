import { FC } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "../components/ScreenContainer";
import { GlassCard } from "../components/GlassCard";
import { Sparkline } from "../components/Sparkline";
import { colors, typography } from "../theme/theme";

const MOCK_CTL = [52, 54, 55, 58, 60, 62, 61, 63, 62, 64];
const MOCK_VOLUME = [45, 52, 48, 65, 70, 58, 42];

function ChartCard({
  icon,
  title,
  children,
}: { icon: React.ComponentProps<typeof Ionicons>["name"]; title: string; children: React.ReactNode }) {
  return (
    <GlassCard>
      <View style={styles.chartHeader}>
        <Ionicons name={icon} size={18} color={colors.primary} />
        <Text style={styles.chartTitle}>{title}</Text>
      </View>
      <View style={styles.chartBody}>{children}</View>
    </GlassCard>
  );
}

export const StatsScreen: FC = () => {
  return (
    <ScreenContainer contentContainerStyle={styles.content}>
      <Text style={styles.title}>Stats</Text>

      <ChartCard icon="trending-up" title="CTL / ATL / TSB">
        <Text style={styles.chartHint}>Fitness trend (last 10 days)</Text>
        <Sparkline data={MOCK_CTL} color={colors.primary} />
        <View style={styles.legendRow}>
          <Text style={styles.legendText}>CTL 62</Text>
          <Text style={styles.legendText}>ATL 58</Text>
          <Text style={styles.legendText}>TSB -4</Text>
        </View>
      </ChartCard>

      <ChartCard icon="stats-chart-outline" title="Weekly volume (km)">
        <Sparkline data={MOCK_VOLUME} color={colors.accent} />
      </ChartCard>

      <ChartCard icon="speedometer-outline" title="Pace trend">
        <Text style={styles.body}>Pace distribution and trend charts will appear here when data is connected.</Text>
      </ChartCard>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  content: { gap: 16 },
  title: { fontSize: 22, fontWeight: "600", color: colors.foreground },
  chartHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  chartTitle: { fontSize: 14, fontWeight: "600", color: colors.foreground },
  chartBody: { padding: 16 },
  chartHint: { fontSize: 11, color: colors.mutedForeground, marginBottom: 8 },
  legendRow: { flexDirection: "row", gap: 16, marginTop: 8 },
  legendText: { fontSize: 12, color: colors.mutedForeground },
  body: { fontSize: 14, color: colors.mutedForeground, lineHeight: 20 },
});
