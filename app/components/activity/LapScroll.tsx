import { FC } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { LapData } from "../../hooks/useActivityDetailMobile";

type Props = { laps: LapData[] };

export const LapScroll: FC<Props> = ({ laps }) => {
  if (laps.length < 2) return null;

  return (
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {laps.map((lap, i) => (
          <View key={i} style={[styles.lap, i < laps.length - 1 && styles.lapBorder]}>
            <Text style={styles.duration}>{lap.duration}</Text>
            <Text style={styles.pace}>{lap.pace}</Text>
            {lap.hr != null && (
              <Text style={styles.hr}>{lap.hr}bpm</Text>
            )}
            <View style={[styles.zoneBar, { backgroundColor: lap.zoneColor }]} />
            <Text style={[styles.zoneLabel, { color: lap.zoneColor }]}>
              {lap.zone.toUpperCase()}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: "#fff",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  scroll: { flexDirection: "row", gap: 0, paddingBottom: 4 },
  lap: {
    minWidth: 72,
    paddingHorizontal: 6,
    paddingVertical: 4,
    alignItems: "center",
  },
  lapBorder: { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: "#e5e7eb" },
  duration: { fontSize: 10, color: "#9ca3af", marginBottom: 1 },
  pace: { fontSize: 12, fontWeight: "700", color: "#111827" },
  hr: { fontSize: 10, color: "#6b7280", marginTop: 1 },
  zoneBar: { height: 3, borderRadius: 2, width: "100%", marginTop: 3, marginBottom: 2 },
  zoneLabel: { fontSize: 9, fontWeight: "600" },
});
