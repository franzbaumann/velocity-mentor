import { PropsWithChildren, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  GestureResponderEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  ScrollViewProps,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useTheme } from "../context/ThemeContext";

type PullToRefreshScrollViewProps = PropsWithChildren<
  ScrollViewProps & {
    onRefresh?: () => Promise<void> | void;
    pullThreshold?: number;
    successMessage?: string;
  }
>;

const DEFAULT_THRESHOLD = 70;
const MAX_PULL_DISTANCE = 140;

export function PullToRefreshScrollView(props: PullToRefreshScrollViewProps) {
  const { onRefresh, pullThreshold = DEFAULT_THRESHOLD, successMessage = "Synced", children, ...rest } =
    props;

  const { theme } = useTheme();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);

  const startYRef = useRef<number | null>(null);
  const lastPullDistanceRef = useRef(0);
  const pullingRef = useRef(false);
  const atTopRef = useRef(true);
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const threshold = pullThreshold;

  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
    };
  }, []);

  const resetSpinner = () => {
    setPullDistance(0);
    lastPullDistanceRef.current = 0;
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset } = e.nativeEvent;
    atTopRef.current = !contentOffset || contentOffset.y <= 0;
    if (typeof rest.onScroll === "function") {
      rest.onScroll(e);
    }
  };

  const handleTouchStart = (e: GestureResponderEvent) => {
    if (typeof rest.onTouchStart === "function") {
      rest.onTouchStart(e);
    }
    if (!onRefresh || isRefreshing) return;
    if (!atTopRef.current) return;

    const y = e.nativeEvent.pageY ?? e.nativeEvent.locationY;
    startYRef.current = y;
    lastPullDistanceRef.current = 0;
    pullingRef.current = true;
    setShowSuccess(false);
    setHasError(false);
    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current);
      successTimeoutRef.current = null;
    }
  };

  const handleTouchMove = (e: GestureResponderEvent) => {
    if (typeof rest.onTouchMove === "function") {
      rest.onTouchMove(e);
    }
    if (!pullingRef.current || !onRefresh || isRefreshing || startYRef.current == null) return;

    const y = e.nativeEvent.pageY ?? e.nativeEvent.locationY;
    const delta = Math.max(0, Math.min(MAX_PULL_DISTANCE, y - startYRef.current));
    lastPullDistanceRef.current = delta;
    setPullDistance(delta);

    const progress = Math.min(1, delta / threshold);
    translateY.setValue(delta * 0.5);
    opacity.setValue(progress);
  };

  const handleTouchEnd = async (e: GestureResponderEvent) => {
    if (typeof rest.onTouchEnd === "function") {
      rest.onTouchEnd(e);
    }

    if (!pullingRef.current) return;
    pullingRef.current = false;

    const distance = lastPullDistanceRef.current;
    startYRef.current = null;
    lastPullDistanceRef.current = 0;

    if (!onRefresh || isRefreshing) {
      resetSpinner();
      return;
    }

    if (distance < threshold) {
      resetSpinner();
      return;
    }

    setIsRefreshing(true);
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 40,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();

    try {
      await Promise.resolve(onRefresh());
      setHasError(false);
      setShowSuccess(true);
    } catch (err) {
      console.error("PullToRefreshScrollView onRefresh error", err);
      setShowSuccess(false);
      setHasError(true);
    } finally {
      setIsRefreshing(false);
      successTimeoutRef.current = setTimeout(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start(() => {
          setShowSuccess(false);
          setHasError(false);
          translateY.setValue(0);
        });
      }, 800);
    }
  };

  return (
    <View style={styles.root}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.spinnerContainer,
          {
            opacity,
            transform: [{ translateY }],
          },
        ]}
      >
        {hasError
          ? (
          <Text style={[styles.statusText, { color: theme.negative }]}>Sync failed</Text>
          )
          : showSuccess
            ? (
          <Text style={[styles.statusText, { color: theme.accentGreen }]}>✓ {successMessage}</Text>
              )
            : (
          <ActivityIndicator size="small" color={theme.accentBlue} />
              )}
      </Animated.View>
      <ScrollView
        {...rest}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  spinnerContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  statusText: {
    fontSize: 13,
    fontWeight: "500",
  },
});

