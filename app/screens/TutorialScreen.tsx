import { FC, useCallback, useMemo, useRef, useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "../context/ThemeContext";

type TutorialAction = "connect-intervals" | "build-plan" | "explore";

type Props = {
  onDismiss: (action?: TutorialAction) => void;
};

type Slide = {
  id: number;
  icon: string;
  accent: string;
  title: string;
  subtitle: string;
  features?: { icon: string; text: string }[];
};

const SLIDES: Slide[] = [
  {
    id: 1,
    icon: "⚡",
    accent: "#3B82F6",
    title: "Welcome to Velocity Mentor",
    subtitle:
      "Your AI running coach that learns from your data and builds plans around your life.",
  },
  {
    id: 2,
    icon: "📊",
    accent: "#22C55E",
    title: "Connect your training data",
    subtitle:
      "Link intervals.icu or Strava and we'll automatically sync your activities, fitness metrics and wellness data.",
    features: [
      { icon: "✅", text: "Activities synced automatically" },
      { icon: "✅", text: "HRV, sleep and readiness tracked" },
      { icon: "✅", text: "Fitness & fatigue calculated daily" },
    ],
  },
  {
    id: 3,
    icon: "🤖",
    accent: "#8B5CF6",
    title: "Meet Kipcoachee",
    subtitle:
      "Your personal AI coach. Ask anything, get your plan adjusted, or chat about your training goals anytime.",
    features: [
      { icon: "💬", text: "Ask training questions anytime" },
      { icon: "📋", text: "Adjusts your plan based on how you feel" },
      { icon: "🧠", text: "Remembers your goals and preferences" },
    ],
  },
  {
    id: 4,
    icon: "📅",
    accent: "#F59E0B",
    title: "A plan built for you",
    subtitle:
      "Kipcoachee builds a personalized training plan based on your goal race, fitness level and weekly schedule.",
    features: [
      { icon: "🏃", text: "Structured sessions with clear targets" },
      { icon: "📈", text: "Progressive load that adapts over time" },
      { icon: "✓", text: "Mark sessions complete as you train" },
    ],
  },
  {
    id: 5,
    icon: "🏆",
    accent: "#3B82F6",
    title: "You're all set.",
    subtitle: "Let's build your first plan and start training smarter.",
  },
];

export const TutorialScreen: FC<Props> = ({ onDismiss }) => {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView | null>(null);
  const [index, setIndex] = useState(0);
  const { theme } = useTheme();
  const navigation = useNavigation<any>();

  const currentSlide = useMemo(() => SLIDES[index] ?? SLIDES[0], [index]);

  const handleScroll = useCallback(
    (event: any) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const newIndex = Math.round(offsetX / width);
      if (newIndex !== index) setIndex(newIndex);
    },
    [index, width],
  );

  const goToIndex = useCallback(
    (target: number) => {
      if (!scrollRef.current) return;
      scrollRef.current.scrollTo({ x: target * width, animated: true });
      setIndex(target);
    },
    [width],
  );

  const handleNext = useCallback(() => {
    if (index < SLIDES.length - 1) {
      goToIndex(index + 1);
    }
  }, [goToIndex, index]);

  const handleBack = useCallback(() => {
    if (index > 0) {
      goToIndex(index - 1);
    }
  }, [goToIndex, index]);

  const handleSkip = useCallback(() => {
    onDismiss();
  }, [onDismiss]);

  const handleFinalAction = useCallback(
    (action: TutorialAction) => {
      onDismiss(action);
      if (action === "connect-intervals") {
        navigation.navigate("AppTabs", { screen: "Settings" });
      } else if (action === "build-plan") {
        navigation.navigate("AppTabs", { screen: "Plan" });
      } else if (action === "explore") {
        navigation.navigate("AppTabs", { screen: "Dashboard" });
      }
    },
    [navigation, onDismiss],
  );

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={handleSkip}
      accessibilityViewIsModal
    >
      <View
        style={[
          styles.root,
          {
            backgroundColor: theme.appBackground,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerSide}>
            {index > 0 && (
              <TouchableOpacity
                onPress={handleBack}
                accessibilityRole="button"
                accessibilityLabel="Back"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="chevron-back" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.headerCenter} />
          <View style={styles.headerSide}>
            <TouchableOpacity
              onPress={handleSkip}
              accessibilityRole="button"
              accessibilityLabel="Skip tutorial"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={[styles.skipText, { color: theme.textSecondary }]}>Skip</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{ alignItems: "stretch" }}
        >
          {SLIDES.map((slide, i) => (
            <View key={slide.id} style={[styles.slide, { width }]}>
              <View style={styles.illustrationContainer}>
                <View
                  style={[
                    styles.illustrationCircle,
                    {
                      backgroundColor: slide.accent + "33",
                    },
                  ]}
                >
                  <Text style={styles.illustrationIcon}>{slide.icon}</Text>
                </View>
              </View>

              <View style={styles.content}>
                <Text
                  style={[
                    styles.title,
                    {
                      color: theme.textPrimary,
                    },
                  ]}
                >
                  {slide.title}
                </Text>
                <Text
                  style={[
                    styles.subtitle,
                    {
                      color: theme.textSecondary,
                    },
                  ]}
                >
                  {slide.subtitle}
                </Text>

                {slide.features && (
                  <View style={styles.features}>
                    {slide.features.map((f) => (
                      <View key={f.text} style={styles.featureRow}>
                        <Text style={[styles.featureIcon, { color: slide.accent }]}>{f.icon}</Text>
                        <Text style={[styles.featureText, { color: theme.textPrimary }]}>
                          {f.text}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              <View style={styles.footer}>
                <View style={styles.dotsRow}>
                  {SLIDES.map((s, dotIndex) => {
                    const active = dotIndex === i;
                    const isCurrentSlide = dotIndex === index;
                    return (
                      <TouchableOpacity
                        key={s.id}
                        style={[
                          styles.dot,
                          {
                            backgroundColor: isCurrentSlide ? currentSlide.accent : "#e5e7eb",
                          },
                        ]}
                        onPress={() => goToIndex(dotIndex)}
                        accessibilityRole="button"
                        accessibilityLabel={`Go to slide ${dotIndex + 1}`}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        {active ? null : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {slide.id < 5 && (
                  <TouchableOpacity
                    style={[
                      styles.primaryButton,
                      {
                        backgroundColor: slide.accent,
                      },
                    ]}
                    onPress={handleNext}
                    accessibilityRole="button"
                    accessibilityLabel={slide.id === 1 ? "Get started" : "Next"}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.primaryButtonText}>
                      {slide.id === 1 ? "Get started" : "Next \u2192"}
                    </Text>
                  </TouchableOpacity>
                )}

                {slide.id === 5 && (
                  <View style={styles.finalActions}>
                    <TouchableOpacity
                      style={[styles.primaryButton, { backgroundColor: slide.accent }]}
                      onPress={() => handleFinalAction("connect-intervals")}
                      accessibilityRole="button"
                      accessibilityLabel="Connect intervals.icu"
                      activeOpacity={0.9}
                    >
                      <Text style={styles.primaryButtonText}>Connect intervals.icu</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.secondaryButton,
                        {
                          borderColor: slide.accent,
                        },
                      ]}
                      onPress={() => handleFinalAction("build-plan")}
                      accessibilityRole="button"
                      accessibilityLabel="Build my plan"
                      activeOpacity={0.9}
                    >
                      <Text style={[styles.secondaryButtonText, { color: slide.accent }]}>
                        Build my plan
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => handleFinalAction("explore")}
                      accessibilityRole="button"
                      accessibilityLabel="Explore the app first"
                      style={styles.exploreLinkTouchable}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={[styles.exploreLink, { color: theme.textSecondary }]}>
                        Explore the app first
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  headerSide: {
    width: 80,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
  },
  skipText: {
    fontSize: 15,
  },
  slide: {
    flex: 1,
    paddingHorizontal: 24,
  },
  illustrationContainer: {
    height: "40%",
    alignItems: "center",
    justifyContent: "center",
  },
  illustrationCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: "center",
    justifyContent: "center",
  },
  illustrationIcon: {
    fontSize: 80,
  },
  content: {
    flexGrow: 1,
    alignItems: "center",
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 24,
  },
  features: {
    alignSelf: "stretch",
    marginTop: 8,
    gap: 16,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  featureIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  featureText: {
    fontSize: 15,
    flex: 1,
  },
  footer: {
    paddingTop: 24,
    paddingBottom: 16,
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 16,
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  primaryButton: {
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  finalActions: {
    gap: 12,
  },
  secondaryButton: {
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  exploreLinkTouchable: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  exploreLink: {
    fontSize: 15,
  },
});

