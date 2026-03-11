import { FC, useMemo } from "react";
import { RouteProp, useRoute, useNavigation } from "@react-navigation/native";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ActivitiesStackParamList } from "../navigation/RootNavigator";
import { ScreenContainer } from "../components/ScreenContainer";
import { GlassCard } from "../components/GlassCard";
import { useTheme } from "../context/ThemeContext";
import { useActivityById } from "../hooks/useActivities";

type ActivityDetailRoute = RouteProp<ActivitiesStackParamList, "ActivityDetail">;

export const ActivityDetailScreen: FC = () => {
  const { colors } = useTheme();
  const route = useRoute<ActivityDetailRoute>();
  const navigation = useNavigation();
  const { id } = route.params;
  const { activity } = useActivityById(id);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        content: { gap: 16 },
        backRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
        backText: { fontSize: 14, color: colors.mutedForeground },
        title: { fontSize: 22, fontWeight: "600", color: colors.foreground },
        body: { fontSize: 14, color: colors.mutedForeground, lineHeight: 20 },
        row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
        metricBlock: { flex: 1, marginRight: 12 },
        metricLabel: { fontSize: 11, color: colors.mutedForeground, marginBottom: 2 },
        metricValue: { fontSize: 15, fontWeight: "600", color: colors.foreground },
        helper: { marginTop: 12, fontSize: 12, color: colors.mutedForeground },
      }),
    [colors]
  );

  if (!activity) {
    return (
      <ScreenContainer contentContainerStyle={styles.content}>
        <TouchableOpacity style={styles.backRow} onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={18} color={colors.mutedForeground} />
          <Text style={styles.backText}>Back to Activities</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Activity not found</Text>
        <GlassCard>
          <Text style={styles.body}>We could not find this activity in the local list.</Text>
        </GlassCard>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer contentContainerStyle={styles.content}>
      <TouchableOpacity style={styles.backRow} onPress={() => navigation.goBack()} activeOpacity={0.8}>
        <Ionicons name="arrow-back" size={18} color={colors.mutedForeground} />
        <Text style={styles.backText}>Back to Activities</Text>
      </TouchableOpacity>
      <Text style={styles.title}>{activity.name}</Text>
      <GlassCard>
        <View style={styles.row}>
          <View style={styles.metricBlock}>
            <Text style={styles.metricLabel}>Type</Text>
            <Text style={styles.metricValue}>{activity.type}</Text>
          </View>
          <View style={styles.metricBlock}>
            <Text style={styles.metricLabel}>Distance</Text>
            <Text style={styles.metricValue}>
              {activity.nonDist ? "-" : `${activity.km.toFixed(1)} km`}
            </Text>
          </View>
        </View>
        <View style={styles.row}>
          <View style={styles.metricBlock}>
            <Text style={styles.metricLabel}>Duration</Text>
            <Text style={styles.metricValue}>{activity.duration}</Text>
          </View>
          <View style={styles.metricBlock}>
            <Text style={styles.metricLabel}>Avg pace</Text>
            <Text style={styles.metricValue}>{activity.pace ?? "—"}</Text>
          </View>
        </View>
        <View style={styles.row}>
          <View style={styles.metricBlock}>
            <Text style={styles.metricLabel}>Avg HR</Text>
            <Text style={styles.metricValue}>
              {activity.hr != null ? `${activity.hr} bpm` : "—"}
            </Text>
          </View>
          <View style={styles.metricBlock}>
            <Text style={styles.metricLabel}>Source</Text>
            <Text style={styles.metricValue}>{activity.source}</Text>
          </View>
        </View>
        <Text style={styles.helper}>
          This is a condensed mobile version of the web detail view. Charts, maps, and zones can be
          added on top of this structure.
        </Text>
      </GlassCard>
    </ScreenContainer>
  );
};

