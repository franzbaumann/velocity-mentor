import { FC, useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { format, addMonths } from "date-fns";
import { useTheme } from "../context/ThemeContext";
import { ScreenContainer } from "../components/ScreenContainer";
import { useSeasons } from "../hooks/useSeasons";
import { supabase } from "../shared/supabase";
import type { PlanStackParamList } from "../navigation/RootNavigator";
import {
  SEASON_TYPES,
  PRIMARY_DISTANCES,
  suggestedSeasonName,
  type SeasonTypeId,
} from "../constants/seasonOptions";
import type { SeasonRace } from "../hooks/useSeasons";
import { spacing } from "../theme/theme";

type WizardRoute = RouteProp<PlanStackParamList, "SeasonWizard">;

const STEPS = 4;
const PRIORITY_OPTIONS: { id: "A" | "B" | "C"; label: string; color: string }[] = [
  { id: "A", label: "A", color: "#eab308" },
  { id: "B", label: "B", color: "#f97316" },
  { id: "C", label: "C", color: "#6b7280" },
];

type RaceDraft = {
  name: string;
  race_date: Date;
  distance: string;
  venue: string;
  priority: "A" | "B" | "C";
  goal_time: string;
};

const emptyRaceDraft = (): RaceDraft => ({
  name: "",
  race_date: new Date(),
  distance: "",
  venue: "",
  priority: "B",
  goal_time: "",
});

export const SeasonWizardScreen: FC = () => {
  const { theme, colors } = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<WizardRoute>();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(1);
  const [seasonType, setSeasonType] = useState<SeasonTypeId | null>(null);
  const [seasonName, setSeasonName] = useState("");
  const [startDate, setStartDate] = useState(() => new Date());
  const [endDate, setEndDate] = useState(() => addMonths(new Date(), 3));
  const [primaryDistance, setPrimaryDistance] = useState("");
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [races, setRaces] = useState<RaceDraft[]>([]);
  const [raceForm, setRaceForm] = useState<RaceDraft>(emptyRaceDraft());
  const [showRaceDatePicker, setShowRaceDatePicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const suggestedName = useMemo(() => {
    if (!seasonType) return "";
    return suggestedSeasonName(seasonType, new Date().getFullYear());
  }, [seasonType]);

  const displayName = seasonName.trim() || suggestedName;

  const canNextStep1 = !!seasonType;
  const canNextStep2 = !!displayName && primaryDistance.length > 0;

  const handleNext = useCallback(() => {
    if (step === 1 && !canNextStep1) return;
    if (step === 2 && !canNextStep2) return;
    if (step === 1 && seasonType) setSeasonName(suggestedSeasonName(seasonType, new Date().getFullYear()));
    if (step < STEPS) setStep((s) => s + 1);
  }, [step, canNextStep1, canNextStep2, seasonType]);

  const handleBack = useCallback(() => {
    if (step > 1) setStep((s) => s - 1);
    else navigation.goBack();
  }, [step, navigation]);

  const addRace = useCallback(() => {
    if (!raceForm.name.trim()) return;
    setRaces((prev) => [...prev, { ...raceForm }]);
    setRaceForm(emptyRaceDraft());
  }, [raceForm]);

  const removeRace = useCallback((index: number) => {
    setRaces((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const submitSeason = useCallback(async () => {
    if (!seasonType || !displayName || !primaryDistance) return;
    setIsSubmitting(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      const userId = user?.user?.id;
      if (!userId) throw new Error("Not signed in");

      const { data: season, error: seasonErr } = await supabase
        .from("seasons")
        .insert({
          user_id: userId,
          name: displayName,
          season_type: seasonType,
          start_date: format(startDate, "yyyy-MM-dd"),
          end_date: format(endDate, "yyyy-MM-dd"),
          primary_distance: primaryDistance,
        })
        .select()
        .single();

      if (seasonErr || !season) throw seasonErr ?? new Error("Create season failed");

      for (const r of races) {
        await supabase.from("season_races").insert({
          season_id: season.id,
          user_id: userId,
          name: r.name.trim(),
          race_date: format(r.race_date, "yyyy-MM-dd"),
          distance: r.distance.trim() || null,
          venue: r.venue.trim() || null,
          priority: r.priority,
          goal_time: r.goal_time.trim() || null,
        });
      }

      queryClient.invalidateQueries({ queryKey: ["seasons"] });
      Toast.show({ type: "success", text1: "Season created!" });
      navigation.replace("SeasonView", { seasonId: season.id });
    } catch (e) {
      console.error(e);
      Toast.show({ type: "error", text1: "Could not create season" });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    seasonType,
    displayName,
    primaryDistance,
    startDate,
    endDate,
    races,
    navigation,
  ]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        progressRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          marginBottom: 24,
        },
        progressDot: {
          width: 28,
          height: 28,
          borderRadius: 14,
          borderWidth: 2,
          alignItems: "center",
          justifyContent: "center",
        },
        progressDotActive: { borderColor: colors.primary, backgroundColor: colors.primary + "20" },
        progressDotDone: { borderColor: colors.primary, backgroundColor: colors.primary },
        progressDotInactive: { borderColor: colors.mutedForeground + "40", backgroundColor: "transparent" },
        stepTitle: {
          fontSize: 22,
          fontWeight: "700",
          color: theme.textPrimary,
          marginBottom: 8,
        },
        stepSubtitle: {
          fontSize: 14,
          color: theme.textMuted,
          marginBottom: 20,
        },
        cardGrid: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 24,
        },
        card: {
          width: "47%",
          minHeight: 100,
          padding: 16,
          borderRadius: 12,
          borderWidth: 2,
          borderColor: colors.border,
          backgroundColor: theme.cardBackground,
        },
        cardFull: { width: "100%" },
        cardSelected: {
          borderColor: colors.primary,
          backgroundColor: colors.primary + "12",
        },
        cardEmoji: { fontSize: 24, marginBottom: 6 },
        cardTitle: { fontSize: 15, fontWeight: "600", color: theme.textPrimary, marginBottom: 4 },
        cardDesc: { fontSize: 12, color: theme.textMuted, lineHeight: 16 },
        label: {
          fontSize: 11,
          fontWeight: "600",
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: theme.textMuted,
          marginBottom: 6,
        },
        input: {
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          borderRadius: 10,
          paddingHorizontal: 14,
          paddingVertical: 12,
          fontSize: 16,
          color: theme.textPrimary,
          backgroundColor: theme.cardBackground,
          minHeight: 48,
        },
        row: { flexDirection: "row", gap: 12, marginBottom: 16 },
        half: { flex: 1 },
        navRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          marginTop: 24,
          paddingBottom: 32,
        },
        backBtn: { paddingVertical: 14, paddingHorizontal: 8, minHeight: 48, justifyContent: "center" },
        backBtnText: { fontSize: 16, color: theme.textMuted, fontWeight: "500" },
        nextBtn: {
          paddingVertical: 14,
          paddingHorizontal: 24,
          borderRadius: 12,
          backgroundColor: colors.primary,
          minHeight: 48,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        },
        nextBtnDisabled: { opacity: 0.5 },
        nextBtnText: { fontSize: 16, fontWeight: "600", color: colors.primaryForeground },
        priorityRow: {
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          marginBottom: 8,
        },
        priorityCircle: {
          width: 40,
          height: 40,
          borderRadius: 20,
          borderWidth: 2,
          alignItems: "center",
          justifyContent: "center",
        },
        priorityHint: { fontSize: 11, color: theme.textMuted, marginBottom: 16 },
        addRaceBtn: {
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: colors.primary,
          alignItems: "center",
          justifyContent: "center",
        },
        raceCard: {
          padding: 14,
          borderRadius: 12,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          backgroundColor: theme.cardBackground,
          marginBottom: 10,
        },
        raceCardHeader: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 4,
        },
        raceCardName: { fontSize: 15, fontWeight: "600", color: theme.textPrimary },
        raceCardMeta: { fontSize: 12, color: theme.textMuted },
        summaryCard: {
          padding: 20,
          borderRadius: 12,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          backgroundColor: theme.cardBackground,
          marginBottom: 24,
        },
        summaryTitle: { fontSize: 17, fontWeight: "700", color: theme.textPrimary, marginBottom: 8 },
        summaryLine: { fontSize: 14, color: theme.textMuted, marginBottom: 4 },
        createBtn: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          paddingVertical: 14,
          paddingHorizontal: 24,
          borderRadius: 12,
          backgroundColor: colors.primary,
          minHeight: 48,
          marginTop: 8,
        },
      }),
    [theme, colors],
  );

  return (
    <ScreenContainer scroll={false}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={80}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: spacing.screenHorizontal, paddingTop: spacing.screenTop, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Progress */}
          <View style={styles.progressRow}>
            {[1, 2, 3, 4].map((s) => {
              const active = s === step;
              const done = s < step;
              return (
                <View
                  key={s}
                  style={[
                    styles.progressDot,
                    active && styles.progressDotActive,
                    done && styles.progressDotDone,
                    !active && !done && styles.progressDotInactive,
                  ]}
                >
                  {done ? (
                    <Ionicons name="checkmark" size={16} color={colors.primaryForeground} />
                  ) : (
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "600",
                        color: active ? colors.primary : theme.textMuted,
                      }}
                    >
                      {s}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>

          {/* Step 1 */}
          {step === 1 && (
            <>
              <Text style={styles.stepTitle}>What kind of season?</Text>
              <Text style={styles.stepSubtitle}>
                Choose the type that best fits your race calendar.
              </Text>
              <View style={styles.cardGrid}>
                {SEASON_TYPES.map((t) => {
                  const isSelected = seasonType === t.id;
                  const isFull = t.id === "mixed";
                  return (
                    <TouchableOpacity
                      key={t.id}
                      activeOpacity={0.8}
                      style={[
                        styles.card,
                        isFull && styles.cardFull,
                        isSelected && styles.cardSelected,
                      ]}
                      onPress={() => setSeasonType(t.id)}
                    >
                      <Text style={styles.cardEmoji}>{t.emoji}</Text>
                      <Text style={styles.cardTitle}>{t.title}</Text>
                      <Text style={styles.cardDesc}>{t.description}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <>
              <Text style={styles.stepTitle}>Season details</Text>
              <Text style={styles.stepSubtitle}>
                Name your season, set the date range and primary distance.
              </Text>
              <Text style={styles.label}>SEASON NAME</Text>
              <TextInput
                style={[styles.input, { marginBottom: 16 }]}
                value={seasonName || suggestedName}
                onChangeText={setSeasonName}
                placeholder={suggestedName}
                placeholderTextColor={theme.textMuted}
              />
              <View style={styles.row}>
                <View style={styles.half}>
                  <Text style={styles.label}>START DATE</Text>
                  <TouchableOpacity
                    style={styles.input}
                    onPress={() => setShowStartPicker(true)}
                  >
                    <Text style={{ color: theme.textPrimary }}>{format(startDate, "MMM d, yyyy")}</Text>
                  </TouchableOpacity>
                  {showStartPicker && (
                    <DateTimePicker
                      value={startDate}
                      mode="date"
                      onChange={(_, d) => {
                        setShowStartPicker(Platform.OS === "ios");
                        if (d) setStartDate(d);
                      }}
                    />
                  )}
                </View>
                <View style={styles.half}>
                  <Text style={styles.label}>END DATE</Text>
                  <TouchableOpacity
                    style={styles.input}
                    onPress={() => setShowEndPicker(true)}
                  >
                    <Text style={{ color: theme.textPrimary }}>{format(endDate, "MMM d, yyyy")}</Text>
                  </TouchableOpacity>
                  {showEndPicker && (
                    <DateTimePicker
                      value={endDate}
                      mode="date"
                      onChange={(_, d) => {
                        setShowEndPicker(Platform.OS === "ios");
                        if (d) setEndDate(d);
                      }}
                    />
                  )}
                </View>
              </View>
              <Text style={styles.label}>PRIMARY DISTANCE</Text>
              <View style={[styles.input, { paddingHorizontal: 0 }]}>
                <Picker
                  selectedValue={primaryDistance}
                  onValueChange={setPrimaryDistance}
                  style={{ color: theme.textPrimary }}
                  prompt="Primary distance"
                >
                  <Picker.Item label="Select..." value="" color={theme.textMuted} />
                  {PRIMARY_DISTANCES.map((d) => (
                    <Picker.Item key={d} label={d} value={d} color={theme.textPrimary} />
                  ))}
                </Picker>
              </View>
            </>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <>
              <Text style={styles.stepTitle}>Add your races</Text>
              <Text style={[styles.stepSubtitle, { marginBottom: 16 }]}>
                Add as many or as few as you know. You can always add more later.
              </Text>
              <Text style={styles.label}>RACE NAME</Text>
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, styles.half]}
                  value={raceForm.name}
                  onChangeText={(t) => setRaceForm((f) => ({ ...f, name: t }))}
                  placeholder="Race name"
                  placeholderTextColor={theme.textMuted}
                />
                <TouchableOpacity
                  style={[styles.input, styles.half, { justifyContent: "center" }]}
                  onPress={() => setShowRaceDatePicker(true)}
                >
                  <Text style={{ color: theme.textPrimary }}>
                    {format(raceForm.race_date, "MMM d, yyyy")}
                  </Text>
                </TouchableOpacity>
                {showRaceDatePicker && (
                  <DateTimePicker
                    value={raceForm.race_date}
                    mode="date"
                    onChange={(_, d) => {
                      setShowRaceDatePicker(Platform.OS === "ios");
                      if (d) setRaceForm((f) => ({ ...f, race_date: d }));
                    }}
                  />
                )}
              </View>
              <Text style={styles.label}>DISTANCE</Text>
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, styles.half]}
                  value={raceForm.distance}
                  onChangeText={(t) => setRaceForm((f) => ({ ...f, distance: t }))}
                  placeholder="e.g. 1500m"
                  placeholderTextColor={theme.textMuted}
                />
                <TextInput
                  style={[styles.input, styles.half]}
                  value={raceForm.venue}
                  onChangeText={(t) => setRaceForm((f) => ({ ...f, venue: t }))}
                  placeholder="Venue"
                  placeholderTextColor={theme.textMuted}
                />
              </View>
              <Text style={styles.label}>PRIORITY</Text>
              <View style={styles.priorityRow}>
                {PRIORITY_OPTIONS.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => setRaceForm((f) => ({ ...f, priority: p.id }))}
                    style={[
                      styles.priorityCircle,
                      {
                        borderColor: raceForm.priority === p.id ? p.color : colors.border,
                        backgroundColor: raceForm.priority === p.id ? p.color + "30" : "transparent",
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontWeight: "700",
                        fontSize: 16,
                        color: raceForm.priority === p.id ? theme.textPrimary : theme.textMuted,
                      }}
                    >
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  value={raceForm.goal_time}
                  onChangeText={(t) => setRaceForm((f) => ({ ...f, goal_time: t }))}
                  placeholder="Goal time"
                  placeholderTextColor={theme.textMuted}
                />
                <TouchableOpacity onPress={addRace} style={styles.addRaceBtn}>
                  <Ionicons name="add" size={24} color={colors.primaryForeground} />
                </TouchableOpacity>
              </View>
              <Text style={styles.priorityHint}>
                A = Full taper, peak performance · B = Short taper, race fit · C = Training race, no taper
              </Text>
              {races.map((r, i) => (
                <View key={i} style={styles.raceCard}>
                  <View style={styles.raceCardHeader}>
                    <Text style={styles.raceCardName}>{r.name}</Text>
                    <View
                      style={{
                        backgroundColor:
                          r.priority === "A" ? "#eab30830" : r.priority === "B" ? "#f9731630" : "#6b728030",
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 999,
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: "600" }}>{r.priority}</Text>
                    </View>
                  </View>
                  <Text style={styles.raceCardMeta}>
                    {format(r.race_date, "MMM d, yyyy")}
                    {r.distance ? ` · ${r.distance}` : ""}
                  </Text>
                </View>
              ))}
            </>
          )}

          {/* Step 4 */}
          {step === 4 && (
            <>
              <Text style={styles.stepTitle}>Review your season</Text>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>{displayName}</Text>
                <Text style={styles.summaryLine}>
                  {format(startDate, "MMM d, yyyy")} → {format(endDate, "MMM d, yyyy")} · {primaryDistance}
                </Text>
                <Text style={styles.summaryLine}>
                  {races.length} races: {races.filter((r) => r.priority === "A").length} A ·{" "}
                  {races.filter((r) => r.priority === "B").length} B ·{" "}
                  {races.filter((r) => r.priority === "C").length} C
                </Text>
              </View>
              <TouchableOpacity
                onPress={submitSeason}
                disabled={isSubmitting}
                style={[styles.createBtn, isSubmitting && { opacity: 0.7 }]}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                ) : (
                  <>
                    <Ionicons name="trophy" size={20} color={colors.primaryForeground} />
                    <Text style={[styles.nextBtnText]}>Create season</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}

          {/* Nav */}
          {step < 4 && (
            <View style={styles.navRow}>
              <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
                <Text style={styles.backBtnText}>&lt; Back</Text>
              </TouchableOpacity>
              {step === 3 ? (
                <TouchableOpacity onPress={handleNext} style={styles.nextBtn}>
                  <Text style={styles.nextBtnText}>Review</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.primaryForeground} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={handleNext}
                  style={[styles.nextBtn, step === 1 && !canNextStep1 && styles.nextBtnDisabled]}
                  disabled={step === 1 && !canNextStep1}
                >
                  <Text style={styles.nextBtnText}>Next</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.primaryForeground} />
                </TouchableOpacity>
              )}
            </View>
          )}
          {step === 4 && (
            <TouchableOpacity onPress={handleBack} style={[styles.backBtn, { marginTop: 16 }]}>
              <Text style={styles.backBtnText}>&lt; Back</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
};
