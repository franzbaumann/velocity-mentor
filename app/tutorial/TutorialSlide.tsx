import { FC, useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export type SlideData = {
  id: string;
  accent: string;
  emoji: string;
  title: string;
  subtitle: string;
  features: { icon: string; text: string }[];
  cta: string | null;
};

type Props = {
  slide: SlideData;
  index: number;
  currentIndex: number;
  onNext: () => void;
  onComplete: () => void;
  onNavigate: (target: "settings" | "plan" | "explore") => void;
};

export const TutorialSlide: FC<Props> = ({
  slide,
  index,
  currentIndex,
  onNext,
  onComplete,
  onNavigate,
}) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const isActive = index === currentIndex;

  const iconScale = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleY = useRef(new Animated.Value(30)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const featureAnims = useRef(
    slide.features.map(() => ({
      opacity: new Animated.Value(0),
      translateY: new Animated.Value(20),
    })),
  ).current;
  const ctaOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isActive) {
      Animated.spring(iconScale, {
        toValue: 1,
        damping: 8,
        stiffness: 100,
        useNativeDriver: true,
      }).start();

      Animated.parallel([
        Animated.timing(titleOpacity, {
          toValue: 1,
          duration: 300,
          delay: 150,
          useNativeDriver: true,
        }),
        Animated.spring(titleY, {
          toValue: 0,
          delay: 150,
          useNativeDriver: true,
        }),
      ]).start();

      Animated.timing(subtitleOpacity, {
        toValue: 1,
        duration: 300,
        delay: 250,
        useNativeDriver: true,
      }).start();

      featureAnims.forEach((anim, i) => {
        Animated.parallel([
          Animated.timing(anim.opacity, {
            toValue: 1,
            duration: 250,
            delay: 350 + i * 100,
            useNativeDriver: true,
          }),
          Animated.spring(anim.translateY, {
            toValue: 0,
            delay: 350 + i * 100,
            useNativeDriver: true,
          }),
        ]).start();
      });

      Animated.timing(ctaOpacity, {
        toValue: 1,
        duration: 250,
        delay: 600,
        useNativeDriver: true,
      }).start();
    } else {
      iconScale.setValue(0);
      titleOpacity.setValue(0);
      titleY.setValue(30);
      subtitleOpacity.setValue(0);
      featureAnims.forEach((anim) => {
        anim.opacity.setValue(0);
        anim.translateY.setValue(20);
      });
      ctaOpacity.setValue(0);
    }
  }, [isActive]);

  const isLastSlide = slide.id === "ready";

  return (
    <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
      {/* Illustration area */}
      <View
        style={[
          styles.illustrationArea,
          { backgroundColor: slide.accent + "15", paddingTop: insets.top },
        ]}
      >
        <Animated.View
          style={[
            styles.outerCircle,
            {
              backgroundColor: slide.accent + "25",
              transform: [{ scale: iconScale }],
            },
          ]}
        >
          <View style={[styles.innerCircle, { backgroundColor: slide.accent + "40" }]}>
            <Text style={styles.emoji}>{slide.emoji}</Text>
          </View>
        </Animated.View>
      </View>

      {/* Content area */}
      <View style={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Animated.Text
          style={[
            styles.title,
            { color: theme.textPrimary, opacity: titleOpacity, transform: [{ translateY: titleY }] },
          ]}
        >
          {slide.title}
        </Animated.Text>

        <Animated.Text
          style={[styles.subtitle, { color: theme.textSecondary, opacity: subtitleOpacity }]}
        >
          {slide.subtitle}
        </Animated.Text>

        {slide.features.length > 0 && (
          <View style={styles.features}>
            {slide.features.map((f, i) => (
              <Animated.View
                key={f.text}
                style={[
                  styles.featureRow,
                  {
                    opacity: featureAnims[i]?.opacity ?? 1,
                    transform: [{ translateY: featureAnims[i]?.translateY ?? 0 }],
                  },
                ]}
              >
                <Text style={[styles.featureIcon, { color: slide.accent }]}>{f.icon}</Text>
                <Text style={[styles.featureText, { color: theme.textPrimary }]}>{f.text}</Text>
              </Animated.View>
            ))}
          </View>
        )}

        <View style={styles.spacer} />

        {/* CTA area */}
        {!isLastSlide && slide.cta && (
          <Animated.View style={{ opacity: ctaOpacity }}>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: slide.accent }]}
              activeOpacity={0.9}
              onPress={onNext}
              accessibilityRole="button"
              accessibilityLabel={slide.cta}
            >
              <Text style={styles.primaryBtnText}>{slide.cta}</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {isLastSlide && (
          <Animated.View style={[styles.lastSlideActions, { opacity: ctaOpacity }]}>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: slide.accent }]}
              activeOpacity={0.9}
              onPress={() => onNavigate("settings")}
              accessibilityRole="button"
              accessibilityLabel="Connect wearable"
            >
              <Text style={styles.primaryBtnText}>Connect wearable</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.outlineBtn, { borderColor: slide.accent }]}
              activeOpacity={0.9}
              onPress={() => onNavigate("plan")}
              accessibilityRole="button"
              accessibilityLabel="Build my plan"
            >
              <Text style={[styles.outlineBtnText, { color: slide.accent }]}>
                Build my plan {"\u2192"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onNavigate("explore")}
              style={styles.exploreTouchable}
              accessibilityRole="button"
              accessibilityLabel="Explore the app first"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.exploreText, { color: theme.textSecondary }]}>
                Explore the app first
              </Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  slide: {
    height: SCREEN_HEIGHT,
  },
  illustrationArea: {
    height: SCREEN_HEIGHT * 0.42,
    alignItems: "center",
    justifyContent: "center",
  },
  outerCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: "center",
    justifyContent: "center",
  },
  innerCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  emoji: {
    fontSize: 56,
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    lineHeight: 36,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    marginTop: 12,
  },
  features: {
    marginTop: 24,
    gap: 16,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  featureIcon: {
    fontSize: 20,
    marginRight: 12,
    width: 28,
  },
  featureText: {
    fontSize: 15,
    flex: 1,
    lineHeight: 22,
  },
  spacer: {
    flex: 1,
  },
  primaryBtn: {
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  outlineBtn: {
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  outlineBtnText: {
    fontSize: 16,
    fontWeight: "600",
  },
  lastSlideActions: {
    gap: 12,
  },
  exploreTouchable: {
    alignItems: "center",
    paddingVertical: 10,
  },
  exploreText: {
    fontSize: 15,
  },
});
