import { FC, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatDistanceToNow } from "date-fns";
import { GlassCard } from "../GlassCard";
import { useTheme } from "../../context/ThemeContext";
import {
  useFriendsList,
  usePendingRequests,
  useSentRequests,
  useSearchAthletes,
  useSendFriendRequest,
  useRespondToRequest,
  type FriendProfile,
} from "../../hooks/useCommunity";

export const FriendsList: FC<{
  onSelectFriend: (friend: FriendProfile) => void;
}> = ({ onSelectFriend }) => {
  const { theme } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: friends = [], isLoading: friendsLoading } = useFriendsList();
  const { data: pendingRequests = [] } = usePendingRequests();
  const { data: sentRequests = [] } = useSentRequests();
  const search = useSearchAthletes();
  const sendRequest = useSendFriendRequest();
  const respond = useRespondToRequest();

  const handleSearch = () => {
    if (searchQuery.trim().length >= 2) {
      search.mutate(searchQuery.trim());
    }
  };

  return (
    <View style={styles.root}>
      {/* Search */}
      <View style={styles.searchRow}>
        <View style={[styles.searchInputWrap, { backgroundColor: theme.surfaceElevated }]}>
          <Ionicons name="search" size={16} color={theme.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: theme.textPrimary }]}
            placeholder="Search by username or name..."
            placeholderTextColor={theme.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            onSubmitEditing={handleSearch}
          />
        </View>
        <TouchableOpacity
          style={[
            styles.searchBtn,
            { backgroundColor: theme.textPrimary, opacity: searchQuery.trim().length < 2 ? 0.5 : 1 },
          ]}
          onPress={handleSearch}
          disabled={searchQuery.trim().length < 2 || search.isPending}
          activeOpacity={0.8}
        >
          {search.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.searchBtnText}>Search</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Search results */}
      {search.data && search.data.length > 0 && (
        <View style={styles.section}>
          {search.data.map((result) => (
            <View
              key={result.id}
              style={[styles.row, { backgroundColor: theme.surfaceElevated + "44" }]}
            >
              <View style={styles.rowLeft}>
                <View style={[styles.avatar, { backgroundColor: "#0f172a0d" }]}>
                  <Text style={[styles.avatarText, { color: theme.textPrimary }]}>
                    {result.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View>
                  <Text style={[styles.rowName, { color: theme.textPrimary }]}>
                    {result.name}
                  </Text>
                  {result.username && (
                    <Text style={[styles.rowMeta, { color: theme.textMuted }]}>
                      @{result.username}
                    </Text>
                  )}
                </View>
              </View>
              {result.is_friend ? (
                <Text style={[styles.rowMeta, { color: theme.textMuted }]}>
                  Already friends
                </Text>
              ) : result.is_pending ? (
                <Text style={[styles.rowMeta, { color: theme.textMuted }]}>
                  Request sent
                </Text>
              ) : (
                <TouchableOpacity
                  style={[styles.addBtn, { borderColor: theme.textPrimary }]}
                  onPress={() => {
                    sendRequest.mutate(result.id, {
                      onSuccess: () => {
                        Alert.alert("Sent", `Request sent to ${result.name}`);
                        search.reset();
                        setSearchQuery("");
                      },
                      onError: (e) => Alert.alert("Error", e.message),
                    });
                  }}
                  disabled={sendRequest.isPending}
                  activeOpacity={0.8}
                >
                  <Ionicons name="person-add-outline" size={14} color={theme.textPrimary} />
                  <Text style={[styles.addBtnText, { color: theme.textPrimary }]}>Add</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      )}

      {search.data && search.data.length === 0 && (
        <Text style={[styles.emptyText, { color: theme.textMuted }]}>
          No athletes found
        </Text>
      )}

      {/* Pending requests */}
      {pendingRequests.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>
            PENDING REQUESTS
          </Text>
          {pendingRequests.map((req) => (
            <View
              key={req.id}
              style={[styles.row, { backgroundColor: theme.surfaceElevated + "44" }]}
            >
              <View style={styles.rowLeft}>
                <View
                  style={[styles.avatar, { backgroundColor: theme.accentGreen + "20" }]}
                >
                  <Text style={[styles.avatarText, { color: theme.accentGreen }]}>
                    {req.fromName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View>
                  <Text style={[styles.rowName, { color: theme.textPrimary }]}>
                    {req.fromName}
                  </Text>
                  <Text style={[styles.rowMeta, { color: theme.textMuted }]}>
                    {formatDistanceToNow(new Date(req.createdAt), { addSuffix: true })}
                  </Text>
                </View>
              </View>
              <View style={styles.requestActions}>
                <TouchableOpacity
                  style={[styles.acceptBtn, { backgroundColor: theme.textPrimary }]}
                  onPress={() =>
                    respond.mutate(
                      { requestId: req.id, action: "accept" },
                      {
                        onSuccess: () =>
                          Alert.alert("Done", `You and ${req.fromName} are now friends`),
                      },
                    )
                  }
                  disabled={respond.isPending}
                  activeOpacity={0.8}
                >
                  <Ionicons name="checkmark" size={18} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.rejectBtn, { borderColor: theme.cardBorder }]}
                  onPress={() =>
                    respond.mutate({ requestId: req.id, action: "reject" })
                  }
                  disabled={respond.isPending}
                  activeOpacity={0.8}
                >
                  <Ionicons name="close" size={18} color={theme.textMuted} />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Sent requests */}
      {sentRequests.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>
            SENT REQUESTS
          </Text>
          {sentRequests.map((req) => (
            <View
              key={req.id}
              style={[
                styles.row,
                { backgroundColor: theme.surfaceElevated + "44", opacity: 0.7 },
              ]}
            >
              <View style={styles.rowLeft}>
                <View style={[styles.avatar, { backgroundColor: theme.cardBorder }]}>
                  <Text style={[styles.avatarText, { color: theme.textMuted }]}>
                    {req.toName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View>
                  <Text style={[styles.rowName, { color: theme.textPrimary }]}>
                    {req.toName}
                  </Text>
                  <View style={styles.pendingRow}>
                    <Ionicons name="time-outline" size={12} color={theme.textMuted} />
                    <Text style={[styles.rowMeta, { color: theme.textMuted }]}>
                      Pending
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Friends list */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>
          FRIENDS{friends.length > 0 ? ` (${friends.length})` : ""}
        </Text>
        {friendsLoading ? (
          <View style={styles.emptyContainer}>
            <ActivityIndicator size="small" color={theme.textPrimary} />
          </View>
        ) : friends.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="person-add-outline" size={36} color={theme.textMuted + "55"} />
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>
              No friends yet. Search above to connect with other athletes.
            </Text>
          </View>
        ) : (
          <View style={styles.friendList}>
            {friends.map((friend) => (
              <TouchableOpacity
                key={friend.id}
                style={styles.friendRow}
                onPress={() => onSelectFriend(friend)}
                activeOpacity={0.7}
              >
                <View style={styles.rowLeft}>
                  <View
                    style={[styles.avatar, { backgroundColor: "#0f172a0d" }]}
                  >
                    <Text style={[styles.avatarText, { color: theme.textPrimary }]}>
                      {friend.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View>
                    <Text style={[styles.rowName, { color: theme.textPrimary }]}>
                      {friend.name}
                    </Text>
                    {friend.goalDistance && (
                      <Text style={[styles.rowMeta, { color: theme.textMuted }]}>
                        {friend.goalDistance}
                        {friend.goalTime ? ` · ${friend.goalTime}` : ""}
                      </Text>
                    )}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { gap: 16 },
  searchRow: { flexDirection: "row", gap: 8 },
  searchInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: 14,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 10 },
  searchBtn: { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, justifyContent: "center" },
  searchBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  section: { gap: 8 },
  sectionTitle: { fontSize: 11, fontWeight: "600", letterSpacing: 0.5, marginBottom: 2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 13, fontWeight: "600" },
  rowName: { fontSize: 14, fontWeight: "500" },
  rowMeta: { fontSize: 12 },
  pendingRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  requestActions: { flexDirection: "row", gap: 6 },
  acceptBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  rejectBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  addBtnText: { fontSize: 12, fontWeight: "600" },
  friendList: { gap: 2 },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  emptyContainer: { alignItems: "center", paddingVertical: 36, gap: 12 },
  emptyText: { fontSize: 13, textAlign: "center" },
});
