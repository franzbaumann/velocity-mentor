import { FC, useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../components/ScreenContainer";
import { GlassCard } from "../components/GlassCard";
import { useTheme } from "../context/ThemeContext";
import type { PlanStackParamList } from "../navigation/RootNavigator";
import { useTrainingPlan } from "../hooks/useTrainingPlan";

type Nav = NativeStackNavigationProp<PlanStackParamList>;

const PHILOSOPHY_NAMES: Record<string, string> = {
  "80_20_polarized": "80/20 Polarized",
  jack_daniels: "Jack Daniels VDOT",
  lydiard: "Lydiard Base Building",
  hansons: "Hansons Marathon Method",
  pfitzinger: "Pfitzinger",
  kenyan_model: "Kenyan Model",
};

export const PlanReadyScreen: FC = () => {
  const { colors } = useTheme();
  const navigation = useNavigation<Nav>();
  const { plan, isLoading } = useTrainingPlan();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        content: { flexGrow: 1, justifyContent: "center", paddingBottom: 40, gap: 28 },
        center: { alignItems: "center", justifyContent: "center" },
        title: { fontSize: 26, fontWeight: "700", color: colors.foreground, textAlign: "center" },
        subtitle: { fontSize: 14, color: colors.mutedForeground, textAlign: "center", marginTop: 6 },
        summaryName: { fontSize: 17, fontWeight: "600", color: colors.foreground },
        summaryPhilosophy: { fontSize: 13, color: colors.mutedForeground, marginTop: 2 },
        summaryMetaRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 8, gap: 8 },
        summaryMetaText: { fontSize: 12, color: colors.mutedForeground },
        buttonsRow: { flexDirection: "row", gap: 10, marginTop: 18 },
        primaryButton: {
          flex: 1,
          paddingVertical: 14,
          borderRadius: 999,
          backgroundColor: colors.primary,
          alignItems: "center",
          justifyContent: "center",
        },
        primaryText: {
          fontSize: 15,
          fontWeight: "600",
          color: colors.primaryForeground,
        },
        secondaryButton: {
          flex: 1,
          paddingVertical: 14,
          borderRadius: 999,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          backgroundColor: colors.card,
          alignItems: "center",
          justifyContent: "center",
        },
        secondaryText: {
          fontSize: 15,
          fontWeight: "600",
          color: colors.foreground,
        },
      }),
    [colors],
  );

  if (isLoading || !plan?.plan) {
    return (
      <ScreenContainer contentContainerStyle={styles.content}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.subtitle, { marginTop: 12 }]}>Loading your new plan…</Text>
        </View>
      </ScreenContainer>
    );
  }

  const p = plan.plan;
  const weeks = plan.weeks ?? [];
  const peakKm = weeks.reduce((max, w) => {
    const val = w.total_km ?? 0;
    return val > max ? val : max;
  }, 0);

  const firstWeek = weeks[0];
  const firstSession = firstWeek?.sessions[0];

  const philosophyLabel =
    (p.philosophy && PHILOSOPHY_NAMES[p.philosophy]) || p.philosophy || "Adaptive";

  return (
    <ScreenContainer contentContainerStyle={styles.content}>
      <View style={styles.center}>
        <Text style={styles.title}>Your plan is ready.</Text>
        <Text style={styles.subtitle}>Let&apos;s put it to work.</Text>
      </View>

      <GlassCard>
        <View>
          <Text style={styles.summaryName}>
            {p.plan_name || p.race_type || "Training plan"}
          </Text>
          <Text style={styles.summaryPhilosophy}>{philosophyLabel}</Text>
          <View style={styles.summaryMetaRow}>
            <Text style={styles.summaryMetaText}>
              {weeks.length ? `${weeks.length} weeks` : "Multi‑week block"}
            </Text>
            {peakKm > 0 && (
              <Text style={styles.summaryMetaText}>
                Peak ~{Math.round(peakKm)} km/week
              </Text>
            )}
          </View>
          {firstSession && (
            <View style={{ marginTop: 14 }}>
              <Text style={[styles.summaryMetaText, { textTransform: "uppercase" }]}>
                First session
              </Text>
              <Text style={[styles.summaryName, { fontSize: 15, marginTop: 2 }]}>
                {firstSession.description}
              </Text>
            </View>
          )}
        </View>
      </GlassCard>

      <View style={styles.buttonsRow}>
        <TouchableOpacity
          activeOpacity={0.9}
          style={styles.primaryButton}
          onPress={() => navigation.replace("PlanMain")}
        >
          <Text style={styles.primaryText}>View my plan</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.9}
          style={styles.secondaryButton}
          onPress={() =>
            navigation.getParent()?.navigate("Coach" as never, { from: "plan" } as never)
          }
        >
          <Text style={styles.secondaryText}>Chat with Kipcoachee</Text>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
};

