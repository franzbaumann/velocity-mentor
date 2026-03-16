import { FC, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { format, addDays, parseISO } from "date-fns";
import { GlassCard } from "../GlassCard";
import { useTheme } from "../../context/ThemeContext";
import {
  useWorkoutInvites,
  useRespondToInvite,
  useSendInvite,
  type FriendProfile,
  type WorkoutInviteRow,
} from "../../hooks/useCommunity";
import { useSupabaseAuth } from "../../SupabaseProvider";
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "../../shared/supabase";

function NewInviteModal({
  visible,
  onClose,
  friends,
}: {
  visible: boolean;
  onClose: () => void;
  friends: FriendProfile[];
}) {
  const { theme } = useTheme();
  const [selectedFriend, setSelectedFriend] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [inviteType, setInviteType] = useState<"combined" | "parallel">("combined");
  const sendInvite = useSendInvite();
  const proposedDate = format(addDays(new Date(), 1), "yyyy-MM-dd");

  const handleSend = () => {
    if (!selectedFriend) {
      Alert.alert("Select a friend");
      return;
    }
    sendInvite.mutate(
      { toUser: selectedFriend, proposedDate, message, inviteType },
      {
        onSuccess: () => {
          Alert.alert("Sent", "Workout invite sent!");
          setSelectedFriend(null);
          setMessage("");
          onClose();
        },
        onError: (e) => Alert.alert("Error", e.message),
      },
    );
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
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={[styles.sheetTitle, { color: theme.textPrimary }]}>
              Run Together
            </Text>
            <Text style={[styles.sheetDesc, { color: theme.textMuted }]}>
              Send a workout invite to a friend for{" "}
              {format(addDays(new Date(), 1), "EEEE, MMM d")}.
            </Text>

            {/* Friend selector */}
            <Text style={[styles.label, { color: theme.textMuted }]}>Friend</Text>
            <View style={styles.friendChips}>
              {friends.map((f) => (
                <TouchableOpacity
                  key={f.id}
                    style={[
                      styles.friendChip,
                      {
                        borderColor:
                          selectedFriend === f.id ? "#1C1C1E" : theme.cardBorder,
                        backgroundColor:
                          selectedFriend === f.id ? "#1C1C1E" : "transparent",
                      },
                    ]}
                  onPress={() => setSelectedFriend(f.id)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.friendChipText,
                      {
                        color:
                          selectedFriend === f.id ? "#FFFFFF" : theme.textPrimary,
                        fontWeight: selectedFriend === f.id ? "600" : "500",
                      },
                    ]}
                  >
                    {f.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Invite type */}
            <Text style={[styles.label, { color: theme.textMuted }]}>Workout Style</Text>
            <View style={styles.typeRow}>
              <TouchableOpacity
                style={[
                  styles.typeCard,
                  {
                    borderColor:
                      inviteType === "combined" ? "#1C1C1E" : theme.cardBorder,
                    backgroundColor:
                      inviteType === "combined" ? "#1C1C1E" : "transparent",
                  },
                ]}
                onPress={() => setInviteType("combined")}
                activeOpacity={0.8}
              >
                <Ionicons name="people" size={20} color="#FFFFFF" />
                <Text style={[styles.typeName, { color: theme.textPrimary }]}>
                  Combined
                </Text>
                <Text style={[styles.typeDesc, { color: theme.textMuted }]}>
                  Kipcoachee merges both plans
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.typeCard,
                  {
                    borderColor:
                      inviteType === "parallel" ? "#1C1C1E" : theme.cardBorder,
                    backgroundColor:
                      inviteType === "parallel" ? "#1C1C1E" : "transparent",
                  },
                ]}
                onPress={() => setInviteType("parallel")}
                activeOpacity={0.8}
              >
                <Ionicons name="barbell-outline" size={20} color="#FFFFFF" />
                <Text style={[styles.typeName, { color: theme.textPrimary }]}>
                  Parallel
                </Text>
                <Text style={[styles.typeDesc, { color: theme.textMuted }]}>
                  Own reps, shared warm-up
                </Text>
              </TouchableOpacity>
            </View>

            {/* Message */}
            <Text style={[styles.label, { color: theme.textMuted }]}>
              Message (optional)
            </Text>
            <TextInput
              style={[
                styles.messageInput,
                {
                  backgroundColor: theme.surfaceElevated,
                  color: theme.textPrimary,
                  borderColor: theme.cardBorder,
                },
              ]}
              placeholder="e.g. Meet at the track at 7?"
              placeholderTextColor={theme.textMuted}
              value={message}
              onChangeText={setMessage}
              multiline
            />

            <TouchableOpacity
              style={[
                styles.sendBtn,
                {
                  backgroundColor: "#1C1C1E",
                  opacity: !selectedFriend || sendInvite.isPending ? 0.5 : 1,
                },
              ]}
              onPress={handleSend}
              disabled={!selectedFriend || sendInvite.isPending}
              activeOpacity={0.8}
            >
              {sendInvite.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="send" size={16} color="#fff" />
                  <Text style={styles.sendBtnText}>Send Invite</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.8}>
              <Text style={[styles.cancelBtnText, { color: theme.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

export const WorkoutInvites: FC<{ friends: FriendProfile[] }> = ({ friends }) => {
  const { theme } = useTheme();
  const { user } = useSupabaseAuth();
  const { data, isLoading } = useWorkoutInvites();
  const respond = useRespondToInvite();
  const [showNewInvite, setShowNewInvite] = useState(false);
  const [expandedInvite, setExpandedInvite] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewInviteId, setPreviewInviteId] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<Record<string, any> | null>(null);

  const friendNameMap = new Map(friends.map((f) => [f.id, f.name]));
  const received = data?.received ?? [];
  const sent = data?.sent ?? [];
  const pendingReceived = received.filter((r) => r.status === "pending");

  const fetchPreview = async (inviteId: string) => {
    setPreviewInviteId(inviteId);
    setPreviewLoading(true);
    try {
      await supabase.auth.refreshSession();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/combined-workout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          ...(SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY } : {}),
        },
        body: JSON.stringify({ invite_id: inviteId, preview: true }),
      });
      if (resp.ok) {
        const json = await resp.json();
        setPreviewData(json.combined_workout ?? null);
      }
    } catch {
      // ignore
    } finally {
      setPreviewLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.emptyContainer}>
        <ActivityIndicator size="small" color="#1C1C1E" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.headerRow}>
        <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>
          RUN TOGETHER
        </Text>
        <TouchableOpacity
          style={[styles.newBtn, { backgroundColor: "#1C1C1E" }]}
          onPress={() => setShowNewInvite(true)}
          disabled={friends.length === 0}
          activeOpacity={0.8}
        >
          <Ionicons name="send" size={14} color="#fff" />
          <Text style={styles.newBtnText}>New Invite</Text>
        </TouchableOpacity>
      </View>

      {friends.length === 0 && (
        <Text style={[styles.emptyText, { color: theme.textMuted }]}>
          Add friends first to send workout invites.
        </Text>
      )}

      {/* Pending received */}
      {pendingReceived.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.subTitle, { color: theme.textMuted }]}>Incoming</Text>
          {pendingReceived.map((invite) => (
            <GlassCard key={invite.id} style={styles.inviteCard}>
              <Text style={[styles.inviteTitle, { color: theme.textPrimary }]}>
                {friendNameMap.get(invite.from_user) ?? "Friend"} wants to run together
              </Text>
              <View style={styles.inviteMetaRow}>
                <Ionicons name="calendar-outline" size={12} color={theme.textMuted} />
                <Text style={[styles.inviteMeta, { color: theme.textMuted }]}>
                  {format(parseISO(invite.proposed_date), "EEEE, MMM d")} · {invite.invite_type}
                </Text>
              </View>
              {invite.message && (
                <Text style={[styles.inviteMessage, { color: theme.textSecondary }]}>
                  "{invite.message}"
                </Text>
              )}

              {/* Preview */}
              <TouchableOpacity
                style={styles.previewBtn}
                onPress={() => fetchPreview(invite.id)}
                disabled={previewLoading && previewInviteId === invite.id}
                activeOpacity={0.7}
              >
                {previewLoading && previewInviteId === invite.id ? (
                  <ActivityIndicator size="small" color={theme.textMuted} />
                ) : (
                  <>
                    <Ionicons name="barbell-outline" size={14} color={theme.textMuted} />
                    <Text style={[styles.previewBtnText, { color: theme.textMuted }]}>
                      See workout
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              {previewInviteId === invite.id && previewData && (
                <View style={[styles.previewBox, { borderTopColor: theme.cardBorder }]}>
                  <Text style={[styles.previewLabel, { color: theme.textPrimary }]}>
                    Kipcoachee's Plan
                  </Text>
                  <Text style={[styles.previewText, { color: theme.textMuted }]}>
                    {(previewData as any).summary}
                  </Text>
                  {(previewData as any).athlete_a && (
                    <Text style={[styles.previewText, { color: theme.textMuted }]}>
                      <Text style={{ fontWeight: "600", color: theme.textPrimary }}>
                        {(previewData as any).athlete_a.name}:{" "}
                      </Text>
                      {(previewData as any).athlete_a.adapted_workout ??
                        (previewData as any).athlete_a.workout}
                    </Text>
                  )}
                  {(previewData as any).athlete_b && (
                    <Text style={[styles.previewText, { color: theme.textMuted }]}>
                      <Text style={{ fontWeight: "600", color: theme.textPrimary }}>
                        {(previewData as any).athlete_b.name}:{" "}
                      </Text>
                      {(previewData as any).athlete_b.adapted_workout ??
                        (previewData as any).athlete_b.workout}
                    </Text>
                  )}
                </View>
              )}

              <View style={styles.inviteActions}>
                <TouchableOpacity
                  style={[styles.acceptBtn, { backgroundColor: theme.accentBlue }]}
                  onPress={() =>
                    respond.mutate(
                      { inviteId: invite.id, action: "accepted" },
                      {
                        onSuccess: () =>
                          Alert.alert(
                            "Accepted",
                            "Kipcoachee is creating your shared workout...",
                          ),
                      },
                    )
                  }
                  disabled={respond.isPending}
                  activeOpacity={0.8}
                >
                  <Ionicons name="checkmark" size={16} color="#fff" />
                  <Text style={styles.acceptBtnText}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.declineBtn, { borderColor: theme.cardBorder }]}
                  onPress={() =>
                    respond.mutate({ inviteId: invite.id, action: "declined" })
                  }
                  disabled={respond.isPending}
                  activeOpacity={0.8}
                >
                  <Ionicons name="close" size={16} color={theme.textMuted} />
                  <Text style={[styles.declineBtnText, { color: theme.textMuted }]}>
                    Decline
                  </Text>
                </TouchableOpacity>
              </View>
            </GlassCard>
          ))}
        </View>
      )}

      {/* History */}
      {(sent.length > 0 || received.filter((r) => r.status !== "pending").length > 0) && (
        <View style={styles.section}>
          <Text style={[styles.subTitle, { color: theme.textMuted }]}>History</Text>
          {[...sent, ...received.filter((r) => r.status !== "pending")]
            .sort(
              (a, b) =>
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
            )
            .slice(0, 10)
            .map((invite) => {
              const isSent = invite.from_user === user?.id;
              const otherName = friendNameMap.get(
                isSent ? invite.to_user : invite.from_user,
              ) ?? "Friend";
              const combined = invite.combined_workout as {
                summary?: string;
                athlete_a?: { name: string; workout: string };
                athlete_b?: { name: string; workout: string };
              } | null;

              return (
                <TouchableOpacity
                  key={invite.id}
                  style={[styles.historyRow, { backgroundColor: theme.surfaceElevated + "44" }]}
                  onPress={() =>
                    setExpandedInvite(expandedInvite === invite.id ? null : invite.id)
                  }
                  activeOpacity={0.8}
                >
                  <View style={styles.historyTop}>
                    <View>
                      <Text style={[styles.historyTitle, { color: theme.textPrimary }]}>
                        {isSent ? `You invited ${otherName}` : `${otherName} invited you`}
                      </Text>
                      <Text style={[styles.historyMeta, { color: theme.textMuted }]}>
                        {format(parseISO(invite.proposed_date), "MMM d")} ·{" "}
                        {invite.invite_type}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor:
                            invite.status === "accepted"
                              ? theme.accentGreen + "20"
                              : invite.status === "pending"
                                ? theme.cardBorder
                                : theme.surfaceElevated,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          {
                            color:
                              invite.status === "accepted"
                                ? theme.accentGreen
                                : theme.textMuted,
                          },
                        ]}
                      >
                        {invite.status}
                      </Text>
                    </View>
                  </View>
                  {expandedInvite === invite.id && combined?.summary && (
                    <View style={[styles.previewBox, { borderTopColor: theme.cardBorder }]}>
                      <Text style={[styles.previewLabel, { color: theme.textPrimary }]}>
                        Kipcoachee's Plan
                      </Text>
                      <Text style={[styles.previewText, { color: theme.textMuted }]}>
                        {combined.summary}
                      </Text>
                      {combined.athlete_a && (
                        <Text style={[styles.previewText, { color: theme.textMuted }]}>
                          <Text style={{ fontWeight: "600", color: theme.textPrimary }}>
                            {combined.athlete_a.name}:{" "}
                          </Text>
                          {combined.athlete_a.workout}
                        </Text>
                      )}
                      {combined.athlete_b && (
                        <Text style={[styles.previewText, { color: theme.textMuted }]}>
                          <Text style={{ fontWeight: "600", color: theme.textPrimary }}>
                            {combined.athlete_b.name}:{" "}
                          </Text>
                          {combined.athlete_b.workout}
                        </Text>
                      )}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
        </View>
      )}

      {received.length === 0 && sent.length === 0 && friends.length > 0 && (
        <View style={styles.emptyContainer}>
          <Ionicons name="people-outline" size={36} color={theme.textMuted + "55"} />
          <Text style={[styles.emptyText, { color: theme.textMuted }]}>
            No workout invites yet. Send one to train with a friend!
          </Text>
        </View>
      )}

      <NewInviteModal
        visible={showNewInvite}
        onClose={() => setShowNewInvite(false)}
        friends={friends}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { gap: 16 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: { fontSize: 11, fontWeight: "600", letterSpacing: 0.5 },
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  newBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  section: { gap: 8 },
  subTitle: { fontSize: 12 },
  inviteCard: { marginBottom: 0 },
  inviteTitle: { fontSize: 14, fontWeight: "600", marginBottom: 4 },
  inviteMetaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 },
  inviteMeta: { fontSize: 12 },
  inviteMessage: { fontSize: 13, fontStyle: "italic", marginBottom: 8 },
  previewBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6 },
  previewBtnText: { fontSize: 12 },
  previewBox: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  previewLabel: { fontSize: 12, fontWeight: "600" },
  previewText: { fontSize: 12, lineHeight: 18 },
  inviteActions: { flexDirection: "row", gap: 8, marginTop: 10 },
  acceptBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  acceptBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  declineBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  declineBtnText: { fontSize: 13 },
  historyRow: { borderRadius: 14, padding: 12, gap: 8 },
  historyTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  historyTitle: { fontSize: 13 },
  historyMeta: { fontSize: 11, marginTop: 2 },
  statusBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 10, fontWeight: "600", textTransform: "capitalize" },
  emptyContainer: { alignItems: "center", paddingVertical: 36, gap: 12 },
  emptyText: { fontSize: 13, textAlign: "center" },
  // New invite modal
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
  sheetTitle: { fontSize: 18, fontWeight: "600", marginBottom: 4 },
  sheetDesc: { fontSize: 13, marginBottom: 16, lineHeight: 20 },
  label: { fontSize: 11, fontWeight: "600", letterSpacing: 0.5, marginBottom: 6, marginTop: 12 },
  friendChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  friendChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  friendChipText: { fontSize: 13, fontWeight: "500" },
  typeRow: { flexDirection: "row", gap: 10 },
  typeCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 4,
  },
  typeName: { fontSize: 14, fontWeight: "600" },
  typeDesc: { fontSize: 11, lineHeight: 16 },
  messageInput: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: "top",
  },
  sendBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 999,
    paddingVertical: 12,
    marginTop: 20,
  },
  sendBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  cancelBtn: { alignItems: "center", marginTop: 12 },
  cancelBtnText: { fontSize: 13 },
});
