import { FC, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
  Modal,
  Pressable,
  Linking,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { Share } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { formatDistanceToNow } from "date-fns";
import { GlassCard } from "../GlassCard";
import { useTheme } from "../../context/ThemeContext";
import {
  useFeedData,
  useLikesForActivities,
  useCommentsForActivities,
  useToggleLike,
  useAddComment,
  type FeedActivity,
  type FeedComment,
  type FriendProfile,
} from "../../hooks/useCommunity";
import { useSupabaseAuth } from "../../SupabaseProvider";
import { formatDistance, formatDuration } from "../../lib/format";
import { getActivityFadeColor } from "../../lib/analytics";

function ActivityCard({
  activity,
  friendName,
  likeCount,
  userLiked,
  comments,
  allFriends,
}: {
  activity: FeedActivity;
  friendName: string;
  likeCount: number;
  userLiked: boolean;
  comments: FeedComment[];
  allFriends: Map<string, string>;
}) {
  const { theme } = useTheme();
  const { user } = useSupabaseAuth();
  const navigation = useNavigation<any>();
  const toggleLike = useToggleLike();
  const addComment = useAddComment();
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [photoViewerIndex, setPhotoViewerIndex] = useState(0);

  const handleShare = () => {
    const title = activity.name ?? activity.type ?? "Activity";
    const distance =
      activity.distance_km != null && activity.distance_km > 0
        ? `${formatDistance(activity.distance_km)}`
        : null;
    const duration =
      activity.duration_seconds != null
        ? `${formatDuration(activity.duration_seconds)}`
        : null;
    const parts = [
      `${friendName}'s workout: ${title}`,
      distance,
      duration,
      activity.avg_pace ?? null,
    ].filter(Boolean);

    Share.share({
      title: `${friendName}'s workout`,
      message: parts.join(" · "),
    }).catch(() => {
      // ignore share errors
    });
  };

  const handleLike = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleLike.mutate({ activityId: activity.id, liked: userLiked });
  };

  const handleComment = () => {
    if (!commentText.trim()) return;
    addComment.mutate(
      { activityId: activity.id, content: commentText.trim() },
      { onSuccess: () => setCommentText("") },
    );
  };

  const pace = activity.avg_pace;
  const photos = Array.isArray(activity.photos) ? activity.photos : [];
  const hasPhoto = photos.length > 0 && !!photos[0]?.url;
  const fadeColor = getActivityFadeColor({
    type: activity.type,
    name: activity.name,
    avg_hr: activity.avg_hr,
    duration_seconds: activity.duration_seconds,
  });

  const isSelf = user?.id === activity.user_id;
  const detailId =
    activity.source === "intervals_icu" && activity.external_id
      ? `icu_${activity.external_id}`
      : activity.id;

  const handleOpenDetail = () => {
    if (isSelf) {
      navigation.navigate("ActivitiesStack", {
        screen: "ActivityDetail",
        params: { id: detailId },
      });
      return;
    }

    // For friends' Intervals.icu activities, open full web detail with charts
    if (activity.source === "intervals_icu" && activity.external_id) {
      const url = `https://velocity-mentor.vercel.app/activities/icu_${activity.external_id}`;
      Linking.openURL(url).catch(() => {});
      return;
    }

    // Fallback: lightweight native friend detail (for non-ICU sources)
    navigation.navigate("FriendActivityDetail", {
      activityId: activity.id,
      name: activity.name,
      type: activity.type,
      date: activity.date,
      friendName,
      distance_km: activity.distance_km,
      duration_seconds: activity.duration_seconds,
      avg_pace: activity.avg_pace,
      avg_hr: activity.avg_hr,
      photos: activity.photos ?? [],
    });
  };

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={handleOpenDetail}>
    <GlassCard style={[styles.card, styles.cardWithFade]}>
      <LinearGradient
        colors={[`${fadeColor}2e`, `${fadeColor}10`, `${fadeColor}00`]}
        locations={[0, 0.35, 0.7]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.cardHeader}>
        <View style={[styles.avatar, { backgroundColor: "#0f172a0d" }]}>
          <Text style={[styles.avatarText, { color: theme.textPrimary }]}>
            {friendName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View>
          <Text style={[styles.friendName, { color: theme.textPrimary }]}>
            {friendName}
          </Text>
          <Text style={[styles.timeAgo, { color: theme.textMuted }]}>
            {formatDistanceToNow(new Date(activity.date), { addSuffix: true })}
          </Text>
        </View>
      </View>

      <Text style={[styles.activityName, { color: theme.textPrimary }]}>
        {activity.name ?? activity.type}
      </Text>

      {!!activity.caption && (
        <Text style={[styles.captionText, { color: theme.textPrimary }]}>
          {activity.caption}
        </Text>
      )}

      <View style={styles.typeRow}>
        <View style={[styles.typePill, { backgroundColor: theme.surfaceElevated }]}>
          <Text style={[styles.typePillText, { color: theme.textSecondary }]}>
            {activity.type}
          </Text>
        </View>
      </View>

      {hasPhoto && (
        <>
          <View style={styles.photoScrollWrapper}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.photoRow}
            >
              {photos.map((p, index) => (
                <TouchableOpacity
                  key={p.path ?? p.url ?? index}
                  activeOpacity={0.9}
                  onPress={() => {
                    setPhotoViewerIndex(index);
                    setPhotoViewerOpen(true);
                  }}
                  style={styles.photoWrapper}
                >
                  <Image
                    source={{ uri: p.url }}
                    style={styles.photo}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          <Modal
            visible={photoViewerOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setPhotoViewerOpen(false)}
          >
            <Pressable
              style={styles.photoModalBackdrop}
              onPress={() => setPhotoViewerOpen(false)}
            >
              {photos[photoViewerIndex] && (
                <Image
                  source={{ uri: photos[photoViewerIndex].url }}
                  style={styles.photoModalImage}
                  resizeMode="contain"
                />
              )}
            </Pressable>
          </Modal>
        </>
      )}

      <View style={styles.statsRow}>
        {activity.distance_km != null && activity.distance_km > 0 && (
          <Text style={[styles.statChip, { color: theme.textPrimary }]}>
            {formatDistance(activity.distance_km)}
          </Text>
        )}
        {pace && (
          <Text style={[styles.statChip, { color: theme.textSecondary }]}>
            {pace}
          </Text>
        )}
        {activity.avg_hr != null && (
          <Text style={[styles.statChip, { color: theme.textSecondary }]}>
            {activity.avg_hr} bpm
          </Text>
        )}
        {activity.duration_seconds != null && (
          <Text style={[styles.statChip, { color: theme.textSecondary }]}>
            {formatDuration(activity.duration_seconds)}
          </Text>
        )}
      </View>

      <View style={[styles.actionRow, { borderTopColor: theme.cardBorder }]}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={handleLike}
          activeOpacity={0.7}
          disabled={toggleLike.isPending}
        >
          <Ionicons
            name={userLiked ? "heart" : "heart-outline"}
            size={20}
            color={userLiked ? "#ef4444" : theme.textMuted}
          />
          {likeCount > 0 && (
            <Text style={[styles.actionCount, { color: theme.textMuted }]}>
              {likeCount}
            </Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => setShowComments(!showComments)}
          activeOpacity={0.7}
        >
          <Ionicons name="chatbubble-outline" size={18} color={theme.textMuted} />
          {comments.length > 0 && (
            <Text style={[styles.actionCount, { color: theme.textMuted }]}>
              {comments.length}
            </Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={handleShare}
          activeOpacity={0.7}
        >
          <Ionicons name="share-social-outline" size={18} color={theme.textMuted} />
        </TouchableOpacity>
      </View>

      {showComments && (
        <View style={[styles.commentsSection, { borderTopColor: theme.cardBorder }]}>
          {comments.map((c) => (
            <Text key={c.id} style={styles.commentRow}>
              <Text style={[styles.commentAuthor, { color: theme.textPrimary }]}>
                {c.userId === user?.id
                  ? "You"
                  : allFriends.get(c.userId) ?? "Friend"}{" "}
              </Text>
              <Text style={{ color: theme.textSecondary }}>{c.content}</Text>
            </Text>
          ))}
          <View style={styles.commentInputRow}>
            <TextInput
              style={[
                styles.commentInput,
                {
                  backgroundColor: theme.surfaceElevated,
                  color: theme.textPrimary,
                },
              ]}
              placeholder="Add a comment..."
              placeholderTextColor={theme.textMuted}
              value={commentText}
              onChangeText={setCommentText}
              returnKeyType="send"
              onSubmitEditing={handleComment}
            />
            <TouchableOpacity
              onPress={handleComment}
              disabled={!commentText.trim() || addComment.isPending}
              activeOpacity={0.7}
            >
              <Ionicons
                name="send"
                size={18}
                color={commentText.trim() ? theme.textPrimary : theme.textMuted}
              />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </GlassCard>
    </TouchableOpacity>
  );
}

export const FriendFeed: FC<{ friends: FriendProfile[] }> = ({ friends }) => {
  const { theme } = useTheme();
  const { user } = useSupabaseAuth();
  const friendIds = friends.map((f) => f.id);
  const friendNameMap = new Map(friends.map((f) => [f.id, f.name]));
  if (user) friendNameMap.set(user.id, "You");

  const allIds = [...friendIds, user?.id].filter(Boolean) as string[];

  const { data: activities = [], isLoading } = useFeedData(allIds);
  const activityIds = activities.map((a) => a.id);
  const { data: likeData } = useLikesForActivities(activityIds);
  const { data: commentData } = useCommentsForActivities(activityIds);

  if (friends.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="people-outline" size={40} color={theme.textMuted + "66"} />
        <Text style={[styles.emptyText, { color: theme.textMuted }]}>
          Add friends to see their activities here.
        </Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.emptyContainer}>
        <ActivityIndicator size="small" color={theme.textPrimary} />
      </View>
    );
  }

  if (activities.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={[styles.emptyText, { color: theme.textMuted }]}>
          No activities from your friends yet.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.feedList}>
      {activities.map((a) => (
        <ActivityCard
          key={a.id}
          activity={a}
          friendName={friendNameMap.get(a.user_id) ?? "Friend"}
          likeCount={likeData?.likeCounts.get(a.id) ?? 0}
          userLiked={likeData?.userLiked.has(a.id) ?? false}
          comments={commentData?.get(a.id) ?? []}
          allFriends={friendNameMap}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  feedList: { gap: 12 },
  card: { marginBottom: 0 },
  cardWithFade: {
    position: "relative",
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 14, fontWeight: "600" },
  friendName: { fontSize: 14, fontWeight: "600" },
  timeAgo: { fontSize: 11 },
  activityName: { fontSize: 15, fontWeight: "600", marginBottom: 4 },
  captionText: { fontSize: 13, lineHeight: 18, marginBottom: 6 },
  typeRow: { flexDirection: "row", marginBottom: 8 },
  typePill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  typePillText: { fontSize: 11, fontWeight: "500", textTransform: "capitalize" },
  photoScrollWrapper: {
    marginBottom: 10,
  },
  photoRow: {
    columnGap: 8,
  },
  photoWrapper: {
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#00000010",
  },
  photo: {
    width: "100%",
    height: 200,
  },
  photoModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  photoModalImage: {
    width: "100%",
    height: "100%",
  },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 10 },
  statChip: { fontSize: 13 },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 4 },
  actionCount: { fontSize: 12 },
  commentsSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  commentRow: { fontSize: 13, lineHeight: 18 },
  commentAuthor: { fontWeight: "600" },
  commentInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  commentInput: {
    flex: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 13,
  },
  emptyContainer: { alignItems: "center", paddingVertical: 48, gap: 12 },
  emptyText: { fontSize: 14, textAlign: "center" },
});
