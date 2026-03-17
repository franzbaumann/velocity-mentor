import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { formatDistanceToNow } from "date-fns";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as Haptics from "expo-haptics";

import { useTheme } from "../../context/ThemeContext";
import {
  useUpdateActivity,
  type FeedActivity,
  type FeedPhotoEntry,
} from "../../hooks/useCommunity";
import { supabase } from "../../shared/supabase";
import { formatDistance, formatDuration } from "../../lib/format";

export function EditActivityModal({
  activity,
  visible,
  onClose,
  transparentBackdrop = false,
  showSummary = true,
}: {
  activity: FeedActivity | null;
  visible: boolean;
  onClose: () => void;
  transparentBackdrop?: boolean;
  showSummary?: boolean;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const updateActivity = useUpdateActivity();
  const [title, setTitle] = useState(activity?.name ?? "");
  const [photos, setPhotos] = useState<FeedPhotoEntry[]>(
    Array.isArray(activity?.photos) ? activity!.photos! : [],
  );
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = useCallback(
    (a: FeedActivity | null) => {
      setTitle(a?.name ?? "");
      setPhotos(Array.isArray(a?.photos) ? a!.photos! : []);
    },
    [],
  );

  const handlePickPhoto = useCallback(async () => {
    if (!activity) return;
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
        selectionLimit: 5,
      });
      if (picked.canceled || !picked.assets?.length) return;

      setUploading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert("Error", "You must be logged in.");
        return;
      }

      const newPhotos: FeedPhotoEntry[] = [];
      for (const asset of picked.assets) {
        const manip = await ImageManipulator.manipulateAsync(
          asset.uri,
          [{ resize: { width: 800 } }],
          { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
        );
        const fileResp = await fetch(manip.uri);
        const blob = await fileResp.blob();
        const fileName = `${user.id}/${activity.id}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from("activity-photos")
          .upload(fileName, blob, { contentType: "image/jpeg", upsert: false });
        if (uploadError) {
          Alert.alert("Upload failed", uploadError.message);
          continue;
        }
        const { data: pub } = supabase.storage.from("activity-photos").getPublicUrl(fileName);
        newPhotos.push({ url: pub.publicUrl, path: fileName });
      }
      setPhotos((prev) => [...prev, ...newPhotos]);
    } catch {
      Alert.alert("Error", "Could not pick photos.");
    } finally {
      setUploading(false);
    }
  }, [activity]);

  const handleRemovePhoto = useCallback((idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleSave = useCallback(async () => {
    if (!activity) return;
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await updateActivity.mutateAsync({
        activityId: activity.id,
        name: title.trim() || undefined,
        photos,
      });
      onClose();
    } catch (e: unknown) {
      Alert.alert("Save failed", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }, [activity, title, photos, updateActivity, onClose]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={transparentBackdrop}
      onRequestClose={onClose}
      onShow={() => reset(activity)}
    >
      <Pressable
        style={[
          styles.modalBackdrop,
          transparentBackdrop && styles.modalBackdropDimmed,
        ]}
        onPress={onClose}
      >
        <Pressable
          style={[
            styles.modalSheet,
            {
              backgroundColor: "#FFFFFF",
              paddingBottom: 16 + insets.bottom,
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.modalHandle} />
          {showSummary && activity && (
            <View style={styles.summaryCard}>
              <Text style={[styles.summaryName, { color: theme.textPrimary }]} numberOfLines={1}>
                {activity.name ?? activity.type}
              </Text>
              <Text style={[styles.summarySub, { color: theme.mutedForeground }]}>
                {formatDistanceToNow(new Date(activity.date), { addSuffix: true })} · {activity.type}
              </Text>
              <View style={styles.summaryStatsRow}>
                {activity.distance_km != null && activity.distance_km > 0 && (
                  <Text style={[styles.summaryStat, { color: theme.textPrimary }]}>
                    {formatDistance(activity.distance_km)}
                  </Text>
                )}
                {activity.avg_pace && (
                  <Text style={[styles.summaryStat, { color: theme.textSecondary }]}>
                    {activity.avg_pace}
                  </Text>
                )}
                {activity.avg_hr != null && (
                  <Text style={[styles.summaryStat, { color: theme.textSecondary }]}>
                    {activity.avg_hr} bpm
                  </Text>
                )}
                {activity.duration_seconds != null && (
                  <Text style={[styles.summaryStat, { color: theme.textSecondary }]}>
                    {formatDuration(activity.duration_seconds)}
                  </Text>
                )}
              </View>
            </View>
          )}

          <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Edit Activity</Text>

          <Text style={[styles.label, { color: theme.textSecondary }]}>Activity Name</Text>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: theme.secondary, color: theme.textPrimary, borderColor: theme.border },
            ]}
            value={title}
            onChangeText={setTitle}
            placeholder="Morning Run"
            placeholderTextColor={theme.mutedForeground}
            returnKeyType="done"
          />

          <Text style={[styles.label, { color: theme.textSecondary, marginTop: 16 }]}>Photos</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoStrip}>
            {photos.map((p, idx) => (
              <View key={p.path ?? p.url ?? idx} style={styles.photoThumbWrap}>
                <Image source={{ uri: p.url }} style={styles.photoThumb} />
                <TouchableOpacity
                  style={[styles.photoRemoveBtn, { backgroundColor: theme.destructive }]}
                  onPress={() => handleRemovePhoto(idx)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close" size={14} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity
              style={[styles.addPhotoBtn, { backgroundColor: theme.secondary, borderColor: theme.border }]}
              onPress={handlePickPhoto}
              disabled={uploading}
              activeOpacity={0.7}
            >
              {uploading ? (
                <ActivityIndicator size="small" color={theme.mutedForeground} />
              ) : (
                <>
                  <Ionicons name="camera-outline" size={22} color={theme.mutedForeground} />
                  <Text style={[styles.addPhotoText, { color: theme.mutedForeground }]}>Add</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: theme.border }]}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={[styles.cancelBtnText, { color: theme.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: theme.textPrimary }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: "transparent",
    justifyContent: "flex-end",
  },
  modalBackdropDimmed: {
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 12,
    maxHeight: "85%",
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#ccc",
    alignSelf: "center",
    marginBottom: 12,
  },
  modalTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12, marginTop: 8 },
  summaryCard: { marginBottom: 8 },
  summaryName: { fontSize: 18, fontWeight: "700" },
  summarySub: { fontSize: 12, marginTop: 2 },
  summaryStatsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  summaryStat: { fontSize: 12 },
  label: { fontSize: 12, fontWeight: "600", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  input: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: StyleSheet.hairlineWidth,
  },
  photoStrip: { gap: 10, paddingVertical: 8 },
  photoThumbWrap: { position: "relative" },
  photoThumb: { width: 80, height: 80, borderRadius: 12 },
  photoRemoveBtn: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  addPhotoBtn: {
    width: 80,
    height: 80,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    gap: 2,
  },
  addPhotoText: { fontSize: 11, fontWeight: "500" },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
  },
  cancelBtnText: { fontSize: 14, fontWeight: "600" },
  saveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  saveBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },
});
