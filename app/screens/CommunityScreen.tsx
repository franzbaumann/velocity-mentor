import { FC, useCallback, useEffect, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "../components/ScreenContainer";
import { GlassCard } from "../components/GlassCard";
import { useTheme } from "../context/ThemeContext";
import {
  useFriendsList,
  usePendingInvitesCount,
  type FriendProfile,
} from "../hooks/useCommunity";
import { FriendFeed } from "../components/community/FriendFeed";
import { FriendsList } from "../components/community/FriendsList";
import { FriendProfileSheet } from "../components/community/FriendProfileSheet";
import { WorkoutInvites } from "../components/community/WorkoutInvites";
import { MyActivities } from "../components/community/MyActivities";
import * as Notifications from "expo-notifications";

export const COMMUNITY_ENABLED = true;

type Tab = "mine" | "feed" | "friends" | "invites";

const TABS: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "mine", label: "My Runs", icon: "fitness-outline" },
  { key: "feed", label: "Feed", icon: "newspaper-outline" },
  { key: "friends", label: "Friends", icon: "people-outline" },
  { key: "invites", label: "Invites", icon: "barbell-outline" },
];

export const CommunityScreen: FC = () => {
  const { theme } = useTheme();
  const [tab, setTab] = useState<Tab>("mine");
  const [selectedFriend, setSelectedFriend] = useState<FriendProfile | null>(null);
  const [pushStatus, setPushStatus] = useState<Notifications.PermissionStatus | null>(null);

  const { data: friends = [], refetch: refetchFriends } = useFriendsList();
  const { data: badgeCount = 0 } = usePendingInvitesCount();

  const handleRefresh = useCallback(async () => {
    await refetchFriends();
  }, [refetchFriends]);

  // Best-effort push opt-in when user first visits Community
  useEffect(() => {
    let cancelled = false;
    const ensurePushPermission = async () => {
      try {
        const settings = await Notifications.getPermissionsAsync();
        if (cancelled) return;
        setPushStatus(settings.status);
      } catch (e) {
        if (!cancelled) {
          // eslint-disable-next-line no-console
          console.log("[community] push permission error", e);
        }
      }
    };
    ensurePushPermission();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleEnableNotifications = useCallback(async () => {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      setPushStatus(status);
      if (status === "denied") {
        Alert.alert(
          "Notifications disabled",
          "You can enable community notifications later in system settings.",
        );
      }
    } catch (e) {
      Alert.alert("Error", "Could not update notification settings.");
    }
  }, []);

  if (!COMMUNITY_ENABLED) {
    return (
      <ScreenContainer scroll={false} contentContainerStyle={styles.centered}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>Community</Text>
        </View>
        <GlassCard>
          <View style={styles.emptyBody}>
            <View style={[styles.iconCircle, { backgroundColor: theme.surfaceElevated }]}>
              <Ionicons name="globe-outline" size={28} color={theme.textMuted} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>
              Community coming soon
            </Text>
            <Text style={[styles.emptySubtitle, { color: theme.textMuted }]}>
              Feature launching soon. You'll be able to share progress, learn from
              other runners, and stay motivated together.
            </Text>
          </View>
        </GlassCard>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer onRefresh={handleRefresh}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.headerTitleRow}>
          <Ionicons name="globe-outline" size={22} color={theme.textPrimary} />
          <Text style={[styles.title, { color: theme.textPrimary }]}>Community</Text>
        </View>
      </View>

      {/* Push CTA banner */}
      {pushStatus !== null && pushStatus !== Notifications.PermissionStatus.GRANTED && (
        <View
          style={[
            styles.pushBanner,
            { backgroundColor: theme.surfaceElevated, borderColor: theme.cardBorder },
          ]}
        >
          <View style={styles.pushBannerLeft}>
            <Ionicons name="notifications-outline" size={18} color={theme.textPrimary} />
            <View style={styles.pushBannerTextWrap}>
              <Text style={[styles.pushTitle, { color: theme.textPrimary }]}>
                Enable community notifications
              </Text>
              <Text style={[styles.pushSubtitle, { color: theme.textMuted }]}>
                Get alerts for friend requests, invites, and comments.
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.pushBtn, { backgroundColor: theme.textPrimary }]}
            onPress={handleEnableNotifications}
            activeOpacity={0.8}
          >
            <Text style={styles.pushBtnText}>Turn on</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Tab bar */}
      <View style={[styles.tabBar, { backgroundColor: theme.surfaceElevated, borderColor: theme.cardBorder }]}>
        {TABS.map((t) => {
          const active = tab === t.key;
          const showBadge = t.key === "invites" && badgeCount > 0;
          return (
            <TouchableOpacity
              key={t.key}
              style={[
                styles.tab,
                active && { backgroundColor: "#1C1C1E10" },
              ]}
              onPress={() => setTab(t.key)}
              activeOpacity={0.7}
            >
              <View style={styles.tabInner}>
                <Ionicons
                  name={t.icon}
                  size={16}
                  color={active ? theme.textPrimary : theme.textMuted}
                />
                <Text
                  style={[
                    styles.tabLabel,
                    { color: active ? theme.textPrimary : theme.textMuted },
                    active && styles.tabLabelActive,
                  ]}
                >
                  {t.label}
                </Text>
                {showBadge && (
                  <View style={[styles.badge, { backgroundColor: theme.accentRed }]}>
                    <Text style={styles.badgeText}>{badgeCount}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Tab content */}
      <View style={styles.tabContent}>
        {tab === "mine" && <MyActivities />}
        {tab === "feed" && <FriendFeed friends={friends} />}
        {tab === "friends" && (
          <FriendsList onSelectFriend={(f) => setSelectedFriend(f)} />
        )}
        {tab === "invites" && <WorkoutInvites friends={friends} />}
      </View>

      {/* Profile sheet */}
      <FriendProfileSheet
        friend={selectedFriend}
        visible={!!selectedFriend}
        onClose={() => setSelectedFriend(null)}
      />
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: "center", gap: 16 },
  headerRow: { marginBottom: 12 },
  headerTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 22, fontWeight: "600" },
  emptyBody: { alignItems: "center", gap: 12 },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 18, fontWeight: "600", textAlign: "center" },
  emptySubtitle: { fontSize: 14, textAlign: "center", lineHeight: 20 },

  pushBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
    gap: 10,
  },
  pushBannerLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  pushBannerTextWrap: { flex: 1 },
  pushTitle: { fontSize: 13, fontWeight: "600" },
  pushSubtitle: { fontSize: 12, lineHeight: 16 },
  pushBtn: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pushBtnText: { fontSize: 12, fontWeight: "600", color: "#fff" },

  tabBar: {
    flexDirection: "row",
    borderRadius: 14,
    padding: 3,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 16,
  },
  tab: { flex: 1, borderRadius: 11, paddingVertical: 8 },
  tabInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  tabLabel: { fontSize: 12, fontWeight: "500" },
  tabLabelActive: { fontWeight: "600" },
  badge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    marginLeft: 2,
  },
  badgeText: { fontSize: 10, fontWeight: "700", color: "#fff" },

  tabContent: { flex: 1 },
});
