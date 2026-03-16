import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import React, { useCallback, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Pressable, StyleSheet, Text, TouchableWithoutFeedback, View } from "react-native";
import Animated, { useAnimatedStyle, withSpring, withTiming } from "react-native-reanimated";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";

const MAIN_ROUTES = ["Dashboard", "Plan", "Coach", "Community", "ActivitiesStack"] as const;
const SECONDARY_ROUTES = ["Stats", "Settings", "Philosophy", "Season"] as const;

type MainRouteKey = (typeof MAIN_ROUTES)[number];
type SecondaryRouteKey = (typeof SECONDARY_ROUTES)[number];

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Dashboard: "home",
  Plan: "calendar",
  Coach: "chatbubble-ellipses",
  Community: "globe-outline",
  ActivitiesStack: "fitness",
  Stats: "stats-chart-outline",
  Settings: "settings",
  Philosophy: "book",
  Season: "trophy-outline",
};

const ACTIVE_COLOR = "#1C1C1E";
const INACTIVE_COLOR = "#9CA3AF";

export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const [isExpanded, setIsExpanded] = useState(false);

  const primaryRoutes = useMemo(
    () =>
      MAIN_ROUTES.map((key) => {
        const index = state.routes.findIndex((r) => r.name === key);
        if (index === -1) return null;
        return { key, index };
      }).filter(Boolean) as { key: MainRouteKey; index: number }[],
    [state.routes],
  );

  const secondaryRoutes = useMemo(
    () =>
      SECONDARY_ROUTES.map((key) => {
        const index = state.routes.findIndex((r) => r.name === key);
        if (index === -1) return null;
        return { key, index };
      }).filter(Boolean) as { key: SecondaryRouteKey; index: number }[],
    [state.routes],
  );

  const isHidden = (() => {
    const focusedRoute = state.routes[state.index];
    const options = descriptors[focusedRoute.key]?.options;
    const style = (options?.tabBarStyle ?? undefined) as any;
    let displayStyle: string | undefined;
    if (Array.isArray(style)) {
      // React Navigation may pass tabBarStyle as an array of style objects
      if (style.some((s) => s && s.display === "none")) {
        displayStyle = "none";
      }
    } else {
      displayStyle = style?.display;
    }
    const tabBarVisible = (options as any)?.tabBarVisible;
    return displayStyle === "none" || tabBarVisible === false;
  })();

  const toggleDrawer = useCallback(() => {
    setIsExpanded((prev) => !prev);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);

  const closeDrawer = useCallback(() => {
    if (isExpanded) setIsExpanded(false);
  }, [isExpanded]);

  const drawerStyle = useAnimatedStyle(() => ({
    opacity: withTiming(isExpanded ? 1 : 0, { duration: 180 }),
    transform: [{ translateY: withSpring(isExpanded ? 0 : 10, { damping: 16, stiffness: 120 }) }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: withTiming(isExpanded ? 0 : 0, { duration: 180 }),
  }));

  const handleTabPress = useCallback(
    (routeIndex: number, extra?: { screen?: string }) => {
      const route = state.routes[routeIndex];
      const isFocused = state.index === routeIndex;

      const event = navigation.emit({
        type: "tabPress",
        target: route.key,
        canPreventDefault: true,
      });

      if (!isFocused && !event.defaultPrevented) {
        if (extra?.screen) {
          navigation.navigate(route.name as never, { screen: extra.screen } as never);
        } else {
          navigation.navigate(route.name as never);
        }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }

      setIsExpanded(false);
    },
    [state, navigation],
  );

  if (isHidden) return null;

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom + 8 }]} pointerEvents="box-none">

      {secondaryRoutes.length > 0 && (
        <Animated.View
          style={[styles.drawerWrapper, drawerStyle]}
          pointerEvents={isExpanded ? "auto" : "none"}
        >
          <BlurView intensity={50} tint="light" style={StyleSheet.absoluteFill} />
          <View style={styles.drawerInner}>
            {secondaryRoutes.map(({ key, index }) => (
              <Pressable
                key={key}
                onPress={() =>
                  handleTabPress(
                    key === "Season" ? state.routes.findIndex((r) => r.name === "Plan") : index,
                    key === "Season" ? { screen: "Season" } : undefined,
                  )
                }
                style={({ pressed }) => [styles.secondaryItem, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name={ICONS[key]} size={20} color={ACTIVE_COLOR} />
                <Text style={styles.secondaryLabel}>{key}</Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      )}

      <View style={styles.barWrapper}>
        <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
        <View style={styles.barInner}>
          {primaryRoutes.map(({ key, index }) => {
            const isFocused = state.index === index;
            const content = (
              <>
                <Ionicons
                  name={ICONS[key]}
                  size={isFocused ? 24 : 22}
                  color={isFocused ? ACTIVE_COLOR : INACTIVE_COLOR}
                />
                <Text
                  style={[
                    styles.label,
                    {
                      color: isFocused ? ACTIVE_COLOR : INACTIVE_COLOR,
                      fontWeight: isFocused ? "600" : "400",
                    },
                  ]}
                  numberOfLines={1}
                >
                  {key === "Dashboard" ? "Home" : key === "ActivitiesStack" ? "Activities" : key}
                </Text>
              </>
            );
            return (
              <Pressable
                key={key}
                onPress={() => handleTabPress(index)}
                onLongPress={toggleDrawer}
                delayLongPress={300}
                style={({ pressed }) => [styles.mainItem, pressed && { opacity: 0.75 }]}
              >
                {isFocused ? <View style={styles.activePill}>{content}</View> : content}
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
  },
  barWrapper: {
    width: "88%",
    maxWidth: 360,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.35)",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.8)",
  },
  barInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  mainItem: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 48,
    gap: 2,
    paddingVertical: 2,
  },
  activePill: {
    backgroundColor: "#F3F4F6",
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 10,
    alignItems: "center",
    shadowColor: "transparent",
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  label: {
    fontSize: 9,
  },
  moreBtn: {
    alignItems: "center",
    justifyContent: "center",
  },
  drawerWrapper: {
    width: "82%",
    maxWidth: 340,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.22)",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.7)",
    marginBottom: 8,
  },
  drawerInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  secondaryItem: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingVertical: 2,
    paddingHorizontal: 10,
  },
  secondaryLabel: {
    fontSize: 9,
    fontWeight: "500",
    color: "#111827",
  },
});
