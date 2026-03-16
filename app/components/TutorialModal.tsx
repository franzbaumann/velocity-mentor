import { FC, useCallback, useMemo, useRef, useEffect } from "react";
import {
  Animated,
  FlatList,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "../context/ThemeContext";

type TutorialModalProps = {
  onComplete: () => Promise<void>;
};

type Slide = {
  id: number;
  accent: string;
  icon: string;
  title: string;
  subtitle: string;
  features?: { icon: string; text: string }[];
  primaryLabel: string;
};

const SLIDES: Slide[] = [
  {
    id: 1,
    accent: "#3B82F6",
    icon: "⚡",
    title: "Welcome to Velocity Mentor",
    subtitle:
      "Your AI running coach that learns from your data and builds plans around your life.",
    primaryLabel: "Get started \u2192",
  },
  {
    id: 2,
    accent: "#22C55E",
    icon: "📊",
    title: "Connect your training data",
    subtitle:
      "Link intervals.icu or Strava to automatically sync your activities, fitness and wellness.",
    features: [
      { icon: "🔄", text: "Activities synced automatically" },
      { icon: "💚", text: "HRV, sleep and readiness tracked" },
      { icon: "📈", text: "Fitness & fatigue calculated daily" },
    ],
    primaryLabel: "Next \u2192",
  },
  {
    id: 3,
    accent: "#8B5CF6",
    icon: "🤖",
    title: "Meet Kipcoachee",
    subtitle:
      "Your personal AI coach. Ask anything, get your plan adjusted, chat about goals.",
    features: [
      { icon: "💬", text: "Ask training questions anytime" },
      { icon: "📋", text: "Adjusts your plan based on how you feel" },
      { icon: "🧠", text: "Remembers your goals and preferences" },
    ],
    primaryLabel: "Next \u2192",
  },
  {
    id: 4,
    accent: "#F59E0B",
    icon: "📅",
    title: "A plan built for you",
    subtitle:
      "Kipcoachee builds a personalized plan based on your goal race, fitness and schedule.",
    features: [
      { icon: "🏃", text: "Structured sessions with clear targets" },
      { icon: "📈", text: "Progressive load that adapts over time" },
      { icon: "✅", text: "Mark sessions complete as you train" },
    ],
    primaryLabel: "Next \u2192",
  },
  {
    id: 5,
    accent: "#3B82F6",
    icon: "🏆",
    title: "You're all set.",
    subtitle: "Let's build your first plan and start training smarter.",
    primaryLabel: "",
  },
];

export const TutorialModal: FC<TutorialModalProps> = ({ onComplete }) => {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const navigation = useNavigation<any>();

  const scrollX = useRef(new Animated.Value(0)).current;
  const currentIndex = useRef(0);

  const translateY = useRef(new Animated.Value(0)).current;
  const backdropOpacity = useRef(new Animated.Value(1)).current;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_evt, gestureState) => {
          return Math.abs(gestureState.dy) > 10 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
        },
        onPanResponderMove: (_evt, gesture) => {
          if (gesture.dy > 0) {
            translateY.setValue(gesture.dy);
            backdropOpacity.setValue(1 - Math.min(gesture.dy / 300, 0.7));
          }
        },
        onPanResponderRelease: (_evt, gesture) => {
          if (gesture.dy > 80 || gesture.vy > 0.8) {
            Animated.parallel([
              Animated.timing(translateY, {
                toValue: 400,
                duration: 200,
                useNativeDriver: true,
              }),
              Animated.timing(backdropOpacity, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
              }),
            ]).start(() => {
              onComplete();
            });
          } else {
            Animated.parallel([
              Animated.spring(translateY, {
                toValue: 0,
                useNativeDriver: true,
              }),
              Animated.timing(backdropOpacity, {
                toValue: 1,
                duration: 150,
                useNativeDriver: true,
              }),
            ]).start();
          }
        },
      }),
    [backdropOpacity, onComplete, translateY],
  );

  useEffect(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
        useNativeDriver: false,
      })(event);
      const newIndex = Math.round(event.nativeEvent.contentOffset.x / width);
      if (newIndex !== currentIndex.current) {
        currentIndex.current = newIndex;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
    },
    [scrollX, width],
  );

  const goToIndex = useCallback(
    (index: number) => {
      const offset = index * width;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      listRef.current?.scrollToOffset({ offset, animated: true });
    },
    [width],
  );

  const listRef = useRef<FlatList<Slide> | null>(null);

  const renderItem = useCallback(
    ({ item, index }: { item: Slide; index: number }) => {
      const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
      const opacity = scrollX.interpolate({
        inputRange,
        outputRange: [0, 1, 0],
        extrapolate: "clamp",
      });
      const translateUp = scrollX.interpolate({
        inputRange,
        outputRange: [20, 0, -20],
        extrapolate: "clamp",
      });

      return (
        <View style={{ width }}>
          <Animated.View
            style={[
              styles.slideInner,
              {
                paddingTop: insets.top + 16,
                paddingBottom: insets.bottom + 24,
                opacity,
                transform: [{ translateY: translateUp }],
              },
            ]}
          >
            <View style={styles.headerRow}>
              <View style={styles.headerSide} />
              <View style={styles.headerCenter}>
                {index === 0 && (
                  <Text style={[styles.hintText, { color: theme.textSecondary }]}>
                    Swipe to navigate
                  </Text>
                )}
              </View>
              <View style={styles.headerSide}>
                <TouchableOpacity
                  onPress={() => {
                    onComplete();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Skip tutorial"
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Text style={[styles.skipText, { color: theme.textSecondary }]}>Skip</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.illustrationWrapper}>
              <Animated.View
                style={[
                  styles.illustrationCircle,
                  {
                    backgroundColor: item.accent + "33",
                  },
                ]}
              >
                <Animated.Text style={styles.illustrationIcon}>{item.icon}</Animated.Text>
              </Animated.View>
            </View>

            <View style={styles.content}>
              <Text style={[styles.title, { color: theme.textPrimary }]}>{item.title}</Text>
              <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                {item.subtitle}
              </Text>

              {item.features && (
                <View style={styles.features}>
                  {item.features.map((f, iRow) => (
                    <Animated.View
                      key={f.text}
                      style={[
                        styles.featureRow,
                        {
                          opacity,
                          transform: [
                            {
                              translateY: scrollX.interpolate({
                                inputRange,
                                outputRange: [30 + iRow * 4, 0, -10],
                                extrapolate: "clamp",
                              }),
                            },
                          ],
                        },
                      ]}
                    >
                      <Text style={[styles.featureIcon, { color: item.accent }]}>{f.icon}</Text>
                      <Text style={[styles.featureText, { color: theme.textPrimary }]}>
                        {f.text}
                      </Text>
                    </Animated.View>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.footer}>
              <Dots scrollX={scrollX} slideCount={SLIDES.length} accent={item.accent} goTo={goToIndex} />

              {item.id < 5 && (
                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: item.accent }]}
                  activeOpacity={0.9}
                  onPress={() => {
                    if (item.id === 1) {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                    }
                    goToIndex(index + 1);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={item.id === 1 ? "Get started" : "Next"}
                >
                  <Text style={styles.primaryButtonText}>{item.primaryLabel}</Text>
                </TouchableOpacity>
              )}

              {item.id === 5 && (
                <View style={styles.finalActions}>
                  <TouchableOpacity
                    style={[styles.primaryButton, { backgroundColor: item.accent }]}
                    activeOpacity={0.9}
                    accessibilityRole="button"
                    accessibilityLabel="Connect intervals.icu"
                    onPress={async () => {
                      await onComplete();
                      navigation.navigate("AppTabs", { screen: "Settings" });
                    }}
                  >
                    <Text style={styles.primaryButtonText}>Connect intervals.icu</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.secondaryButton, { borderColor: item.accent }]}
                    activeOpacity={0.9}
                    accessibilityRole="button"
                    accessibilityLabel="Build my plan"
                    onPress={async () => {
                      await onComplete();
                      navigation.navigate("AppTabs", { screen: "Plan" });
                    }}
                  >
                    <Text style={[styles.secondaryButtonText, { color: item.accent }]}>
                      Build my plan \u2192
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Explore the app first"
                    onPress={async () => {
                      await onComplete();
                      navigation.navigate("AppTabs", { screen: "Dashboard" });
                    }}
                    style={styles.exploreTouchable}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={[styles.exploreText, { color: theme.textSecondary }]}>
                      Explore the app first
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </Animated.View>
        </View>
      );
    },
    [backdropOpacity, goToIndex, insets.bottom, insets.top, navigation, onComplete, scrollX, theme.textPrimary, theme.textSecondary, width],
  );

  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" transparent>
      <Animated.View
        style={[
          styles.backdrop,
          {
            opacity: backdropOpacity,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.container,
            {
              backgroundColor: theme.appBackground,
              transform: [{ translateY }],
            },
          ]}
          {...panResponder.panHandlers}
        >
          <FlatList
            ref={listRef}
            data={SLIDES}
            keyExtractor={(item) => String(item.id)}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            renderItem={renderItem}
          />
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

type DotsProps = {
  scrollX: Animated.Value;
  slideCount: number;
  accent: string;
  goTo: (index: number) => void;
};

const Dots: FC<DotsProps> = ({ scrollX, slideCount, accent, goTo }) => {
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: slideCount }).map((_, index) => {
        const inputRange = [(index - 1) * 1, index * 1, (index + 1) * 1];
        const width = scrollX.interpolate({
          inputRange: inputRange.map((v) => v * 1),
          outputRange: [8, 24, 8],
          extrapolate: "clamp",
        });
        const opacity = scrollX.interpolate({
          inputRange: inputRange.map((v) => v * 1),
          outputRange: [0.4, 1, 0.4],
          extrapolate: "clamp",
        });
        const backgroundColor = scrollX.interpolate({
          inputRange: inputRange.map((v) => v * 1),
          outputRange: ["#e5e7eb", accent, "#e5e7eb"],
          extrapolate: "clamp",
        });
        return (
          <TouchableOpacity
            key={index}
            onPress={() => goTo(index)}
            accessibilityRole="button"
            accessibilityLabel={`Go to slide ${index + 1}`}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Animated.View
              style={[
                styles.dot,
                {
                  width,
                  opacity,
                  backgroundColor,
                },
              ]}
            />
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  slideInner: {
    flex: 1,
    paddingHorizontal: 24,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  headerSide: {
    width: 80,
    alignItems: "flex-end",
    paddingHorizontal: 12,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  skipText: {
    fontSize: 15,
  },
  hintText: {
    fontSize: 13,
  },
  illustrationWrapper: {
    height: "45%",
    alignItems: "center",
    justifyContent: "center",
  },
  illustrationCircle: {
    width: 200,
    height: 200,
    borderRadius: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  illustrationIcon: {
    fontSize: 100,
  },
  content: {
    flexGrow: 1,
    alignItems: "center",
  },
  title: {
    fontSize: 28,
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
    paddingBottom: 12,
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    columnGap: 8,
  },
  dot: {
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
  exploreTouchable: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  exploreText: {
    fontSize: 15,
  },
});

