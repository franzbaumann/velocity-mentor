import { FC, useMemo } from "react";
import { RefreshControl, SectionList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../components/ScreenContainer";
import { GlassCard } from "../components/GlassCard";
import { useTheme } from "../context/ThemeContext";
import { useActivitiesList, type ActivityListItem, type ActivitiesSection } from "../hooks/useActivities";
import type { ActivitiesStackParamList } from "../navigation/RootNavigator";

type ActivitiesNav = NativeStackNavigationProp<ActivitiesStackParamList, "ActivitiesList">;

export const ActivitiesScreen: FC = () => {
  const { colors } = useTheme();
  const { sections, isLoading, isEmpty, isRefetching, refetch } = useActivitiesList();
  const navigation = useNavigation<ActivitiesNav>();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        loadingContent: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 32, gap: 16 },
        listContent: { paddingHorizontal: 0, paddingTop: 56, paddingBottom: 0 },
        title: {
          fontSize: 22,
          fontWeight: "600",
          color: colors.foreground,
          paddingHorizontal: 20,
          marginBottom: 12,
        },
        listCard: {
          flex: 1,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          backgroundColor: colors.glassBg,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          overflow: "hidden",
        },
        body: { fontSize: 14, color: colors.mutedForeground, lineHeight: 20 },
        sectionHeader: {
          paddingHorizontal: 20,
          paddingVertical: 8,
          backgroundColor: colors.background,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        },
        sectionHeaderText: { fontSize: 13, fontWeight: "500", color: colors.foreground },
        row: {
          paddingHorizontal: 20,
          paddingVertical: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        },
        rowMain: { flex: 1, marginRight: 12 },
        rowTitle: { fontSize: 15, fontWeight: "500", color: colors.foreground },
        rowMeta: { flexDirection: "row", flexWrap: "wrap", marginTop: 2 },
        rowMetaText: { fontSize: 12, color: colors.mutedForeground },
        rowRight: { alignItems: "flex-end", gap: 4 },
        rowDistance: { fontSize: 14, fontWeight: "600", color: colors.foreground },
        rowTag: {
          fontSize: 11,
          color: colors.mutedForeground,
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 999,
          backgroundColor: colors.muted,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        },
      }),
    [colors]
  );

  if (isLoading) {
    return (
      <ScreenContainer contentContainerStyle={styles.loadingContent}>
        <Text style={styles.title}>Activities</Text>
        <GlassCard>
          <Text style={styles.body}>Loading activities…</Text>
        </GlassCard>
      </ScreenContainer>
    );
  }

  if (isEmpty) {
    return (
      <ScreenContainer contentContainerStyle={styles.loadingContent}>
        <Text style={styles.title}>Activities</Text>
        <GlassCard>
          <Text style={styles.body}>
            No activities yet. Once your data is connected, they will appear here grouped by date.
          </Text>
        </GlassCard>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer contentContainerStyle={styles.listContent}>
      <Text style={styles.title}>Activities</Text>
      <View style={styles.listCard}>
        <SectionList<ActivityListItem, ActivitiesSection>
          sections={sections}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={!!isRefetching} onRefresh={() => refetch()} tintColor={colors.primary} />
          }
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>{section.title}</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.75}
              onPress={() => navigation.navigate("ActivityDetail", { id: item.id })}
            >
              <View style={styles.rowMain}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.name}
                </Text>
                <View style={styles.rowMeta}>
                  {item.pace && <Text style={styles.rowMetaText}>{item.pace}</Text>}
                  {item.duration && <Text style={styles.rowMetaText}> · {item.duration}</Text>}
                  {item.hr != null && <Text style={styles.rowMetaText}> · {item.hr} bpm</Text>}
                </View>
              </View>
              <View style={styles.rowRight}>
                <Text style={styles.rowDistance}>
                  {item.nonDist ? item.duration : `${item.km.toFixed(1)} km`}
                </Text>
                <Text style={styles.rowTag}>{item.type}</Text>
              </View>
            </TouchableOpacity>
          )}
          stickySectionHeadersEnabled
        />
      </View>
    </ScreenContainer>
  );
};

