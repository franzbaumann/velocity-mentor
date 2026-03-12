import { FC } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../context/ThemeContext";

type Point = { week: string; km: number };

type Props = {
  data: Point[];
};

export const WeeklyMileageChartMobile: FC<Props> = ({ data }) => {
  const { theme } = useTheme();
  if (!data.length) return <View style={styles.empty} />;

  const maxKm = Math.max(...data.map((d) => d.km), 1);

  return (
    <View style={styles.wrapper}>
      <View style={styles.container}>
        {data.map((d) => {
          const heightPct = Math.max(2, (d.km / maxKm) * 100);
          return (
            <View key={d.week} style={styles.barItem}>
              <View
                style={[
                  styles.bar,
                  { height: `${heightPct}%`, backgroundColor: theme.chartLine },
                ]}
              />
            </View>
          );
        })}
      </View>
      <View style={styles.labelsRow}>
        {data.map((d, idx) => (
          <View key={d.week} style={styles.labelCell}>
            {idx % 2 === 0 ? (
              <Text style={[styles.label, { color: theme.textMuted }]}>{d.week}</Text>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  empty: {
    height: 140,
  },
  wrapper: {
    height: 140,
  },
  container: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    paddingBottom: 20,
  },
  barItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 1,
  },
  bar: {
    width: "100%",
    maxWidth: 12,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  labelsRow: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
  },
  labelCell: {
    flex: 1,
    alignItems: "center",
  },
  label: {
    fontSize: 10,
  },
});


