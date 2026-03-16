import { FC, useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "../context/ThemeContext";
import { TutorialSlide, type SlideData } from "./TutorialSlide";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const SLIDES: SlideData[] = [
  {
    id: "welcome",
    accent: "#3B82F6",
    emoji: "⚡",
    title: "Welcome to\nCADE",
    subtitle:
      "Your AI running coach that learns from your data and builds plans around your life.",
    features: [],
    cta: "Get started \u2192",
  },
  {
    id: "data",
    accent: "#22C55E",
    emoji: "📊",
    title: "Connect your\ntraining data",
    subtitle:
      "Link your wearable — for example Garmin, Apple Health, Coros and more — to automatically sync your activities and wellness.",
    features: [
      { icon: "🔄", text: "Activities synced automatically" },
      { icon: "💚", text: "HRV, sleep and readiness tracked" },
      { icon: "📈", text: "Fitness & fatigue calculated daily" },
    ],
    cta: "Next \u2192",
  },
  {
    id: "coach",
    accent: "#8B5CF6",
    emoji: "🤖",
    title: "Meet\nKipcoachee",
    subtitle:
      "Your personal AI coach. Ask anything, get your plan adjusted anytime.",
    features: [
      { icon: "💬", text: "Ask training questions anytime" },
      { icon: "📋", text: "Adjusts your plan as you go" },
      { icon: "🧠", text: "Remembers your goals" },
    ],
    cta: "Next \u2192",
  },
  {
    id: "plan",
    accent: "#F59E0B",
    emoji: "📅",
    title: "A plan built\nfor you",
    subtitle:
      "Kipcoachee builds a personalized plan based on your goal race and fitness.",
    features: [
      { icon: "🏃", text: "Structured sessions with clear targets" },
      { icon: "📈", text: "Progressive load that adapts over time" },
      { icon: "✅", text: "Mark sessions complete as you train" },
    ],
    cta: "Next \u2192",
  },
  {
    id: "ready",
    accent: "#3B82F6",
    emoji: "🏆",
    title: "You're all set.",
    subtitle: "Let's build your first plan and start training smarter.",
    features: [],
    cta: null,
  },
];

type Props = {
  onComplete: () => Promise<void>;
  onNavigateAfter?: (target: "settings" | "plan" | "explore") => void;
};

export const TutorialNavigator: FC<Props> = ({ onComplete, onNavigateAfter }) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList<SlideData> | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const dotWidths = useRef(SLIDES.map((_, i) => new Animated.Value(i === 0 ? 24 : 8))).current;

  useEffect(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);

  useEffect(() => {
    dotWidths.forEach((w, i) => {
      Animated.spring(w, {
        toValue: i === currentIndex ? 24 : 8,
        useNativeDriver: false,
      }).start();
    });
  }, [currentIndex, dotWidths]);

  const handleMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const newIndex = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
      if (newIndex !== currentIndex) {
        setCurrentIndex(newIndex);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
    },
    [currentIndex],
  );

  const goToIndex = useCallback(
    (index: number) => {
      flatListRef.current?.scrollToOffset({ offset: index * SCREEN_WIDTH, animated: true });
      setCurrentIndex(index);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    },
    [],
  );

  const handleNext = useCallback(() => {
    if (currentIndex === 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    if (currentIndex < SLIDES.length - 1) {
      goToIndex(currentIndex + 1);
    }
  }, [currentIndex, goToIndex]);

  const handleSkip = useCallback(async () => {
    await onComplete();
  }, [onComplete]);

  const handleNavigate = useCallback(
    async (target: "settings" | "plan" | "explore") => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await onComplete();
      onNavigateAfter?.(target);
    },
    [onComplete, onNavigateAfter],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: SlideData; index: number }) => (
      <TutorialSlide
        slide={item}
        index={index}
        currentIndex={currentIndex}
        onNext={handleNext}
        onComplete={handleSkip}
        onNavigate={handleNavigate}
      />
    ),
    [currentIndex, handleNext, handleSkip, handleNavigate],
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.appBackground }]}>
      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <View style={styles.topBarSide}>
          {currentIndex > 0 && (
            <TouchableOpacity
              onPress={() => goToIndex(currentIndex - 1)}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="chevron-back" size={24} color={theme.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.topBarCenter}>
          {SLIDES.map((s, i) => {
            const isActive = i === currentIndex;
            return (
              <TouchableOpacity
                key={s.id}
                onPress={() => goToIndex(i)}
                accessibilityRole="button"
                accessibilityLabel={`Go to slide ${i + 1}`}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              >
                  <Animated.View
                    style={[
                      styles.dot,
                      {
                        width: dotWidths[i],
                        backgroundColor: isActive ? "#1C1C1E" : "#D1D5DB",
                      },
                    ]}
                  />
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={[styles.topBarSide, styles.topBarRight]}>
          {currentIndex < SLIDES.length - 1 && (
            <TouchableOpacity
              onPress={handleSkip}
              accessibilityRole="button"
              accessibilityLabel="Skip tutorial"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={[styles.skipText, { color: theme.textSecondary }]}>Skip</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Swipe hint on first slide */}
      {currentIndex === 0 && (
        <View style={styles.hintContainer}>
          <Text style={[styles.hintText, { color: theme.textSecondary }]}>
            Swipe to navigate
          </Text>
        </View>
      )}

      {/* Slides */}
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        renderItem={renderItem}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  topBarSide: {
    width: 60,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  topBarRight: {
    alignItems: "flex-end",
  },
  topBarCenter: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  skipText: {
    fontSize: 15,
  },
  hintContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 5,
    justifyContent: "flex-end",
    alignItems: "center",
    pointerEvents: "none",
    paddingBottom: 80,
  },
  hintText: {
    fontSize: 13,
    opacity: 0.6,
  },
});
