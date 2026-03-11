import { FC, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ScreenContainer } from "../components/ScreenContainer";
import { GlassCard } from "../components/GlassCard";
import { useTheme } from "../context/ThemeContext";
import { typography } from "../theme/theme";

const PHILOSOPHIES = [
  { name: "80/20 Polarized", founder: "Stephen Seiler", principle: "80% of training at low intensity, 20% at high intensity. Nothing in between.", easy: 80, moderate: 0, hard: 20 },
  { name: "Jack Daniels VDOT", founder: "Jack Daniels", principle: "Five precise zones (E/M/T/I/R) from your most recent race time. Every workout has a specific physiological purpose.", easy: 70, moderate: 10, hard: 20 },
  { name: "Lydiard", founder: "Arthur Lydiard", principle: "Build a massive aerobic base first over months, then add speed work only in the final phase before racing.", easy: 85, moderate: 10, hard: 5 },
  { name: "Hansons", founder: "Hansons-Brooks", principle: "Cumulative fatigue. No single run over 26km, but weekly volume and back-to-back quality sessions simulate marathon stress.", easy: 65, moderate: 20, hard: 15 },
  { name: "Pfitzinger", founder: "Pete Pfitzinger", principle: "High volume (100+ km/week), mid-week long runs, lactate threshold focus.", easy: 75, moderate: 15, hard: 10 },
];

export const PhilosophyScreen: FC = () => {
  const { colors } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        content: { gap: 16 },
        title: { fontSize: 22, fontWeight: "600", color: colors.foreground },
        subtitle: { fontSize: 14, color: colors.mutedForeground, marginBottom: 8 },
        philoName: { fontSize: 16, fontWeight: "600", color: colors.foreground },
        philoFounder: { fontSize: 12, color: colors.mutedForeground, marginTop: 2 },
        philoPrinciple: { fontSize: 14, color: colors.foreground, lineHeight: 20, marginTop: 8 },
        distRow: { flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden", marginTop: 12 },
        distBar: { minWidth: 2 },
        distEasy: { backgroundColor: colors.accent },
        distMod: { backgroundColor: colors.warning },
        distHard: { backgroundColor: colors.primary },
        distLabel: { fontSize: 11, color: colors.mutedForeground, marginTop: 6 },
      }),
    [colors]
  );
  return (
    <ScreenContainer contentContainerStyle={styles.content}>
      <Text style={styles.title}>Philosophy</Text>
      <Text style={styles.subtitle}>
        Training approaches that shape how we build your plan.
      </Text>

      {PHILOSOPHIES.map((p) => (
        <GlassCard key={p.name}>
          <Text style={styles.philoName}>{p.name}</Text>
          <Text style={styles.philoFounder}>{p.founder}</Text>
          <Text style={styles.philoPrinciple}>{p.principle}</Text>
          <View style={styles.distRow}>
            <View style={[styles.distBar, styles.distEasy, { flex: p.easy }]} />
            <View style={[styles.distBar, styles.distMod, { flex: p.moderate }]} />
            <View style={[styles.distBar, styles.distHard, { flex: p.hard }]} />
          </View>
          <Text style={styles.distLabel}>
            Easy {p.easy}% · Moderate {p.moderate}% · Hard {p.hard}%
          </Text>
        </GlassCard>
      ))}
    </ScreenContainer>
  );
};
