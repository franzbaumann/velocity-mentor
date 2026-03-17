import { FC, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { formatDistanceToNow } from "date-fns";

import { GlassCard } from "../GlassCard";
import { useTheme } from "../../context/ThemeContext";
import { useMyActivities, type FeedActivity } from "../../hooks/useCommunity";
import { formatDistance, formatDuration } from "../../lib/format";
import { LinearGradient } from "expo-linear-gradient";
import { getActivityFadeColor } from "../../lib/analytics";

// ---------------------------------------------------------------------------
// Activity card (own activities) — Edit navigates to ActivityDetail with sheet
// ---------------------------------------------------------------------------

function MyActivityCard({ activity }: { activity: FeedActivity }) {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const photos = Array.isArray(activity.photos) ? activity.photos : [];
  const hasPhotos = photos.length > 0 && !!photos[0]?.url;
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [photoViewerIndex, setPhotoViewerIndex] = useState(0);

  const detailId =
    activity.source === "intervals_icu" && activity.external_id
      ? `icu_${activity.external_id}`
      : activity.id;

  const handleOpenPost = () => {
    navigation.navigate("ActivityPost", { activity });
  };

  const fadeColor = getActivityFadeColor({
    type: activity.type,
    name: activity.name,
    avg_hr: activity.avg_hr,
    duration_seconds: activity.duration_seconds,
  });

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={handleOpenPost}>
      <GlassCard style={[s.card, s.cardWithFade]}>
        <LinearGradient
          colors={[`${fadeColor}2e`, `${fadeColor}10`, `${fadeColor}00`]}
          locations={[0, 0.35, 0.7]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={s.cardHeader}>
          <View style={s.cardHeaderLeft}>
            <Text style={[s.activityName, { color: theme.textPrimary }]}>
              {activity.name ?? activity.type}
            </Text>
            <Text style={[s.timeAgo, { color: theme.mutedForeground }]}>
              {formatDistanceToNow(new Date(activity.date), { addSuffix: true })}
            </Text>
          </View>
          <TouchableOpacity
            style={[s.editBtn, { backgroundColor: theme.secondary }]}
            onPress={handleOpenPost}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="create-outline" size={16} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        {!!activity.caption && (
          <Text style={[s.captionText, { color: theme.textPrimary }]} numberOfLines={2}>
            {activity.caption}
          </Text>
        )}

        <View style={s.typeRow}>
          <View style={[s.typePill, { backgroundColor: theme.secondary }]}>
            <Text style={[s.typePillText, { color: theme.textSecondary }]}>{activity.type}</Text>
          </View>
        </View>

        {hasPhotos && (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.photoRow}
            >
              {photos.map((p, index) => (
                <TouchableOpacity
                  key={p.path ?? p.url ?? index}
                  activeOpacity={0.9}
                  onPress={() => {
                    setPhotoViewerIndex(index);
                    setPhotoViewerOpen(true);
                  }}
                  style={s.photoWrapper}
                >
                  <Image source={{ uri: p.url }} style={s.photo} resizeMode="cover" />
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Modal visible={photoViewerOpen} transparent animationType="fade" onRequestClose={() => setPhotoViewerOpen(false)}>
              <Pressable style={s.photoModalBackdrop} onPress={() => setPhotoViewerOpen(false)}>
                {photos[photoViewerIndex] && (
                  <Image source={{ uri: photos[photoViewerIndex].url }} style={s.photoModalImage} resizeMode="contain" />
                )}
              </Pressable>
            </Modal>
          </>
        )}

        <View style={s.statsRow}>
          {activity.distance_km != null && activity.distance_km > 0 && (
            <Text style={[s.statChip, { color: theme.textPrimary }]}>{formatDistance(activity.distance_km)}</Text>
          )}
          {activity.avg_pace && (
            <Text style={[s.statChip, { color: theme.textSecondary }]}>{activity.avg_pace}</Text>
          )}
          {activity.avg_hr != null && (
            <Text style={[s.statChip, { color: theme.textSecondary }]}>{activity.avg_hr} bpm</Text>
          )}
          {activity.duration_seconds != null && (
            <Text style={[s.statChip, { color: theme.textSecondary }]}>
              {formatDuration(activity.duration_seconds)}
            </Text>
          )}
        </View>
      </GlassCard>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export const MyActivities: FC = () => {
  const { theme } = useTheme();
  const { data: activities = [], isLoading } = useMyActivities(50);

  if (isLoading) {
    return (
      <View style={s.emptyContainer}>
        <ActivityIndicator size="small" color={theme.textPrimary} />
      </View>
    );
  }

  if (activities.length === 0) {
    return (
      <View style={s.emptyContainer}>
        <Ionicons name="fitness-outline" size={40} color={theme.mutedForeground + "66"} />
        <Text style={[s.emptyText, { color: theme.mutedForeground }]}>
          No activities yet. Sync from intervals.icu or record a workout.
        </Text>
      </View>
    );
  }

  return (
    <View style={s.feedList}>
      {activities.map((a) => (
        <MyActivityCard key={a.id} activity={a} />
      ))}
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  feedList: { gap: 12 },
  card: { marginBottom: 0 },
  cardWithFade: {
    position: "relative",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  cardHeaderLeft: { flex: 1 },
  activityName: { fontSize: 15, fontWeight: "600" },
  captionText: { fontSize: 13, lineHeight: 18, marginBottom: 4 },
  timeAgo: { fontSize: 11, marginTop: 2 },
  editBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  typeRow: { flexDirection: "row", marginBottom: 8 },
  typePill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  typePillText: { fontSize: 11, fontWeight: "500", textTransform: "capitalize" },
  photoRow: { columnGap: 8, marginBottom: 10 },
  photoWrapper: { borderRadius: 16, overflow: "hidden", backgroundColor: "#00000010" },
  photo: { width: 200, height: 150, borderRadius: 16 },
  photoModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  photoModalImage: { width: "100%", height: "100%" },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statChip: { fontSize: 13 },
  emptyContainer: { alignItems: "center", paddingVertical: 48, gap: 12 },
  emptyText: { fontSize: 14, textAlign: "center" },
});
