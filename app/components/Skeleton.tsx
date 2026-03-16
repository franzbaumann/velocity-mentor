import { FC, PropsWithChildren, useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, View, ViewStyle } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { GlassCard } from "./GlassCard";

type SkeletonLineProps = {
  width?: number | `${number}%`;
  height?: number;
  style?: ViewStyle;
};

type SkeletonCardProps = PropsWithChildren<{
  style?: ViewStyle;
}>;

export const SkeletonLine: FC<SkeletonLineProps> = ({ width = "100%", height = 12, style }) => {
  const { theme } = useTheme();
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  const translateX = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-120, 240],
  });

  const shimmerStyle = useMemo(
    () => ({
      backgroundColor: theme.cardBorder + "44",
      transform: [{ translateX }],
    }),
    [theme.cardBorder, translateX],
  );

  return (
    <View
      style={[
        styles.line,
        {
          width,
          height,
          backgroundColor: theme.cardBorder + "66",
        },
        style,
      ]}
    >
      <Animated.View style={[styles.shimmer, shimmerStyle]} />
    </View>
  );
};

export const SkeletonCard: FC<SkeletonCardProps> = ({ children, style }) => (
  <GlassCard style={style}>{children}</GlassCard>
);

const styles = StyleSheet.create({
  line: {
    borderRadius: 999,
    overflow: "hidden",
  },
  shimmer: {
    height: "100%",
    width: 120,
    opacity: 0.7,
  },
});

