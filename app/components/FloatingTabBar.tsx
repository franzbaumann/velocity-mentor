import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import React, { useCallback, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, withSpring, withTiming } from "react-native-reanimated";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { useTheme } from "../context/ThemeContext";
import { usePendingInvitesCount } from "../hooks/useCommunity";

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

export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { theme, resolved } = useTheme();
  const isDark = resolved === "dark";
  const ACTIVE_COLOR = theme.textPrimary;
  const INACTIVE_COLOR = theme.textMuted;
  const { data: pendingInvitesCount = 0 } = usePendingInvitesCount();
  const communityBadgeLabel = pendingInvitesCount > 99 ? "99+" : String(pendingInvitesCount);
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
    opacity: withTiming(isExpanded ? 0.3 : 0, { duration: 180 }),
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
    <View style={[styles.root, { paddingBottom: insets.bottom + 4 }]} pointerEvents="box-none">

      {secondaryRoutes.length > 0 && (
        <Animated.View
          style={[
            styles.drawerWrapper,
            isDark && { backgroundColor: "rgba(18,18,18,0.7)", borderColor: "rgba(255,255,255,0.08)" },
            drawerStyle,
          ]}
          pointerEvents={isExpanded ? "auto" : "none"}
        >
          <BlurView intensity={30} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
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
                <Ionicons name={ICONS[key]} size={20} color={theme.textPrimary} />
                <Text style={[styles.secondaryLabel, { color: theme.textPrimary }]}>{key}</Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      )}

      <View
        style={[
          styles.barWrapper,
          isDark && { backgroundColor: "rgba(18,18,18,0.7)", borderColor: "rgba(255,255,255,0.08)" },
        ]}
      >
        <BlurView intensity={26} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
        <View style={styles.barInner}>
          {primaryRoutes.map(({ key, index }) => {
            const isFocused = state.index === index;
            const showCommunityBadge = key === "Community" && pendingInvitesCount > 0;
            const content = (
              <>
                <View style={{ position: "relative" }}>
                  <Ionicons
                    name={ICONS[key]}
                    size={isFocused ? 24 : 22}
                    color={isFocused ? ACTIVE_COLOR : INACTIVE_COLOR}
                  />
                  {showCommunityBadge && (
                    <View style={[styles.iconBadge, { backgroundColor: theme.accentRed }]}>
                      <Text style={styles.iconBadgeText}>{communityBadgeLabel}</Text>
                    </View>
                  )}
                </View>
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
                {isFocused ? <View style={[styles.activePill, { backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "#F3F4F6" }]}>{content}</View> : content}
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
    width: "84%",
    maxWidth: 340,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.25)",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.65)",
  },
  barInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  mainItem: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 44,
    gap: 2,
    paddingVertical: 1,
  },
  activePill: {
    backgroundColor: "#F3F4F6",
    borderRadius: 9,
    paddingVertical: 3,
    paddingHorizontal: 9,
    alignItems: "center",
    shadowColor: "transparent",
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  label: {
    fontSize: 8.5,
  },
  iconBadge: {
    position: "absolute",
    top: -6,
    right: -10,
    minWidth: 14,
    height: 14,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  iconBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#fff",
  },
  moreBtn: {
    alignItems: "center",
    justifyContent: "center",
  },
  drawerWrapper: {
    width: "80%",
    maxWidth: 330,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.6)",
    marginBottom: 6,
  },
  drawerInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 12,
    paddingVertical: 4,
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
