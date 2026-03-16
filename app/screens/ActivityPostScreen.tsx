import { FC, useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { format, formatDistanceToNow } from "date-fns";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as Haptics from "expo-haptics";

import { GlassCard } from "../components/GlassCard";
import { useTheme } from "../context/ThemeContext";
import {
  useUpdateActivity,
  type FeedActivity,
  type FeedPhotoEntry,
} from "../hooks/useCommunity";
import { useSupabaseAuth } from "../SupabaseProvider";
import { supabase } from "../shared/supabase";
import { formatDistance, formatDuration } from "../lib/format";
import type { RootStackParamList } from "../navigation/RootNavigator";

export type ActivityPostParams = {
  activity: FeedActivity;
};

type PostRoute = RouteProp<{ ActivityPost: ActivityPostParams }, "ActivityPost">;

const { width: SCREEN_W } = Dimensions.get("window");
const PHOTO_H = SCREEN_W * 0.75;

const SUGGESTED_TAGS = [
  "#running", "#löpning", "#styrka", "#intervaller",
  "#fartlek", "#longrun", "#recovery", "#tempo",
  "#pb", "#morningrun", "#noexcuses",
];

export const ActivityPostScreen: FC = () => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<PostRoute>();
  const { user } = useSupabaseAuth();
  const updateActivity = useUpdateActivity();

  const activity = route.params.activity;

  const [title, setTitle] = useState(activity.name ?? "");
  const [caption, setCaption] = useState("");
  const [photos, setPhotos] = useState<FeedPhotoEntry[]>(
    Array.isArray(activity.photos) ? activity.photos : [],
  );
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [photoViewerIndex, setPhotoViewerIndex] = useState(0);

  const hasPhotos = photos.length > 0 && !!photos[0]?.url;

  const handlePickPhoto = useCallback(async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission required", "Allow photo library access to attach photos.");
        return;
      }
      const picked = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: true,
        quality: 0.8,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        selectionLimit: 10,
      });
      if (picked.canceled || !picked.assets?.length) return;

      setUploading(true);
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { Alert.alert("Error", "You must be logged in."); return; }

      const newPhotos: FeedPhotoEntry[] = [];
      for (const asset of picked.assets) {
        const manip = await ImageManipulator.manipulateAsync(
          asset.uri,
          [{ resize: { width: 1200 } }],
          { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
        );
        const fileResp = await fetch(manip.uri);
        const blob = await fileResp.blob();
        const fileName = `${authUser.id}/${activity.id}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from("activity-photos")
          .upload(fileName, blob, { contentType: "image/jpeg", upsert: false });
        if (uploadError) { Alert.alert("Upload failed", uploadError.message); continue; }
        const { data: pub } = supabase.storage.from("activity-photos").getPublicUrl(fileName);
        newPhotos.push({ url: pub.publicUrl, path: fileName });
      }
      setPhotos((prev) => [...prev, ...newPhotos]);
    } catch {
      Alert.alert("Error", "Could not pick photos.");
    } finally {
      setUploading(false);
    }
  }, [activity.id]);

  const handleRemovePhoto = useCallback((idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const addTag = useCallback((tag: string) => {
    setCaption((prev) => {
      const trimmed = prev.trimEnd();
      if (trimmed.includes(tag)) return prev;
      return trimmed.length > 0 ? `${trimmed} ${tag}` : tag;
    });
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const fullName = title.trim() || activity.name || activity.type;
      await updateActivity.mutateAsync({
        activityId: activity.id,
        name: fullName,
        photos,
        caption: caption.trim() || undefined,
      });
      navigation.goBack();
    } catch (e: unknown) {
      Alert.alert("Save failed", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }, [activity, title, caption, photos, updateActivity, navigation]);

  const dateLabel = useMemo(() => {
    try {
      const d = new Date(activity.date);
      return format(d, "EEEE, MMMM d 'at' HH:mm");
    } catch {
      return activity.date;
    }
  }, [activity.date]);

  const timeAgo = useMemo(() => {
    try { return formatDistanceToNow(new Date(activity.date), { addSuffix: true }); }
    catch { return ""; }
  }, [activity.date]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.appBackground }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 32 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Photo hero / gradient placeholder */}
        {hasPhotos ? (
          <View>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              style={{ height: PHOTO_H }}
            >
              {photos.map((p, idx) => (
                <TouchableOpacity
                  key={p.path ?? p.url ?? idx}
                  activeOpacity={0.95}
                  onPress={() => { setPhotoViewerIndex(idx); setPhotoViewerOpen(true); }}
                >
                  <Image
                    source={{ uri: p.url }}
                    style={{ width: SCREEN_W, height: PHOTO_H }}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              ))}
            </ScrollView>
            {photos.length > 1 && (
              <View style={st.dotsRow}>
                {photos.map((_, i) => (
                  <View key={i} style={[st.dot, i === photoViewerIndex && st.dotActive]} />
                ))}
              </View>
            )}
            {/* Remove / add on hero */}
            <View style={[st.photoActions, { top: insets.top + 8 }]}>
              <TouchableOpacity style={st.photoActionBtn} onPress={handlePickPhoto} activeOpacity={0.8}>
                <Ionicons name="add-circle" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity activeOpacity={0.85} onPress={handlePickPhoto}>
            <View style={[st.heroPlaceholder, { height: PHOTO_H * 0.6, paddingTop: insets.top + 20 }]}>
              {uploading ? (
                <ActivityIndicator size="large" color="#fff" />
              ) : (
                <>
                  <Ionicons name="camera-outline" size={48} color="rgba(255,255,255,0.6)" />
                  <Text style={st.heroPlaceholderText}>Tap to add photos</Text>
                </>
              )}
            </View>
          </TouchableOpacity>
        )}

        {/* Photo thumbnails strip (for removal) */}
        {hasPhotos && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={st.thumbStrip}
          >
            {photos.map((p, idx) => (
              <View key={p.path ?? p.url ?? idx} style={st.thumbWrap}>
                <Image source={{ uri: p.url }} style={st.thumb} />
                <TouchableOpacity
                  style={st.thumbRemove}
                  onPress={() => handleRemovePhoto(idx)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close-circle" size={20} color="#ef4444" />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={st.thumbAdd} onPress={handlePickPhoto} activeOpacity={0.7}>
              <Ionicons name="add" size={24} color={theme.mutedForeground} />
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* Activity info card */}
        <View style={{ paddingHorizontal: 16, marginTop: 16, gap: 16 }}>
          <GlassCard>
            {/* Title input */}
            <TextInput
              style={[st.titleInput, { color: theme.textPrimary }]}
              value={title}
              onChangeText={setTitle}
              placeholder="Name your activity..."
              placeholderTextColor={theme.mutedForeground}
              returnKeyType="done"
              multiline={false}
            />
            <Text style={[st.dateLine, { color: theme.mutedForeground }]}>
              {dateLabel} · {timeAgo}
            </Text>

            {/* Stats grid */}
            <View style={st.statsGrid}>
              {activity.distance_km != null && activity.distance_km > 0 && (
                <View style={[st.statBox, { backgroundColor: theme.secondary }]}>
                  <Text style={[st.statValue, { color: theme.textPrimary }]}>
                    {formatDistance(activity.distance_km)}
                  </Text>
                  <Text style={[st.statLabel, { color: theme.mutedForeground }]}>Distance</Text>
                </View>
              )}
              {activity.duration_seconds != null && (
                <View style={[st.statBox, { backgroundColor: theme.secondary }]}>
                  <Text style={[st.statValue, { color: theme.textPrimary }]}>
                    {formatDuration(activity.duration_seconds)}
                  </Text>
                  <Text style={[st.statLabel, { color: theme.mutedForeground }]}>Duration</Text>
                </View>
              )}
              {activity.avg_pace && (
                <View style={[st.statBox, { backgroundColor: theme.secondary }]}>
                  <Text style={[st.statValue, { color: theme.textPrimary }]}>
                    {activity.avg_pace}
                  </Text>
                  <Text style={[st.statLabel, { color: theme.mutedForeground }]}>Avg Pace</Text>
                </View>
              )}
              {activity.avg_hr != null && (
                <View style={[st.statBox, { backgroundColor: theme.secondary }]}>
                  <Text style={[st.statValue, { color: theme.textPrimary }]}>
                    {activity.avg_hr}
                  </Text>
                  <Text style={[st.statLabel, { color: theme.mutedForeground }]}>Avg HR</Text>
                </View>
              )}
            </View>
            <View style={st.typePillRow}>
              <View style={[st.typePill, { backgroundColor: theme.secondary }]}>
                <Text style={[st.typePillText, { color: theme.textSecondary }]}>
                  {activity.type}
                </Text>
              </View>
            </View>
          </GlassCard>

          {/* Caption */}
          <GlassCard>
            <Text style={[st.sectionLabel, { color: theme.textSecondary }]}>CAPTION</Text>
            <TextInput
              style={[st.captionInput, { color: theme.textPrimary, backgroundColor: theme.secondary, borderColor: theme.border }]}
              value={caption}
              onChangeText={setCaption}
              placeholder="How was your workout? Write something..."
              placeholderTextColor={theme.mutedForeground}
              multiline
              textAlignVertical="top"
              returnKeyType="default"
            />

            {/* Hashtag suggestions */}
            <Text style={[st.sectionLabel, { color: theme.textSecondary, marginTop: 12 }]}>HASHTAGS</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={st.tagRow}
            >
              {SUGGESTED_TAGS.map((tag) => {
                const active = caption.includes(tag);
                return (
                  <TouchableOpacity
                    key={tag}
                    style={[
                      st.tagChip,
                      {
                        backgroundColor: active ? "#1C1C1E" : theme.secondary,
                        borderColor: active ? "#1C1C1E" : theme.border,
                      },
                    ]}
                    onPress={() => addTag(tag)}
                    activeOpacity={0.7}
                  >
                    <Text style={[st.tagText, { color: active ? "#fff" : theme.textSecondary }]}>
                      {tag}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </GlassCard>

          {/* Save */}
          <TouchableOpacity
            style={st.saveBtn}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={st.saveBtnText}>Save & Share</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Photo viewer */}
      <Modal visible={photoViewerOpen} transparent animationType="fade" onRequestClose={() => setPhotoViewerOpen(false)}>
        <Pressable style={st.viewerBackdrop} onPress={() => setPhotoViewerOpen(false)}>
          {photos[photoViewerIndex] && (
            <Image
              source={{ uri: photos[photoViewerIndex].url }}
              style={st.viewerImage}
              resizeMode="contain"
            />
          )}
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const st = StyleSheet.create({
  heroPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#1C1C1E",
  },
  heroPlaceholderText: {
    fontSize: 15,
    fontWeight: "600",
    color: "rgba(255,255,255,0.6)",
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    position: "absolute",
    bottom: 12,
    left: 0,
    right: 0,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  dotActive: {
    backgroundColor: "#fff",
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  photoActions: {
    position: "absolute",
    right: 16,
    flexDirection: "row",
    gap: 8,
  },
  photoActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbStrip: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
  },
  thumbWrap: { position: "relative" },
  thumb: { width: 56, height: 56, borderRadius: 10 },
  thumbRemove: {
    position: "absolute",
    top: -6,
    right: -6,
  },
  thumbAdd: {
    width: 56,
    height: 56,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#ccc",
    alignItems: "center",
    justifyContent: "center",
  },
  titleInput: {
    fontSize: 20,
    fontWeight: "700",
    paddingVertical: 0,
    marginBottom: 4,
  },
  dateLine: { fontSize: 12, marginBottom: 12 },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  statBox: {
    flex: 1,
    minWidth: "45%",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  statValue: { fontSize: 16, fontWeight: "700" },
  statLabel: { fontSize: 10, fontWeight: "500", marginTop: 2, textTransform: "uppercase" },
  typePillRow: { flexDirection: "row" },
  typePill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  typePillText: { fontSize: 12, fontWeight: "500", textTransform: "capitalize" },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  captionInput: {
    minHeight: 80,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    lineHeight: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tagRow: { gap: 6 },
  tagChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tagText: { fontSize: 12, fontWeight: "500" },
  saveBtn: {
    backgroundColor: "#1C1C1E",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  saveBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
    alignItems: "center",
  },
  viewerImage: { width: "100%", height: "100%" },
});
