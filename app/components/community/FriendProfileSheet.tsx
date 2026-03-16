import { FC } from "react";
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";
import {
  useFriendActivities,
  useFriendPlan,
  useUnfriend,
  type FriendProfile,
} from "../../hooks/useCommunity";
import { formatDistance } from "../../lib/format";

export const FriendProfileSheet: FC<{
  friend: FriendProfile | null;
  visible: boolean;
  onClose: () => void;
}> = ({ friend, visible, onClose }) => {
  const { theme } = useTheme();
  const { data: activityData } = useFriendActivities(friend?.id ?? null);
  const { data: planData } = useFriendPlan(friend?.id ?? null);
  const unfriend = useUnfriend();

  const activities = (activityData?.activities ?? []) as {
    id: string;
    date: string;
    name: string;
    distance_km: number | null;
    avg_pace: string | null;
    type: string;
  }[];
  const plan = planData?.plan ?? null;
  const upcomingWorkouts = (planData?.workouts ?? []) as {
    id: string;
    date: string;
    type: string;
    name: string;
    distance_km: number | null;
    duration_minutes: number | null;
  }[];

  const handleUnfriend = () => {
    if (!friend) return;
    Alert.alert("Remove friend", `Remove ${friend.name} from friends?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () =>
          unfriend.mutate(friend.id, {
            onSuccess: () => {
              Alert.alert("Done", `Removed ${friend.name} from friends`);
              onClose();
            },
          }),
      },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity
        style={[styles.backdrop, { backgroundColor: theme.overlayBackdrop }]}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.sheet,
            { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder },
          ]}
        >
          {friend && (
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Header */}
              <View style={styles.header}>
                <View style={[styles.avatarLarge, { backgroundColor: "#0f172a0d" }]}>
                  <Text style={[styles.avatarLargeText, { color: "#1C1C1E" }]}>
                    {friend.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View>
                  <Text style={[styles.friendName, { color: theme.textPrimary }]}>
                    {friend.name}
                  </Text>
                  {friend.goalDistance && (
                    <Text style={[styles.friendGoal, { color: theme.textSecondary }]}>
                      {friend.goalDistance}
                      {friend.goalTime ? ` in ${friend.goalTime}` : ""}
                    </Text>
                  )}
                </View>
              </View>

              {/* Plan */}
              {plan && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>
                    CURRENT PLAN
                  </Text>
                  <View style={[styles.planCard, { backgroundColor: theme.surfaceElevated, borderColor: theme.cardBorder }]}>
                    <Text style={[styles.planName, { color: theme.textPrimary }]}>
                      {plan.plan_name}
                    </Text>
                    <Text style={[styles.planMeta, { color: theme.textMuted }]}>
                      {plan.philosophy?.replace(/_/g, " ")}
                      {plan.goal_race ? ` · ${plan.goal_race}` : ""}
                      {plan.goal_time ? ` · ${plan.goal_time}` : ""}
                    </Text>
                  </View>

                  {upcomingWorkouts.length > 0 && (
                    <View style={styles.workoutList}>
                      <Text style={[styles.workoutLabel, { color: theme.textMuted }]}>
                        This week
                      </Text>
                      {upcomingWorkouts.slice(0, 5).map((w) => (
                        <View
                          key={w.id}
                          style={[styles.workoutRow, { backgroundColor: theme.surfaceElevated + "55" }]}
                        >
                          <View style={[styles.workoutBadge, { borderColor: theme.cardBorder }]}>
                            <Text style={[styles.workoutBadgeText, { color: theme.textMuted }]}>
                              {w.type}
                            </Text>
                          </View>
                          <Text
                            style={[styles.workoutName, { color: theme.textPrimary }]}
                            numberOfLines={1}
                          >
                            {w.name || w.type}
                          </Text>
                          {w.distance_km != null && (
                            <Text style={[styles.workoutDist, { color: theme.textMuted }]}>
                              {w.distance_km} km
                            </Text>
                          )}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* Recent activities */}
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>
                  RECENT ACTIVITIES
                </Text>
                {activities.length === 0 ? (
                  <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                    No recent activities
                  </Text>
                ) : (
                  <View style={styles.activityList}>
                    {activities.slice(0, 8).map((a) => (
                      <View
                        key={a.id}
                        style={[styles.actRow, { borderBottomColor: theme.cardBorder }]}
                      >
                        <View style={styles.actLeft}>
                          <Text
                            style={[styles.actName, { color: theme.textPrimary }]}
                            numberOfLines={1}
                          >
                            {a.name ?? a.type}
                          </Text>
                          <Text style={[styles.actMeta, { color: theme.textMuted }]}>
                            {a.date}
                            {a.distance_km ? ` · ${formatDistance(a.distance_km)}` : ""}
                            {a.avg_pace ? ` · ${a.avg_pace}` : ""}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* Remove friend */}
              <TouchableOpacity
                style={[styles.removeBtn, { borderColor: theme.cardBorder }]}
                onPress={handleUnfriend}
                disabled={unfriend.isPending}
                activeOpacity={0.8}
              >
                <Ionicons name="person-remove-outline" size={16} color="#ef4444" />
                <Text style={styles.removeBtnText}>Remove friend</Text>
              </TouchableOpacity>

              {/* Close */}
              <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.8}>
                <Text style={[styles.closeBtnText, { color: theme.textMuted }]}>Close</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
    borderTopWidth: StyleSheet.hairlineWidth,
    maxHeight: "85%",
  },
  header: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 20 },
  avatarLarge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLargeText: { fontSize: 18, fontWeight: "600" },
  friendName: { fontSize: 18, fontWeight: "600" },
  friendGoal: { fontSize: 13, marginTop: 2 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 11, fontWeight: "600", letterSpacing: 0.5, marginBottom: 8 },
  planCard: {
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  planName: { fontSize: 14, fontWeight: "600" },
  planMeta: { fontSize: 12, marginTop: 2 },
  workoutList: { marginTop: 10, gap: 6 },
  workoutLabel: { fontSize: 12 },
  workoutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  workoutBadge: { borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, borderWidth: StyleSheet.hairlineWidth },
  workoutBadgeText: { fontSize: 10, fontWeight: "500", textTransform: "capitalize" },
  workoutName: { fontSize: 12, flex: 1 },
  workoutDist: { fontSize: 12 },
  activityList: { gap: 0 },
  actRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actLeft: { flex: 1 },
  actName: { fontSize: 14, fontWeight: "500" },
  actMeta: { fontSize: 12, marginTop: 2 },
  emptyText: { fontSize: 13 },
  removeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: "flex-start",
    marginTop: 8,
  },
  removeBtnText: { fontSize: 13, color: "#ef4444", fontWeight: "500" },
  closeBtn: { alignItems: "center", marginTop: 16 },
  closeBtnText: { fontSize: 13 },
});
