import { FC, useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ScreenContainer } from "../components/ScreenContainer";
import { GlassCard } from "../components/GlassCard";
import { useTheme } from "../context/ThemeContext";
import { typography } from "../theme/theme";
import type { AppTheme } from "../theme/themes";

const PHILOSOPHIES = [
  {
    name: "80/20 Polarized",
    founder: "Stephen Seiler",
    principle:
      "80% of training at low intensity, 20% at high intensity. Nothing in between. The simplest and most research-backed approach.",
    easy: 80,
    moderate: 0,
    hard: 20,
    bestFor: "Time-crunched athletes who want maximum results from minimal structure.",
    athletes: "Jakob Ingebrigtsen, many Olympic distance runners.",
    weekly:
      "Mon: Rest, Tue: Easy 50min, Wed: Intervals 8x1000m, Thu: Easy 45min, Fri: Easy 40min, Sat: Long Run 90min, Sun: Tempo 30min",
  },
  {
    name: "Jack Daniels VDOT",
    founder: "Jack Daniels",
    principle:
      "Five precise zones (E/M/T/I/R) all calculated from your most recent race time. Every workout has a specific physiological purpose.",
    easy: 70,
    moderate: 10,
    hard: 20,
    bestFor: "Data-driven athletes who love precise paces and structured plans.",
    athletes: "Jim Ryun, Alberto Salazar's coached athletes.",
    weekly:
      "Mon: Rest, Tue: E 45min, Wed: I 5x1000m @ I pace, Thu: E 40min, Fri: T 20min tempo, Sat: Long E 90min, Sun: E + strides",
  },
  {
    name: "Lydiard",
    founder: "Arthur Lydiard",
    principle:
      "Build a massive aerobic base first over months, then add speed work only in the final phase before racing. Patience is the ultimate weapon.",
    easy: 85,
    moderate: 10,
    hard: 5,
    bestFor:
      "Patient athletes willing to invest months in base building for breakthrough races.",
    athletes: "Peter Snell, Murray Halberg, Barry Magee.",
    weekly:
      "Mon: Easy 60min, Tue: Easy 75min, Wed: Easy 60min, Thu: Easy 45min, Fri: Easy 60min, Sat: Long 2h, Sun: Easy 50min",
  },
  {
    name: "Hansons",
    founder: "Hansons-Brooks",
    principle:
      "Cumulative fatigue approach. No single run over 26km, but the weekly volume and back-to-back quality sessions simulate marathon-specific stress.",
    easy: 65,
    moderate: 20,
    hard: 15,
    bestFor:
      "Marathon runners who want to simulate race-day fatigue without extremely long runs.",
    athletes: "Desiree Linden (2018 Boston Marathon winner).",
    weekly:
      "Mon: Easy 8km, Tue: Speed 12x400m, Wed: Easy 10km, Thu: Tempo 10km @ MP, Fri: Easy 8km, Sat: Long 25km, Sun: Rest",
  },
  {
    name: "Pfitzinger",
    founder: "Pete Pfitzinger",
    principle:
      "High volume (100+ km/week), mid-week long runs (MLR), and lactate threshold focus. Classic high-mileage marathon approach.",
    easy: 75,
    moderate: 15,
    hard: 10,
    bestFor:
      "Experienced runners comfortable with 80–120km weeks and structured periodization.",
    athletes: "Pete Pfitzinger (2x Olympic marathoner).",
    weekly:
      "Mon: Rest/Easy, Tue: LT 14km w/ 8km @ LT, Wed: MLR 18km, Thu: Easy 10km, Fri: VO2max 5x1200m, Sat: Long 28km, Sun: Recovery 10km",
  },
  {
    name: "Kenyan/Ethiopian Model",
    founder: "East African tradition",
    principle:
      "Twice-daily easy running with extreme patience on aerobic base. Maximal aerobic volume at conversational pace — minimal intensity until sharpening phase.",
    easy: 90,
    moderate: 5,
    hard: 5,
    bestFor:
      "High-mileage athletes who want to maximize aerobic base with minimal injury risk.",
    athletes: "Eliud Kipchoge, Kenenisa Bekele, Tigst Assefa.",
    weekly:
      "Mon: AM Easy 45min + PM Easy 30min, Tue: AM Easy 60min + PM Easy 30min, Wed: AM Fartlek 60min + PM Easy 20min, Thu: AM Easy 60min + PM Easy 30min, Fri: AM Easy 50min + PM Easy 25min, Sat: Long 90–120min easy, Sun: Rest/Easy 30min",
  },
] as const;

type Philosophy = (typeof PHILOSOPHIES)[number];

const DistributionBar: FC<{ easy: number; moderate: number; hard: number }> = ({
  easy,
  moderate,
  hard,
}) => {
  return (
    <View style={{ marginTop: 10 }}>
      <View style={styles.distRow}>
        {easy > 0 && (
          <View style={[styles.distSegment, styles.distEasy, { flex: easy }]} />
        )}
        {moderate > 0 && (
          <View style={[styles.distSegment, styles.distModerate, { flex: moderate }]} />
        )}
        {hard > 0 && (
          <View style={[styles.distSegment, styles.distHard, { flex: hard }]} />
        )}
      </View>
      <View style={styles.distLegendRow}>
        <Text style={styles.distLegendText}>Easy {easy}%</Text>
        {moderate > 0 && (
          <Text style={styles.distLegendText}>Moderate {moderate}%</Text>
        )}
        <Text style={styles.distLegendText}>Hard {hard}%</Text>
      </View>
    </View>
  );
};

const WeeklyStructure: FC<{ philosophy: Philosophy; theme: AppTheme }> = ({ philosophy, theme }) => {
  const [open, setOpen] = useState(false);
  const days = philosophy.weekly.split(", ").map((entry) => {
    const [day, ...rest] = entry.split(": ");
    return { day, workout: rest.join(": ") };
  });

  return (
    <View style={styles.weeklyContainer}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setOpen((v) => !v)}
        style={styles.weeklyHeaderRow}
      >
        <Text style={[styles.weeklyHeaderLabel, { color: theme.textMuted }]}>Weekly structure</Text>
        <Text style={[styles.weeklyHeaderToggle, { color: theme.accentBlue }]}>{open ? "Hide" : "Show"}</Text>
      </TouchableOpacity>
      {open && (
        <View style={styles.weeklyList}>
          {days.map(({ day, workout }) => (
            <View key={day} style={styles.weeklyRow}>
              <Text style={[styles.weeklyDay, { color: theme.textMuted }]}>{day}</Text>
              <Text style={[styles.weeklyWorkout, { color: theme.textPrimary }]}>{workout}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

export const PhilosophyScreen: FC = () => {
  const { colors } = useTheme();
  const themedStyles = useMemo(
    () =>
      StyleSheet.create({
        content: { gap: 16 },
        title: { fontSize: 22, fontWeight: "600", color: colors.foreground },
        subtitle: { fontSize: 14, color: colors.mutedForeground, marginBottom: 8 },
        philoName: { fontSize: 16, fontWeight: "600", color: colors.foreground },
        philoFounder: { fontSize: 12, color: colors.mutedForeground, marginTop: 2 },
        philoPrinciple: { fontSize: 14, color: colors.foreground, lineHeight: 20, marginTop: 8 },
        philoMeta: { fontSize: 13, color: colors.mutedForeground, marginTop: 6 },
      }),
    [colors]
  );
  return (
    <ScreenContainer contentContainerStyle={themedStyles.content}>
      <Text style={themedStyles.title}>Philosophy</Text>
      <Text style={themedStyles.subtitle}>
        Training approaches that shape how we build your plan.
      </Text>

      {PHILOSOPHIES.map((p) => (
        <GlassCard key={p.name}>
          <Text style={themedStyles.philoName}>{p.name}</Text>
          <Text style={themedStyles.philoFounder}>{p.founder}</Text>
          <Text style={themedStyles.philoPrinciple}>{p.principle}</Text>
          <Text style={themedStyles.philoMeta}>
            <Text style={typography.sectionHeader}>Best for: </Text>
            <Text>{p.bestFor}</Text>
          </Text>
          <Text style={themedStyles.philoMeta}>
            <Text style={typography.sectionHeader}>Famous athletes: </Text>
            <Text>{p.athletes}</Text>
          </Text>
          <DistributionBar easy={p.easy} moderate={p.moderate} hard={p.hard} />
          <WeeklyStructure philosophy={p} />
        </GlassCard>
      ))}
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  distRow: {
    flexDirection: "row",
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  distSegment: {
    minWidth: 2,
  },
  distEasy: {
    backgroundColor: "hsl(142 76% 36%)",
  },
  distModerate: {
    backgroundColor: "hsl(45 93% 47%)",
  },
  distHard: {
    backgroundColor: "hsl(0 84% 60%)",
  },
  distLegendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  distLegendText: {
    fontSize: 11,
    color: "#6b7280",
  },
  weeklyContainer: {
    marginTop: 12,
  },
  weeklyHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  weeklyHeaderLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
  },
  weeklyHeaderToggle: {
    fontSize: 12,
    fontWeight: "500",
    color: "#2563eb",
  },
  weeklyList: {
    marginTop: 8,
    gap: 4,
  },
  weeklyRow: {
    flexDirection: "row",
    gap: 6,
  },
  weeklyDay: {
    width: 52,
    fontSize: 12,
    fontWeight: "500",
    color: "#6b7280",
  },
  weeklyWorkout: {
    flex: 1,
    fontSize: 12,
    color: "#111827",
  },
});

