import { FC, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Stop, Path, Line } from "react-native-svg";
import { buildSmoothPath, buildAreaPath, normalizeToViewBox } from "./SvgHelpers";
import { useChartTouch } from "../../hooks/useChartTouch";
import { useTheme } from "../../context/ThemeContext";

export type TooltipLine = { label: string; value: string };

type Props = {
  label: string;
  labelColor: string;
  yLabels: string[];
  height: number;
  data: number[];
  strokeColor: string;
  gradientColors?: [string, string];
  reversed?: boolean;
  gradientId?: string;
  lastInSequence?: boolean;
  formatTooltip?: (index: number) => TooltipLine[];
};

const VW = 300;
const VH = 100;
const TOOLTIP_W = 120;

export const StreamChart: FC<Props> = ({
  label,
  labelColor,
  yLabels,
  height,
  data,
  strokeColor,
  gradientColors,
  reversed,
  gradientId,
  lastInSequence,
  formatTooltip,
}) => {
  const { themeName, theme } = useTheme();
  const isDarkPro = themeName === "darkPro";

  const { linePath, areaPath } = useMemo(() => {
    if (data.length < 2) return { linePath: "", areaPath: "" };
    const pts = normalizeToViewBox(data, VW, VH, { reversed });
    return {
      linePath: buildSmoothPath(pts),
      areaPath: gradientColors ? buildAreaPath(pts, VH) : "",
    };
  }, [data, reversed, gradientColors]);

  const { touch, panHandlers, onLayout, widthRef } = useChartTouch(data.length);

  const startOpacity = isDarkPro ? 0.22 : 0.35;
  const endOpacity = isDarkPro ? 0.06 : 0.03;
  const gridColor = isDarkPro ? theme.chartGrid : "#e5e7eb";

  const stroke = isDarkPro && label === "PACE" ? "#60a5fa" : strokeColor;

  if (data.length < 2) {
    return (
      <View
        style={[
          styles.section,
          isDarkPro && { backgroundColor: theme.cardBackground },
          lastInSequence && styles.sectionLast,
          { minHeight: height },
        ]}
      >
        <Text style={[styles.sectionLabel, { color: labelColor }]}>{label}</Text>
        <Text
          style={[
            styles.noData,
            isDarkPro && { color: theme.textSecondary },
          ]}
        >
          No data
        </Text>
      </View>
    );
  }

  const gid = gradientId ?? `grad_${label}`;
  const tooltipLines =
    touch.active && formatTooltip ? formatTooltip(touch.index) : [];

  let tooltipLeft = touch.x - TOOLTIP_W / 2;
  const cw = widthRef.current;
  if (tooltipLeft < 0) tooltipLeft = 0;
  if (cw > 0 && tooltipLeft + TOOLTIP_W > cw) tooltipLeft = cw - TOOLTIP_W;

  return (
    <View
      style={[
        styles.section,
        isDarkPro && { backgroundColor: theme.cardBackground },
        lastInSequence && styles.sectionLast,
      ]}
    >
      <Text style={[styles.sectionLabel, { color: labelColor }]}>{label}</Text>
      <View style={styles.row}>
        <View style={styles.yAxis}>
          {yLabels.map((l, i) => (
            <Text
              key={i}
              style={[
                styles.yText,
                isDarkPro && { color: theme.textSecondary },
              ]}
            >
              {l}
            </Text>
          ))}
        </View>
        <View
          style={[styles.chartWrap, { height }]}
          onLayout={onLayout}
          {...panHandlers}
        >
          <Svg
            width="100%"
            height={height}
            viewBox={`0 0 ${VW} ${VH}`}
            preserveAspectRatio="none"
          >
            {gradientColors && (
              <Defs>
                <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                    <Stop
                      offset="0%"
                      stopColor={gradientColors[0]}
                      stopOpacity={startOpacity}
                    />
                    <Stop
                      offset="100%"
                      stopColor={gradientColors[1]}
                      stopOpacity={endOpacity}
                    />
                </LinearGradient>
              </Defs>
            )}
            {/* simple horizontal grid lines */}
            <Line
              x1="0"
              x2={VW}
              y1={VH * 0.25}
              y2={VH * 0.25}
              stroke={gridColor}
              strokeWidth={0.5}
              strokeOpacity={0.35}
            />
            <Line
              x1="0"
              x2={VW}
              y1={VH * 0.5}
              y2={VH * 0.5}
              stroke={gridColor}
              strokeWidth={0.5}
              strokeOpacity={0.3}
            />
            <Line
              x1="0"
              x2={VW}
              y1={VH * 0.75}
              y2={VH * 0.75}
              stroke={gridColor}
              strokeWidth={0.5}
              strokeOpacity={0.25}
            />
            {areaPath ? <Path d={areaPath} fill={`url(#${gid})`} /> : null}
            <Path
              d={linePath}
              fill="none"
              stroke={stroke}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
          {touch.active && (
            <View
              pointerEvents="none"
              style={[
                styles.crosshair,
                { left: touch.x, backgroundColor: stroke },
              ]}
            />
          )}
          {touch.active && tooltipLines.length > 0 && (
            <View
              pointerEvents="none"
              style={[styles.tooltip, { left: tooltipLeft, width: TOOLTIP_W }]}
            >
              {tooltipLines.map((line, i) => (
                <View key={i} style={styles.tooltipRow}>
                  <Text style={styles.tooltipLabel}>{line.label}</Text>
                  <Text style={styles.tooltipValue}>{line.value}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    backgroundColor: "#fff",
    marginBottom: 1,
    paddingTop: 6,
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  sectionLast: { marginBottom: 12 },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: 2,
    marginTop: 8,
  },
  row: { flexDirection: "row", overflow: "visible" },
  yAxis: {
    minWidth: 40,
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingRight: 6,
    paddingVertical: 2,
  },
  yText: { fontSize: 9, color: "#999", textAlign: "right" },
  chartWrap: { flex: 1, overflow: "visible" },
  noData: { fontSize: 12, color: "#bbb", marginTop: 8 },
  crosshair: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    opacity: 0.45,
  },
  tooltip: {
    position: "absolute",
    top: 2,
    backgroundColor: "#111827",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  tooltipRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  tooltipLabel: {
    fontSize: 10,
    color: "#9ca3af",
  },
  tooltipValue: {
    fontSize: 10,
    fontWeight: "600",
    color: "#ffffff",
  },
});
