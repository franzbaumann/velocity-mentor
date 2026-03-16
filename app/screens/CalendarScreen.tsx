import { FC, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { ScreenContainer } from "../components/ScreenContainer";
import { GlassCard } from "../components/GlassCard";
import { useTheme } from "../context/ThemeContext";
import { getLocalDateString } from "../lib/date";
import type { RootStackParamList } from "../navigation/RootNavigator";

type CalendarRoute = RouteProp<RootStackParamList, "Calendar">;

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function getMondayIndex(day: number): number {
  return (day + 6) % 7;
}

function dateKey(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

export const CalendarScreen: FC = () => {
  const navigation = useNavigation();
  const route = useRoute<CalendarRoute>();
  const { theme } = useTheme();
  const selectedDateParam = route.params?.selectedDate ?? getLocalDateString();
  const initialDate = new Date(`${selectedDateParam}T12:00:00`);
  const today = getLocalDateString();
  const [monthDate, setMonthDate] = useState<Date>(startOfMonth(initialDate));

  const [selectedKey, setSelectedKey] = useState(selectedDateParam);
  const cells = useMemo(() => {
    const totalDays = daysInMonth(monthDate);
    const firstWeekday = getMondayIndex(new Date(monthDate.getFullYear(), monthDate.getMonth(), 1).getDay());
    const leading = Array.from({ length: firstWeekday }, () => null as number | null);
    const days = Array.from({ length: totalDays }, (_, i) => i + 1);
    const trailingCount = (7 - ((leading.length + days.length) % 7)) % 7;
    const trailing = Array.from({ length: trailingCount }, () => null as number | null);
    return [...leading, ...days, ...trailing];
  }, [monthDate]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        content: { gap: 12 },
        monthRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        },
        monthTitle: {
          fontSize: 18,
          fontWeight: "600",
          color: theme.textPrimary,
        },
        navBtn: {
          width: 32,
          height: 32,
          borderRadius: 999,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.cardBorder,
        },
        weekdayRow: {
          marginTop: 10,
          flexDirection: "row",
        },
        weekdayCell: {
          flex: 1,
          textAlign: "center",
          fontSize: 11,
          color: theme.textMuted,
        },
        gridRow: {
          flexDirection: "row",
        },
        dayCellWrap: {
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingVertical: 6,
        },
        dayCell: {
          width: 36,
          height: 36,
          borderRadius: 999,
          alignItems: "center",
          justifyContent: "center",
        },
        dayText: {
          fontSize: 14,
          color: theme.textPrimary,
        },
        dayTextMuted: {
          color: theme.textMuted,
        },
        daySelected: {
          backgroundColor: theme.textPrimary,
        },
        dayToday: {
          borderWidth: 1,
          borderColor: theme.textMuted,
        },
        dayTextSelected: {
          color: theme.appBackground,
          fontWeight: "700",
        },
        footerRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          gap: 10,
          marginTop: 10,
        },
        footerBtn: {
          flex: 1,
          borderRadius: 999,
          paddingVertical: 10,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.cardBorder,
        },
        footerBtnPrimary: {
          backgroundColor: theme.textPrimary,
        },
        footerBtnText: {
          fontSize: 13,
          fontWeight: "600",
          color: theme.textPrimary,
        },
        footerBtnTextPrimary: {
          color: theme.appBackground,
        },
      }),
    [theme],
  );

  const onSelectDate = (key: string) => {
    setSelectedKey(key);
    navigation.navigate(
      "AppTabs" as never,
      { screen: "Dashboard", params: { selectedDate: key } } as never,
    );
  };

  return (
    <ScreenContainer contentContainerStyle={styles.content}>
      <GlassCard>
        <View style={styles.monthRow}>
          <TouchableOpacity
            style={styles.navBtn}
            activeOpacity={0.8}
            onPress={() => setMonthDate((prev) => addMonths(prev, -1))}
          >
            <Text style={styles.monthTitle}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.monthTitle}>
            {monthDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </Text>
          <TouchableOpacity
            style={styles.navBtn}
            activeOpacity={0.8}
            onPress={() => setMonthDate((prev) => addMonths(prev, 1))}
          >
            <Text style={styles.monthTitle}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.weekdayRow}>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w) => (
            <Text key={w} style={styles.weekdayCell}>
              {w}
            </Text>
          ))}
        </View>

        {Array.from({ length: Math.ceil(cells.length / 7) }).map((_, rowIdx) => (
          <View key={rowIdx} style={styles.gridRow}>
            {cells.slice(rowIdx * 7, rowIdx * 7 + 7).map((day, idx) => {
              if (day == null) {
                return (
                  <View key={`empty-${rowIdx}-${idx}`} style={styles.dayCellWrap}>
                    <View style={styles.dayCell} />
                  </View>
                );
              }
              const key = dateKey(monthDate.getFullYear(), monthDate.getMonth(), day);
              const isSelected = key === selectedKey;
              const isToday = key === today;
              return (
                <View key={key} style={styles.dayCellWrap}>
                  <Pressable
                    style={[
                      styles.dayCell,
                      isSelected && styles.daySelected,
                      isToday && !isSelected && styles.dayToday,
                    ]}
                    onPress={() => onSelectDate(key)}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        isSelected && styles.dayTextSelected,
                        !isSelected && !isToday && key > today && styles.dayTextMuted,
                      ]}
                    >
                      {day}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        ))}

        <View style={styles.footerRow}>
          <TouchableOpacity
            style={styles.footerBtn}
            activeOpacity={0.8}
            onPress={() => {
              const now = new Date();
              setMonthDate(startOfMonth(now));
            }}
          >
            <Text style={styles.footerBtnText}>Jump to today</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.footerBtn, styles.footerBtnPrimary]}
            activeOpacity={0.8}
            onPress={() => onSelectDate(today)}
          >
            <Text style={[styles.footerBtnText, styles.footerBtnTextPrimary]}>Use today</Text>
          </TouchableOpacity>
        </View>
      </GlassCard>
    </ScreenContainer>
  );
};

