import { FC, useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { format, parseISO, differenceInWeeks, isWithinInterval } from "date-fns";
import { useTheme } from "../context/ThemeContext";
import { ScreenContainer } from "../components/ScreenContainer";
import { useSeasons, useSeasonWithRaces } from "../hooks/useSeasons";
import type { PlanStackParamList } from "../navigation/RootNavigator";
import type { SeasonRace } from "../hooks/useSeasons";
import { spacing } from "../theme/theme";

type ViewRoute = RouteProp<PlanStackParamList, "SeasonView">;

type Props = { initialSeasonId?: string };

const PRIORITY_COLORS: Record<string, string> = {
  A: "#3b82f6",
  B: "#f97316",
  C: "#6b7280",
};

export const SeasonViewScreen: FC<Props> = ({ initialSeasonId }) => {
  const { theme, colors } = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<ViewRoute>();
  const seasonId = route.params?.seasonId ?? initialSeasonId ?? null;
  const { deleteSeason } = useSeasons();
  const { season, isLoading, refetch, deleteRace } = useSeasonWithRaces(seasonId);

  const handleCreateNew = useCallback(() => {
    navigation.navigate("SeasonWizard");
  }, [navigation]);

  const handleDeleteSeason = useCallback(() => {
    if (!season) return;
    Alert.alert(
      "Delete season",
      `Delete "${season.name}"? This will remove all races in this season.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteSeason.mutateAsync(season.id);
              if (route.params?.seasonId) navigation.replace("Season");
            } catch (e) {
              console.error(e);
            }
          },
        },
      ],
    );
  }, [season, deleteSeason, navigation]);

  const handleDeleteRace = useCallback(
    (race: SeasonRace) => {
      if (!seasonId) return;
      Alert.alert("Delete race", `Remove "${race.name}" from the season?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteRace.mutateAsync({ id: race.id, seasonId }),
        },
      ]);
    },
    [seasonId, deleteRace],
  );

  const aCount = season?.races?.filter((r) => r.priority === "A").length ?? 0;
  const bCount = season?.races?.filter((r) => r.priority === "B").length ?? 0;
  const cCount = season?.races?.filter((r) => r.priority === "C").length ?? 0;

  const startDate = season ? parseISO(season.start_date) : null;
  const endDate = season ? parseISO(season.end_date) : null;
  const weeksRemaining =
    startDate && endDate
      ? Math.max(0, differenceInWeeks(endDate, new Date()))
      : null;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        header: { marginBottom: 20 },
        title: { fontSize: 24, fontWeight: "700", color: theme.textPrimary, marginBottom: 4 },
        subtitle: { fontSize: 14, color: theme.textMuted, marginBottom: 12 },
        headerRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          flexWrap: "wrap",
        },
        createBtn: {
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingVertical: 8,
          paddingHorizontal: 12,
        },
        createBtnText: { fontSize: 15, fontWeight: "600", color: colors.primary },
        deleteBtn: {
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingVertical: 8,
          paddingHorizontal: 12,
        },
        deleteBtnText: { fontSize: 15, fontWeight: "600", color: theme.accentRed },
        badgesRow: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 24,
        },
        pill: {
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 999,
        },
        pillText: { fontSize: 13, fontWeight: "600" },
        sectionLabel: {
          fontSize: 11,
          fontWeight: "600",
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: theme.textMuted,
          marginBottom: 12,
        },
        timeline: {
          height: 24,
          borderRadius: 12,
          backgroundColor: colors.border + "40",
          marginBottom: 24,
          overflow: "hidden",
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 4,
        },
        raceDot: {
          position: "absolute",
          borderRadius: 999,
          backgroundColor: "#3b82f6",
        },
        raceCard: {
          padding: 16,
          borderRadius: 12,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          backgroundColor: theme.cardBackground,
          marginBottom: 10,
        },
        raceCardHeader: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 6,
        },
        raceCardName: { fontSize: 16, fontWeight: "600", color: theme.textPrimary },
        raceCardMeta: { fontSize: 13, color: theme.textMuted },
        raceCardVenue: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
        swipeAction: {
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: theme.accentRed,
          width: 80,
          borderRadius: 12,
          marginBottom: 10,
        },
        swipeActionText: { color: "#fff", fontWeight: "600", fontSize: 13 },
      }),
    [theme, colors],
  );

  if (!seasonId) {
    navigation.replace("Season");
    return null;
  }

  if (isLoading || !season) {
    return (
      <ScreenContainer scroll={false}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  const totalDays =
    startDate && endDate
      ? Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)))
      : 1;

  return (
    <ScreenContainer onRefresh={refetch}>
      <View style={styles.header}>
        <Text style={styles.title}>{season.name}</Text>
        <Text style={styles.subtitle}>
          {format(parseISO(season.start_date), "MMM d, yyyy")} –{" "}
          {format(parseISO(season.end_date), "MMM d, yyyy")}
          {weeksRemaining != null ? ` · ${weeksRemaining} weeks remaining` : ""}
        </Text>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={handleCreateNew} style={styles.createBtn}>
            <Ionicons name="add" size={20} color={colors.primary} />
            <Text style={styles.createBtnText}>Create new season</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDeleteSeason} style={styles.deleteBtn}>
            <Ionicons name="trash-outline" size={18} color={theme.accentRed} />
            <Text style={styles.deleteBtnText}>Delete season</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.badgesRow}>
        <View style={[styles.pill, { backgroundColor: "#3b82f620" }]}>
          <Text style={[styles.pillText, { color: "#3b82f6" }]}>{aCount} A-races</Text>
        </View>
        <View style={[styles.pill, { backgroundColor: "#f9731620" }]}>
          <Text style={[styles.pillText, { color: "#f97316" }]}>{bCount} B-races</Text>
        </View>
        <View style={[styles.pill, { backgroundColor: "#6b728020" }]}>
          <Text style={[styles.pillText, { color: "#6b7280" }]}>{cCount} C-races</Text>
        </View>
        <View style={[styles.pill, { backgroundColor: colors.border }]}>
          <Text style={[styles.pillText, { color: theme.textMuted }]}>Base</Text>
        </View>
      </View>

      <Text style={styles.sectionLabel}>SEASON TIMELINE</Text>
      <View style={styles.timeline}>
        {season.races?.map((r) => {
          const d = parseISO(r.race_date);
          const pct =
            startDate && endDate && totalDays > 0
              ? Math.max(0, Math.min(1, (d.getTime() - startDate.getTime()) / (totalDays * 24 * 60 * 60 * 1000))) * 100
              : 0;
          const size = r.priority === "A" ? 12 : r.priority === "B" ? 8 : 6;
          const left = `${pct}%`;
          return (
            <View
              key={r.id}
              style={[
                styles.raceDot,
                {
                  width: size,
                  height: size,
                  left,
                  marginLeft: -size / 2,
                  backgroundColor: PRIORITY_COLORS[r.priority] ?? colors.primary,
                },
              ]}
            />
          );
        })}
      </View>

      <Text style={styles.sectionLabel}>RACES</Text>
      {!season.races?.length ? (
        <Text style={[styles.raceCardMeta, { marginBottom: 16 }]}>
          No races added yet. Create a new season to add races in the wizard.
        </Text>
      ) : (
        season.races.map((race) => (
          <Swipeable
            key={race.id}
            renderRightActions={() => (
              <TouchableOpacity
                style={styles.swipeAction}
                onPress={() => handleDeleteRace(race)}
              >
                <Text style={styles.swipeActionText}>Delete</Text>
              </TouchableOpacity>
            )}
          >
            <View style={styles.raceCard}>
              <View style={styles.raceCardHeader}>
                <Text style={styles.raceCardName}>{race.name}</Text>
                <View
                  style={{
                    backgroundColor: (PRIORITY_COLORS[race.priority] ?? colors.primary) + "30",
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 999,
                  }}
                >
                  <Text style={[styles.pillText, { color: PRIORITY_COLORS[race.priority], fontSize: 11 }]}>
                    {race.priority}
                  </Text>
                </View>
              </View>
              <Text style={styles.raceCardMeta}>
                {format(parseISO(race.race_date), "MMM d, yyyy")}
                {race.distance ? ` · ${race.distance}` : ""}
              </Text>
              {race.venue ? <Text style={styles.raceCardVenue}>{race.venue}</Text> : null}
              {race.goal_time ? (
                <Text style={[styles.raceCardMeta, { marginTop: 4 }]}>Goal: {race.goal_time}</Text>
              ) : null}
            </View>
          </Swipeable>
        ))
      )}
    </ScreenContainer>
  );
};
