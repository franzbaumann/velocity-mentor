import { FC, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../components/ScreenContainer";
import { GlassCard } from "../components/GlassCard";
import { useTheme } from "../context/ThemeContext";
import type { PlanStackParamList } from "../navigation/RootNavigator";
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from "../shared/supabase";

type ExperienceLevel =
  | "just_getting_started"
  | "building_runner"
  | "experienced_runner"
  | "competitive_runner";

type MainGoal =
  | "faster_race"
  | "first_marathon"
  | "aerobic_base"
  | "return_from_injury"
  | "shorter_distances"
  | "stay_consistent";

type RecentRace =
  | "none"
  | "5k"
  | "10k"
  | "half"
  | "marathon";

type LongestDay = 45 | 60 | 90 | 120;

type IntakeAnswers = {
  experience?: ExperienceLevel;
  main_goal?: MainGoal;
  weekly_days?: 3 | 4 | 5 | 6 | 7;
  longest_day_minutes?: LongestDay;
  weekly_volume_km?: number;
  recent_race?: RecentRace;
  injuries?: string[];
};

const INJURY_OPTIONS = [
  "Achilles tendon",
  "Shin splints",
  "Runner's knee",
  "Hip flexor",
  "Plantar fasciitis",
  "IT band",
  "Stress fracture history",
  "Back pain",
] as const;

type IntakeStep = 0 | 1 | 2 | 3 | 4 | 5;

const COACH_GENERATE_PLAN_URL = `${SUPABASE_URL}/functions/v1/coach-generate-plan`;

export const PlanOnboardingScreen: FC = () => {
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<PlanStackParamList>>();
  const [loadingIntake, setLoadingIntake] = useState(true);
  const [step, setStep] = useState<IntakeStep>(0);
  const [answers, setAnswers] = useState<IntakeAnswers>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem("paceiq_intake")
      .then((raw) => {
        if (cancelled) return;
        if (!raw) {
          setLoadingIntake(false);
          return;
        }
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object") {
            navigation.replace("PlanMain");
            return;
          }
        } catch (e) {
          console.warn("[PlanOnboarding] Failed to parse intake from storage", e);
        }
        setLoadingIntake(false);
      })
      .catch((e) => {
        console.warn("[PlanOnboarding] Failed to read intake from storage", e);
        setLoadingIntake(false);
      });
    return () => {
      cancelled = true;
    };
  }, [navigation]);

  const totalSteps: IntakeStep[] = [0, 1, 2, 3, 4, 5];

  const styles = useMemo(
    () =>
      StyleSheet.create({
        content: { flexGrow: 1, paddingTop: 80, paddingBottom: 40, justifyContent: "space-between" },
        title: { fontSize: 26, fontWeight: "600", color: colors.foreground, textAlign: "center" },
        subtitle: { fontSize: 15, color: colors.mutedForeground, textAlign: "center", marginTop: 10 },
        dotsRow: { flexDirection: "row", justifyContent: "center", gap: 6, marginBottom: 16 },
        dot: {
          width: 8,
          height: 8,
          borderRadius: 999,
          backgroundColor: colors.muted,
        },
        dotActive: {
          backgroundColor: colors.primary,
          width: 18,
        },
        optionsColumn: { gap: 10 },
        cardButton: {
          borderRadius: 16,
          paddingVertical: 14,
          paddingHorizontal: 16,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          backgroundColor: colors.card,
        },
        cardButtonSelected: {
          borderColor: colors.primary,
          backgroundColor: colors.primary + "10",
        },
        cardTitle: { fontSize: 15, fontWeight: "500", color: colors.foreground },
        cardSubtitle: { fontSize: 13, color: colors.mutedForeground, marginTop: 4 },
        bottomBar: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 8,
        },
        navButtonSecondary: {
          paddingVertical: 10,
          paddingHorizontal: 18,
          borderRadius: 999,
        },
        navButtonSecondaryText: {
          fontSize: 14,
          color: colors.mutedForeground,
        },
        navButtonPrimary: {
          paddingVertical: 12,
          paddingHorizontal: 22,
          borderRadius: 999,
          backgroundColor: colors.primary,
        },
        navButtonPrimaryDisabled: { opacity: 0.5 },
        navButtonPrimaryText: {
          fontSize: 14,
          fontWeight: "600",
          color: colors.primaryForeground,
        },
        center: { flex: 1, alignItems: "center", justifyContent: "center" },
        smallMuted: { fontSize: 13, color: colors.mutedForeground, textAlign: "center", marginTop: 8 },
        horizontalRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
        pill: {
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderRadius: 999,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        },
        pillSelected: {
          borderColor: colors.primary,
          backgroundColor: colors.primary + "10",
        },
        pillText: { fontSize: 13, color: colors.foreground },
        smallLabel: { fontSize: 13, color: colors.mutedForeground, marginTop: 12, marginBottom: 4 },
      }),
    [colors],
  );

  const toggleInjury = (label: (typeof INJURY_OPTIONS)[number]) => {
    setAnswers((prev) => {
      const current = prev.injuries ?? [];
      const exists = current.includes(label);
      const next = exists ? current.filter((i) => i !== label) : [...current, label];
      return { ...prev, injuries: next };
    });
  };

  const canContinue = (() => {
    switch (step) {
      case 0:
        return true;
      case 1:
        return !!answers.experience;
      case 2:
        return !!answers.main_goal;
      case 3:
        return !!answers.weekly_days && !!answers.longest_day_minutes;
      case 4:
        return typeof answers.weekly_volume_km === "number" && !!answers.recent_race;
      case 5:
        return true;
      default:
        return false;
    }
  })();

  const handleNext = async () => {
    if (!canContinue) return;
    if (step < 5) {
      setStep((s) => ((s + 1) as IntakeStep));
      return;
    }
    await handleSubmit();
  };

  const handleBack = () => {
    if (step === 0) {
      navigation.getParent()?.navigate("Dashboard");
      return;
    }
    setStep((s) => ((s - 1) as IntakeStep));
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    const payload: IntakeAnswers = {
      ...answers,
      weekly_volume_km:
        typeof answers.weekly_volume_km === "number"
          ? Math.max(0, Math.min(200, Math.round(answers.weekly_volume_km)))
          : undefined,
    };

    try {
      await AsyncStorage.setItem("paceiq_intake", JSON.stringify(payload));
    } catch (e) {
      console.warn("[PlanOnboarding] Failed to persist intake to storage", e);
    }

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? null;

      if (!token) {
        Alert.alert("Sign in required", "Please sign in again to build your plan.");
        navigation.replace("PlanMain");
        return;
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY } : {}),
        Authorization: `Bearer ${token}`,
      };

      const planRes = await fetch(COACH_GENERATE_PLAN_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({
          intakeAnswers: payload,
          conversationContext: [],
        }),
      });
      const planData = await planRes.json().catch(() => ({}));
      if (!planRes.ok) {
        const msg =
          planData?.error ?? `Failed to generate plan (status ${planRes.status})`;
        console.warn("[PlanOnboarding] generate-plan error", planRes.status, planData);
        setSubmitError(msg);
        Alert.alert("Plan error", msg);
        return;
      }
      if (planData?.error) {
        const msg = planData.error as string;
        console.warn("[PlanOnboarding] generate-plan app error", msg);
        setSubmitError(msg);
        Alert.alert("Plan error", msg);
        return;
      }

      navigation.replace("PlanMain");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to reach plan builder";
      console.warn("[PlanOnboarding] submit error", e);
      setSubmitError(msg);
      Alert.alert("Network error", msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingIntake) {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={80}
      >
        <ScreenContainer scroll={false}>
          <View style={styles.center}>
            <Text style={styles.smallMuted}>Preparing your plan builder…</Text>
          </View>
        </ScreenContainer>
      </KeyboardAvoidingView>
    );
  }

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <>
            <View style={styles.center}>
              <Text style={styles.title}>Hey, I'm Kipcoachee.</Text>
              <Text style={styles.subtitle}>
                Your AI running coach. Let&apos;s build something together.
              </Text>
            </View>
          </>
        );
      case 1:
        return (
          <>
            <View>
              <Text style={styles.title}>How experienced are you as a runner?</Text>
              <Text style={styles.subtitle}>Helps Kipcoachee set the right starting point.</Text>
            </View>
            <GlassCard>
              <View style={styles.optionsColumn}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[
                    styles.cardButton,
                    answers.experience === "just_getting_started" && styles.cardButtonSelected,
                  ]}
                  onPress={() => setAnswers((prev) => ({ ...prev, experience: "just_getting_started" }))}
                >
                  <Text style={styles.cardTitle}>Just getting started</Text>
                  <Text style={styles.cardSubtitle}>Running less than a year.</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[
                    styles.cardButton,
                    answers.experience === "building_runner" && styles.cardButtonSelected,
                  ]}
                  onPress={() => setAnswers((prev) => ({ ...prev, experience: "building_runner" }))}
                >
                  <Text style={styles.cardTitle}>Building runner</Text>
                  <Text style={styles.cardSubtitle}>1–3 years, getting serious.</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[
                    styles.cardButton,
                    answers.experience === "experienced_runner" && styles.cardButtonSelected,
                  ]}
                  onPress={() => setAnswers((prev) => ({ ...prev, experience: "experienced_runner" }))}
                >
                  <Text style={styles.cardTitle}>Experienced runner</Text>
                  <Text style={styles.cardSubtitle}>3–5 years, done races.</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[
                    styles.cardButton,
                    answers.experience === "competitive_runner" && styles.cardButtonSelected,
                  ]}
                  onPress={() => setAnswers((prev) => ({ ...prev, experience: "competitive_runner" }))}
                >
                  <Text style={styles.cardTitle}>Competitive runner</Text>
                  <Text style={styles.cardSubtitle}>5+ years, racing regularly.</Text>
                </TouchableOpacity>
              </View>
            </GlassCard>
          </>
        );
      case 2:
        return (
          <>
            <View>
              <Text style={styles.title}>What's the main thing you want to achieve?</Text>
              <Text style={styles.subtitle}>Pick the focus for your upcoming block.</Text>
            </View>
            <GlassCard>
              <View style={styles.optionsColumn}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[
                    styles.cardButton,
                    answers.main_goal === "faster_race" && styles.cardButtonSelected,
                  ]}
                  onPress={() => setAnswers((prev) => ({ ...prev, main_goal: "faster_race" }))}
                >
                  <Text style={styles.cardTitle}>Run a faster race</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[
                    styles.cardButton,
                    answers.main_goal === "first_marathon" && styles.cardButtonSelected,
                  ]}
                  onPress={() => setAnswers((prev) => ({ ...prev, main_goal: "first_marathon" }))}
                >
                  <Text style={styles.cardTitle}>Finish my first marathon</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[
                    styles.cardButton,
                    answers.main_goal === "aerobic_base" && styles.cardButtonSelected,
                  ]}
                  onPress={() => setAnswers((prev) => ({ ...prev, main_goal: "aerobic_base" }))}
                >
                  <Text style={styles.cardTitle}>Build my aerobic base</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[
                    styles.cardButton,
                    answers.main_goal === "return_from_injury" && styles.cardButtonSelected,
                  ]}
                  onPress={() => setAnswers((prev) => ({ ...prev, main_goal: "return_from_injury" }))}
                >
                  <Text style={styles.cardTitle}>Return from injury</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[
                    styles.cardButton,
                    answers.main_goal === "shorter_distances" && styles.cardButtonSelected,
                  ]}
                  onPress={() => setAnswers((prev) => ({ ...prev, main_goal: "shorter_distances" }))}
                >
                  <Text style={styles.cardTitle}>Get faster at shorter distances</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[
                    styles.cardButton,
                    answers.main_goal === "stay_consistent" && styles.cardButtonSelected,
                  ]}
                  onPress={() => setAnswers((prev) => ({ ...prev, main_goal: "stay_consistent" }))}
                >
                  <Text style={styles.cardTitle}>Stay consistent</Text>
                </TouchableOpacity>
              </View>
            </GlassCard>
          </>
        );
      case 3:
        return (
          <>
            <View>
              <Text style={styles.title}>How many days a week can you realistically train?</Text>
              <Text style={styles.subtitle}>We'll respect your schedule and build around your life.</Text>
            </View>
            <GlassCard>
              <View>
                <Text style={styles.smallLabel}>Training days per week</Text>
                <View style={styles.horizontalRow}>
                  {[3, 4, 5, 6, 7].map((d) => (
                    <TouchableOpacity
                      key={d}
                      activeOpacity={0.85}
                      style={[
                        styles.pill,
                        answers.weekly_days === d && styles.pillSelected,
                      ]}
                      onPress={() =>
                        setAnswers((prev) => ({ ...prev, weekly_days: d as 3 | 4 | 5 | 6 | 7 }))
                      }
                    >
                      <Text style={styles.pillText}>{d}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.smallLabel}>Longest available day</Text>
                <View style={styles.horizontalRow}>
                  {[
                    { label: "45 min", value: 45 },
                    { label: "1 hour", value: 60 },
                    { label: "1.5 hours", value: 90 },
                    { label: "2+ hours", value: 120 },
                  ].map(({ label, value }) => (
                    <TouchableOpacity
                      key={value}
                      activeOpacity={0.85}
                      style={[
                        styles.pill,
                        answers.longest_day_minutes === value && styles.pillSelected,
                      ]}
                      onPress={() =>
                        setAnswers((prev) => ({
                          ...prev,
                          longest_day_minutes: value as LongestDay,
                        }))
                      }
                    >
                      <Text style={styles.pillText}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </GlassCard>
          </>
        );
      case 4:
        return (
          <>
            <View>
              <Text style={styles.title}>How much are you running right now?</Text>
              <Text style={styles.subtitle}>This keeps your progression safe and sustainable.</Text>
            </View>
            <GlassCard>
              <Text style={styles.smallLabel}>Typical weekly volume</Text>
              <View style={styles.horizontalRow}>
                {[0, 20, 40, 60, 80].map((km) => (
                  <TouchableOpacity
                    key={km}
                    activeOpacity={0.85}
                    style={[
                      styles.pill,
                      answers.weekly_volume_km === km && styles.pillSelected,
                    ]}
                    onPress={() => setAnswers((prev) => ({ ...prev, weekly_volume_km: km }))}
                  >
                    <Text style={styles.pillText}>
                      {km === 0 ? "Not running" : `${km} km/week`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.smallLabel}>Recent race result</Text>
              <View style={styles.horizontalRow}>
                {[
                  { label: "No recent races", value: "none" },
                  { label: "5K result", value: "5k" },
                  { label: "10K result", value: "10k" },
                  { label: "Half result", value: "half" },
                  { label: "Marathon result", value: "marathon" },
                ].map(({ label, value }) => (
                  <TouchableOpacity
                    key={value}
                    activeOpacity={0.85}
                    style={[
                      styles.pill,
                      answers.recent_race === value && styles.pillSelected,
                    ]}
                    onPress={() =>
                      setAnswers((prev) => ({ ...prev, recent_race: value as RecentRace }))
                    }
                  >
                    <Text style={styles.pillText}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </GlassCard>
          </>
        );
      case 5:
        return (
          <>
            <View>
              <Text style={styles.title}>Any injuries or niggles I should know about?</Text>
              <Text style={styles.subtitle}>Kipcoachee will protect these areas in your plan.</Text>
            </View>
            <GlassCard>
              <View style={styles.horizontalRow}>
                {INJURY_OPTIONS.map((label) => {
                  const selected = (answers.injuries ?? []).includes(label);
                  return (
                    <TouchableOpacity
                      key={label}
                      activeOpacity={0.85}
                      style={[styles.pill, selected && styles.pillSelected]}
                      onPress={() => toggleInjury(label)}
                    >
                      <Text style={styles.pillText}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[
                    styles.pill,
                    (answers.injuries ?? []).length === 0 && styles.pillSelected,
                  ]}
                  onPress={() => setAnswers((prev) => ({ ...prev, injuries: [] }))}
                >
                  <Text style={styles.pillText}>Nothing currently</Text>
                </TouchableOpacity>
              </View>
            </GlassCard>
            <Text style={styles.smallMuted}>
              You can always refine this later by chatting with Kipcoachee.
            </Text>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={80}
    >
      <ScreenContainer contentContainerStyle={styles.content}>
        <View>
          <View style={styles.dotsRow}>
            {totalSteps.map((s) => (
              <View
                key={s}
                style={[styles.dot, s === step && styles.dotActive]}
              />
            ))}
          </View>
          {renderStep()}
        </View>

        <View style={styles.bottomBar}>
          <TouchableOpacity
            onPress={handleBack}
            activeOpacity={0.8}
            style={styles.navButtonSecondary}
            disabled={submitting}
          >
            <Text style={styles.navButtonSecondaryText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleNext}
            disabled={!canContinue || submitting}
            activeOpacity={0.85}
            style={[
              styles.navButtonPrimary,
              (!canContinue || submitting) && styles.navButtonPrimaryDisabled,
            ]}
          >
            {submitting ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <ActivityIndicator color={colors.primaryForeground} />
                <Text style={styles.navButtonPrimaryText}>Building your plan…</Text>
              </View>
            ) : (
              <Text style={styles.navButtonPrimaryText}>
                {step === 0 ? "Let’s go" : step < 5 ? "Continue" : "Build my plan"}
              </Text>
            )}
          </TouchableOpacity>
          <View style={{ width: 80 }} />
        </View>
      </ScreenContainer>
    </KeyboardAvoidingView>
  );
};

