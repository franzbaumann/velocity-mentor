import { FC } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { LapData } from "../../hooks/useActivityDetailMobile";

type Props = { laps: LapData[] };

export const LapScroll: FC<Props> = ({ laps }) => {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.header}>CHARTS</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {laps.length === 0 ? (
          <View style={styles.lap}>
            <Text style={styles.duration}>—</Text>
            <Text style={styles.pace}>—</Text>
            <Text style={styles.hr}>—</Text>
          </View>
        ) : (
          laps.map((lap, i) => (
            <View key={i} style={[styles.lap, i < laps.length - 1 && styles.lapBorder]}>
              <Text style={styles.duration}>{lap.duration}</Text>
              <Text style={styles.pace}>{lap.pace}</Text>
              <Text style={styles.hr}>{lap.hr != null ? `${lap.hr}bpm` : "—"}</Text>
              <View style={[styles.zoneBar, { backgroundColor: lap.zoneColor }]} />
              <Text style={[styles.zoneLabel, { color: lap.zoneColor }]}>
                {lap.zone.toUpperCase()}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: "#fff",
    paddingVertical: 12,
    paddingBottom: 6,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  header: {
    fontSize: 11,
    fontWeight: "600",
    color: "#999",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  scroll: { flexDirection: "row", gap: 2, paddingBottom: 10 },
  lap: { minWidth: 72, paddingHorizontal: 6, paddingVertical: 4 },
  lapBorder: { borderRightWidth: 1, borderRightColor: "#eee" },
  duration: { fontSize: 10, color: "#bbb", marginBottom: 1 },
  pace: { fontSize: 14, fontWeight: "700", color: "#111", lineHeight: 1.2 },
  hr: { fontSize: 11, color: "#666", marginTop: 2, marginBottom: 2 },
  zoneBar: { height: 3, borderRadius: 2, width: "100%", marginBottom: 2 },
  zoneLabel: { fontSize: 10, fontWeight: "600" },
});
