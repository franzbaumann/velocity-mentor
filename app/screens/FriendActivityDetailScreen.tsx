import { FC } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, Image } from "react-native";
import { RouteProp, useRoute, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { formatDistanceToNow, format } from "date-fns";
import { ScreenContainer } from "../components/ScreenContainer";
import { useTheme } from "../context/ThemeContext";
import { formatDistance, formatDuration } from "../lib/format";
import { isNonDistanceActivity } from "../lib/analytics";

export type FriendActivityParams = {
  activityId: string;
  name: string | null;
  type: string;
  date: string;
  friendName: string;
  distance_km: number | null;
  duration_seconds: number | null;
  avg_pace: string | null;
  avg_hr: number | null;
  photos?: { url: string; path?: string }[];
};

export type FriendActivityDetailRoute = RouteProp<
  { FriendActivityDetail: FriendActivityParams },
  "FriendActivityDetail"
>;

export const FriendActivityDetailScreen: FC = () => {
  const route = useRoute<FriendActivityDetailRoute>();
  const navigation = useNavigation();
  const { theme } = useTheme();
  const p = route.params;

  const nonDist = isNonDistanceActivity(p.type);
  const photos = Array.isArray(p.photos) ? p.photos.filter((ph) => !!ph.url) : [];
  const dateObj = p.date ? new Date(p.date) : null;

  return (
    <ScreenContainer scroll={false} contentContainerStyle={styles.screenWrap}>
      <ScrollView
        style={[styles.scroll, { backgroundColor: theme.appBackground }]}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.inner}>
          {/* Back */}
          <TouchableOpacity
            style={styles.backRow}
            onPress={() => navigation.goBack()}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-back" size={18} color={theme.textMuted} />
            <Text style={[styles.backText, { color: theme.textMuted }]}>Back</Text>
          </TouchableOpacity>

          {/* Hero card */}
          <View
            style={[
              styles.heroCard,
              { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder },
            ]}
          >
            <View style={styles.friendRow}>
              <View style={[styles.avatar, { backgroundColor: theme.surfaceElevated }]}>
                <Text style={[styles.avatarText, { color: theme.textPrimary }]}>
                  {p.friendName.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View>
                <Text style={[styles.friendName, { color: theme.textPrimary }]}>
                  {p.friendName}
                </Text>
                {dateObj && (
                  <Text style={[styles.dateSubtitle, { color: theme.textMuted }]}>
                    {formatDistanceToNow(dateObj, { addSuffix: true })}
                  </Text>
                )}
              </View>
            </View>

            <Text style={[styles.heroTitle, { color: theme.textPrimary }]}>
              {p.name ?? p.type}
            </Text>
            {dateObj && (
              <Text style={[styles.heroDate, { color: theme.textSecondary }]}>
                {format(dateObj, "EEEE, MMMM d, yyyy")}
              </Text>
            )}

            {/* Type pill */}
            <View style={styles.typeRow}>
              <View style={[styles.typePill, { backgroundColor: theme.surfaceElevated }]}>
                <Text style={[styles.typePillText, { color: theme.textSecondary }]}>
                  {p.type}
                </Text>
              </View>
            </View>

            {/* Stats grid */}
            <View style={styles.statsGrid}>
              {!nonDist && p.distance_km != null && p.distance_km > 0 && (
                <StatCard label="Distance" value={formatDistance(p.distance_km).replace(/\s*km$/i, "")} unit="km" theme={theme} />
              )}
              {p.duration_seconds != null && (
                <StatCard label="Duration" value={formatDuration(p.duration_seconds)} theme={theme} />
              )}
              {!nonDist && p.avg_pace != null && (
                <StatCard label="Pace" value={p.avg_pace} theme={theme} />
              )}
              {p.avg_hr != null && (
                <StatCard label="Avg HR" value={`${p.avg_hr}`} unit="bpm" theme={theme} />
              )}
            </View>
          </View>

          {/* Photos */}
          {photos.length > 0 && (
            <View
              style={[
                styles.photosCard,
                { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder },
              ]}
            >
              <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Photos</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.photoRow}
              >
                {photos.map((ph, i) => (
                  <View key={ph.path ?? ph.url ?? i} style={styles.photoWrapper}>
                    <Image
                      source={{ uri: ph.url }}
                      style={styles.photo}
                      resizeMode="cover"
                    />
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Info note */}
          <View style={styles.infoNote}>
            <Ionicons name="information-circle-outline" size={16} color={theme.textMuted} />
            <Text style={[styles.infoNoteText, { color: theme.textMuted }]}>
              Detailed charts and stream data are only available for your own activities.
            </Text>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
};

function StatCard({
  label,
  value,
  unit,
  theme,
}: {
  label: string;
  value: string;
  unit?: string;
  theme: Record<string, string>;
}) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Text style={[styles.statValue, { color: theme.textPrimary }]}>
        {value}
        {unit ? <Text style={[styles.statUnit, { color: theme.textSecondary }]}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screenWrap: { flex: 1, paddingHorizontal: 0, paddingTop: 0 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  inner: { maxWidth: 430, width: "100%", alignSelf: "center" },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  backText: { fontSize: 14, fontWeight: "500" },

  heroCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 16, fontWeight: "600" },
  friendName: { fontSize: 15, fontWeight: "600" },
  dateSubtitle: { fontSize: 11 },
  heroTitle: { fontSize: 20, fontWeight: "700", marginBottom: 2 },
  heroDate: { fontSize: 12, marginBottom: 8 },
  typeRow: { flexDirection: "row", marginBottom: 12 },
  typePill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  typePillText: { fontSize: 11, fontWeight: "500", textTransform: "capitalize" },

  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 12,
    rowGap: 12,
  },
  statCard: {
    flexBasis: "47%",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: "#f3f4f6",
    alignItems: "flex-start",
  },
  statLabel: { fontSize: 10, marginBottom: 2 },
  statValue: { fontSize: 22, fontWeight: "700" },
  statUnit: { fontSize: 13, fontWeight: "400" },

  photosCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: { fontSize: 12, fontWeight: "600", marginBottom: 8 },
  photoRow: { columnGap: 8 },
  photoWrapper: {
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#00000010",
  },
  photo: { width: 200, height: 160, borderRadius: 12 },

  infoNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#f3f4f620",
  },
  infoNoteText: { fontSize: 12, lineHeight: 17, flex: 1 },
});
