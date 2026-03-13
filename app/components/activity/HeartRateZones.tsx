import { FC, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../context/ThemeContext";

type Props = {
  times: number[] | null | undefined;
  maxHr?: number | null;
};

const ZONE_NAMES = [
  "Z1 Recovery",
  "Z2 Aerobic",
  "Z3 Tempo",
  "Z4 Threshold",
  "Z5 VO2max",
  "Z5+ Anaerobic",
];

const ZONE_COLORS = [
  "#94a3b8", // gray
  "#3b82f6", // blue
  "#22c55e", // green
  "#f97316", // orange
  "#ef4444", // red
  "#dc2626", // dark red
];

export const HeartRateZones: FC<Props> = ({ times, maxHr }) => {
  const { themeName, theme } = useTheme();
  const isDarkPro = themeName === "darkPro";

  const rows = useMemo(() => {
    if (!times || times.length === 0) return [];
    const total = times.reduce((a, b) => a + b, 0);
    if (total <= 0) return [];
    const maxTime = Math.max(...times);

    const hrRanges =
      maxHr && maxHr > 0
        ? [
            `0-${Math.round(maxHr * 0.6)}`,
            `${Math.round(maxHr * 0.6)}-${Math.round(maxHr * 0.7)}`,
            `${Math.round(maxHr * 0.7)}-${Math.round(maxHr * 0.8)}`,
            `${Math.round(maxHr * 0.8)}-${Math.round(maxHr * 0.9)}`,
            `${Math.round(maxHr * 0.9)}-${Math.round(maxHr * 0.95)}`,
            `${Math.round(maxHr * 0.95)}-${maxHr}`,
          ]
        : null;

    return times.map((t, i) => {
      const pct = total > 0 ? (t / total) * 100 : 0;
      const barPct = maxTime > 0 ? (t / maxTime) * 100 : 0;
      const mins = Math.floor(t / 60);
      const secs = Math.round(t % 60);
      const timeStr =
        t <= 0
          ? "—"
          : mins >= 60
          ? `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, "0")}m`
          : `${mins}m${String(secs).padStart(2, "0")}s`;

      const pctStr =
        pct <= 0 ? "0%" : pct < 0.5 ? "<1%" : `${pct.toFixed(1)}%`;

      return {
        key: i,
        name: ZONE_NAMES[i] ?? `Zone ${i + 1}`,
        color: ZONE_COLORS[i] ?? ZONE_COLORS[ZONE_COLORS.length - 1],
        hrRange: hrRanges ? hrRanges[i] ?? "" : "",
        barPct: Math.max(4, Math.min(100, barPct)),
        timeStr,
        pctStr,
      };
    });
  }, [times, maxHr]);

  if (!rows.length) {
    return (
      <View style={styles.empty}>
        <Text
          style={[
            styles.emptyText,
            isDarkPro && { color: theme.textSecondary },
          ]}
        >
          No heart rate zone data
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.headerRow,
          isDarkPro && { borderBottomColor: theme.cardBorder },
        ]}
      >
        <Text
          style={[
            styles.headerCell,
            isDarkPro && { color: theme.textSecondary },
            { flex: 2 },
          ]}
        >
          Zone
        </Text>
        <Text
          style={[
            styles.headerCell,
            isDarkPro && { color: theme.textSecondary },
            { flex: 1.4 },
          ]}
        >
          HR range
        </Text>
        <Text
          style={[
            styles.headerCell,
            isDarkPro && { color: theme.textSecondary },
            { flex: 3 },
          ]}
        >
          Distribution
        </Text>
        <Text
          style={[
            styles.headerCell,
            isDarkPro && { color: theme.textSecondary },
            { flex: 1, textAlign: "right" },
          ]}
        >
          Time
        </Text>
        <Text
          style={[
            styles.headerCell,
            isDarkPro && { color: theme.textSecondary },
            { flex: 1, textAlign: "right" },
          ]}
        >
          %
        </Text>
      </View>
      {rows.map((row) => (
        <View
          key={row.key}
          style={[
            styles.bodyRow,
            isDarkPro && { borderBottomColor: theme.cardBorder },
          ]}
        >
          <View style={[styles.zoneInfo, { flex: 2 }]}>
            <View
              style={[
                styles.zoneDot,
                {
                  backgroundColor: row.color,
                },
              ]}
            />
            <Text
              style={[
                styles.zoneName,
                isDarkPro && { color: theme.textPrimary },
              ]}
            >
              {row.name}
            </Text>
          </View>
          <Text
            style={[
              styles.bodyCell,
              isDarkPro && { color: theme.textSecondary },
              { flex: 1.4 },
            ]}
          >
            {row.hrRange}
          </Text>
          <View style={[styles.barBackground, { flex: 3 }]}>
            <View
              style={[
                styles.barFill,
                {
                  width: `${row.barPct}%`,
                  backgroundColor: row.color,
                },
              ]}
            />
          </View>
          <Text
            style={[
              styles.bodyCell,
              isDarkPro && { color: theme.textSecondary },
              { flex: 1, textAlign: "right" },
            ]}
          >
            {row.timeStr}
          </Text>
          <Text
            style={[
              styles.bodyCell,
              isDarkPro && { color: theme.textSecondary },
              { flex: 1, textAlign: "right" },
            ]}
          >
            {row.pctStr}
          </Text>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  headerCell: {
    fontSize: 11,
    color: "#6b7280",
    fontWeight: "600",
  },
  bodyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#f3f4f6",
  },
  zoneInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  zoneDot: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  zoneName: {
    fontSize: 11,
    color: "#111827",
  },
  bodyCell: {
    fontSize: 11,
    color: "#6b7280",
  },
  barBackground: {
    height: 10,
    borderRadius: 999,
    backgroundColor: "#e5e7eb",
    overflow: "hidden",
    marginHorizontal: 6,
  },
  barFill: {
    height: "100%",
    borderRadius: 999,
  },
  empty: {
    paddingVertical: 8,
  },
  emptyText: {
    fontSize: 11,
    color: "#9ca3af",
  },
});

