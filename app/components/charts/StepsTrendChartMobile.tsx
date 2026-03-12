import { FC } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { format } from "date-fns";
import { useTheme } from "../../context/ThemeContext";

type Point = { date: string; steps: number };

type Props = {
  data: Point[];
};

export const StepsTrendChartMobile: FC<Props> = ({ data }) => {
  const { theme } = useTheme();
  if (!data.length) return <View style={styles.empty} />;

  const maxSteps = Math.max(...data.map((d) => d.steps), 1);
  const width = 100;
  const height = 40;
  const padX = 3;
  const padY = 4;
  const barWidth = Math.max(1.5, (width - padX * 2) / (data.length * 1.6));

  return (
    <View>
      <View style={styles.chart}>
        <Svg width="100%" height={90} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          {data.map((d, idx) => {
            const x = padX + idx * barWidth * 1.6;
            const h = ((d.steps ?? 0) / maxSteps) * (height - padY * 2);
            const y = height - padY - h;
            return (
              <Rect
                key={d.date + idx}
                x={x}
                y={y}
                width={barWidth}
                height={h}
                fill={theme.chartLine}
                rx={1.5}
              />
            );
          })}
        </Svg>
      </View>
      <View style={styles.labelsRow}>
        <Text style={[styles.axisLabel, { color: theme.textMuted }]}>
          {format(new Date(data[0].date), "MMM d")}
        </Text>
        <Text style={[styles.axisLabel, { color: theme.textMuted }]}>
          {format(new Date(data[data.length - 1].date), "MMM d")}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  empty: {
    height: 90,
  },
  chart: {
    height: 90,
    width: "100%",
  },
  labelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  axisLabel: {
    fontSize: 10,
  },
});

