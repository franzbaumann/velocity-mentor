import { FC, useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  StyleSheet,
  Text,
  View,
} from "react-native";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

export type SpotlightRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type Props = {
  step: 1 | 2 | 3;
  spotlight: SpotlightRect | null;
  completing: boolean;
  onComplete: () => void;
};

const SPOT_PAD = 10;
const BACKDROP_COLOR = "rgba(0,0,0,0.45)";
const SPOT_RADIUS = 16;

const STEP_DATA = {
  1: {
    title: "Swipe left to explore different weeks \u2192",
    subtitle: "Your full training plan is laid out week by week",
    hand: "\ud83d\udc46",
  },
  2: {
    title: "Hold & drag cards to reorder your sessions",
    subtitle: null,
    hand: "\u270a",
  },
  3: {
    title: "Tap any session to see full workout details",
    subtitle: null,
    hand: "\ud83d\udc46",
  },
} as const;

export const PlanOnboardingOverlay: FC<Props> = ({
  step,
  spotlight,
  completing,
  onComplete,
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const handX = useRef(new Animated.Value(0)).current;
  const handY = useRef(new Animated.Value(0)).current;
  const handScale = useRef(new Animated.Value(1)).current;
  const rippleScale = useRef(new Animated.Value(0)).current;
  const rippleOpacity = useRef(new Animated.Value(0)).current;
  const handAnim = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, []);

  useEffect(() => {
    if (!completing) return;
    handAnim.current?.stop();
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => onComplete());
  }, [completing]);

  // Subtle pulse on step transition
  useEffect(() => {
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 0.6,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 120,
        useNativeDriver: true,
      }),
    ]).start();
  }, [step]);

  useEffect(() => {
    handAnim.current?.stop();
    handX.setValue(0);
    handY.setValue(0);
    handScale.setValue(1);
    rippleScale.setValue(0);
    rippleOpacity.setValue(0);

    let anim: Animated.CompositeAnimation;

    if (step === 1) {
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(handX, {
            toValue: -80,
            duration: 700,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(handX, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.delay(150),
          Animated.timing(handX, {
            toValue: -80,
            duration: 700,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(handX, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.delay(1200),
        ]),
      );
    } else if (step === 2) {
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(handScale, {
            toValue: 0.85,
            duration: 250,
            useNativeDriver: true,
          }),
          Animated.delay(200),
          Animated.timing(handY, {
            toValue: -55,
            duration: 500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.parallel([
            Animated.timing(handScale, {
              toValue: 1,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(handY, {
              toValue: 0,
              duration: 300,
              useNativeDriver: true,
            }),
          ]),
          Animated.delay(400),
          Animated.timing(handScale, {
            toValue: 0.85,
            duration: 250,
            useNativeDriver: true,
          }),
          Animated.delay(200),
          Animated.timing(handY, {
            toValue: -55,
            duration: 500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.parallel([
            Animated.timing(handScale, {
              toValue: 1,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(handY, {
              toValue: 0,
              duration: 300,
              useNativeDriver: true,
            }),
          ]),
          Animated.delay(1200),
        ]),
      );
    } else {
      anim = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(handScale, {
              toValue: 0.85,
              duration: 150,
              useNativeDriver: true,
            }),
            Animated.timing(rippleScale, {
              toValue: 0,
              duration: 0,
              useNativeDriver: true,
            }),
            Animated.timing(rippleOpacity, {
              toValue: 0.5,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(handScale, {
              toValue: 1,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(rippleScale, {
              toValue: 2,
              duration: 600,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(rippleOpacity, {
              toValue: 0,
              duration: 600,
              useNativeDriver: true,
            }),
          ]),
          Animated.delay(500),
          Animated.parallel([
            Animated.timing(handScale, {
              toValue: 0.85,
              duration: 150,
              useNativeDriver: true,
            }),
            Animated.timing(rippleScale, {
              toValue: 0,
              duration: 0,
              useNativeDriver: true,
            }),
            Animated.timing(rippleOpacity, {
              toValue: 0.5,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(handScale, {
              toValue: 1,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(rippleScale, {
              toValue: 2,
              duration: 600,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(rippleOpacity, {
              toValue: 0,
              duration: 600,
              useNativeDriver: true,
            }),
          ]),
          Animated.delay(1200),
        ]),
      );
    }

    handAnim.current = anim;
    anim.start();
    return () => anim.stop();
  }, [step]);

  const data = STEP_DATA[step];

  const spot = spotlight ?? {
    x: 16,
    y: SCREEN_H * 0.38,
    w: SCREEN_W - 32,
    h: SCREEN_H * 0.35,
  };

  const spotTop = spot.y - SPOT_PAD;
  const spotLeft = spot.x - SPOT_PAD;
  const spotRight = spot.x + spot.w + SPOT_PAD;
  const spotBottom = spot.y + spot.h + SPOT_PAD;
  const spotWidth = spot.w + SPOT_PAD * 2;
  const spotHeight = spot.h + SPOT_PAD * 2;

  const tooltipTop = Math.max(40, spotTop - 150);
  const handTop = spot.y + spot.h * 0.45;
  const handLeft = spot.x + spot.w * 0.5 - 18;

  return (
    <Animated.View
      style={[StyleSheet.absoluteFillObject, { zIndex: 999, opacity: fadeAnim }]}
      pointerEvents="box-none"
    >
      {/* 4-panel backdrop forming cutout around spotlight */}
      <View
        pointerEvents="none"
        style={[styles.panel, { top: 0, left: 0, right: 0, height: Math.max(0, spotTop) }]}
      />
      <View
        pointerEvents="none"
        style={[styles.panel, { top: spotBottom, left: 0, right: 0, bottom: 0 }]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.panel,
          { top: spotTop, left: 0, width: Math.max(0, spotLeft), height: spotHeight },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.panel,
          { top: spotTop, left: spotRight, right: 0, height: spotHeight },
        ]}
      />

      {/* Glow ring */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: spotTop - 2,
          left: spotLeft - 2,
          width: spotWidth + 4,
          height: spotHeight + 4,
          borderRadius: SPOT_RADIUS + 2,
          borderWidth: 2,
          borderColor: "rgba(255,255,255,0.45)",
        }}
      />

      {/* Tooltip bubble */}
      <View pointerEvents="none" style={[styles.tooltipWrap, { top: tooltipTop }]}>
        <View style={styles.bubble}>
          <Text style={styles.bubbleTitle}>{data.title}</Text>
          {data.subtitle && <Text style={styles.bubbleSubtitle}>{data.subtitle}</Text>}
          <View style={styles.dotsRow}>
            {([1, 2, 3] as const).map((s) => (
              <View key={s} style={[styles.dot, s === step && styles.dotActive]} />
            ))}
          </View>
        </View>
        <View style={styles.bubbleArrow} />
      </View>

      {/* Ripple ring (step 3) */}
      {step === 3 && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: handTop - 5,
            left: handLeft - 7,
            width: 50,
            height: 50,
            borderRadius: 25,
            backgroundColor: "rgba(255,255,255,0.3)",
            transform: [{ scale: rippleScale }],
            opacity: rippleOpacity,
          }}
        />
      )}

      {/* Animated hand */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: handTop,
          left: handLeft,
          transform: [
            { translateX: handX },
            { translateY: handY },
            { scale: handScale },
          ],
        }}
      >
        <Text style={styles.handEmoji}>{data.hand}</Text>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  panel: {
    position: "absolute",
    backgroundColor: BACKDROP_COLOR,
  },
  tooltipWrap: {
    position: "absolute",
    left: 24,
    right: 24,
    alignItems: "center",
  },
  bubble: {
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
    alignItems: "center",
  },
  bubbleTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    textAlign: "center",
    lineHeight: 22,
  },
  bubbleSubtitle: {
    fontSize: 13,
    color: "#6b7280",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
  },
  dotsRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 12,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#d1d5db",
  },
  dotActive: {
    backgroundColor: "#2563eb",
    width: 18,
  },
  bubbleArrow: {
    width: 14,
    height: 14,
    backgroundColor: "#fff",
    transform: [{ rotate: "45deg" }],
    marginTop: -7,
  },
  handEmoji: {
    fontSize: 36,
  },
});
