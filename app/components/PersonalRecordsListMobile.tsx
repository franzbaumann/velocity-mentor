import { FC, useMemo } from "react";
import { StyleSheet, Text, View, TouchableOpacity } from "react-native";
import { format } from "date-fns";
import { useTheme } from "../context/ThemeContext";
import { formatDuration, formatPaceFromMinPerKm } from "../lib/format";

export type PersonalRecordRow = {
  key: string;
  label: string;
  km: number;
  best: { timeSec: number; pace: number; date: string; activityLinkId: string } | null;
};

type Props = {
  prs: PersonalRecordRow[];
  onSelectPr?: (activityLinkId: string) => void;
};

export const PersonalRecordsListMobile: FC<Props> = ({ prs, onSelectPr }) => {
  const { colors } = useTheme();

  const latestDate = useMemo(
    () =>
      prs.reduce((m, p) => {
        if (!p.best) return m;
        return p.best.date > m ? p.best.date : m;
      }, ""),
    [prs],
  );

  if (prs.every((p) => !p.best)) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
          No PRs yet. Run race distances to see records.
        </Text>
      </View>
    );
  }

  return (
    <View>
      <View style={[styles.headerRow, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerCell, { color: colors.mutedForeground }]}>Distance</Text>
        <Text style={[styles.headerCell, { color: colors.mutedForeground }]}>Best Time</Text>
        <Text style={[styles.headerCell, { color: colors.mutedForeground }]}>Pace</Text>
        <Text style={[styles.headerCell, { color: colors.mutedForeground }]}>Date</Text>
      </View>
      {prs.map((p) => {
        if (!p.best) return null;
        const timeStr = formatDuration(p.best.timeSec);
        const paceStr = formatPaceFromMinPerKm(p.best.pace);
        const isLatest = p.best.date === latestDate;
        const RowWrapper = onSelectPr ? TouchableOpacity : View;
        return (
          <RowWrapper
            key={p.key}
            style={[styles.row, { borderBottomColor: colors.border }]}
            onPress={onSelectPr ? () => onSelectPr(p.best!.activityLinkId) : undefined}
            activeOpacity={onSelectPr ? 0.7 : 1}
          >
            <Text style={[styles.cell, styles.distCell, { color: colors.foreground }]}>
              {p.label}
            </Text>
            <Text style={[styles.cell, { color: colors.foreground }]}>{timeStr}</Text>
            <Text style={[styles.cell, { color: colors.mutedForeground }]}>{paceStr}</Text>
            <View style={[styles.cell, styles.dateCell]}>
              <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
                {format(new Date(p.best.date), "MMM d, yyyy")}
              </Text>
              {isLatest && (
                <View style={[styles.badge, { backgroundColor: colors.accent }]}>
                  <Text style={styles.badgeText}>Latest</Text>
                </View>
              )}
              {onSelectPr && <Text style={{ color: colors.mutedForeground, fontSize: 14, fontWeight: "500" }}>›</Text>}
            </View>
          </RowWrapper>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  empty: {
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 12,
    textAlign: "center",
  },
  headerRow: {
    flexDirection: "row",
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerCell: {
    flex: 1,
    fontSize: 11,
    fontWeight: "500",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cell: {
    flex: 1,
    fontSize: 11,
  },
  distCell: {
    fontWeight: "600",
  },
  dateCell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    justifyContent: "flex-start",
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "600",
    color: "#fff",
  },
});

