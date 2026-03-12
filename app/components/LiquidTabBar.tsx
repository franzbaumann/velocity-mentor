import { BlurView } from "expo-blur";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import React, { useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { PanGestureHandler } from "react-native-gesture-handler";
import { useTheme } from "../context/ThemeContext";

const PRIMARY_ROUTES = ["Dashboard", "Plan", "Coach", "ActivitiesStack", "Stats"] as const;
const SECONDARY_ROUTES = ["Settings", "Philosophy"] as const;

type RouteKey = (typeof PRIMARY_ROUTES)[number] | (typeof SECONDARY_ROUTES)[number];

const LABELS: Record<RouteKey, string> = {
  Dashboard: "Home",
  Plan: "Plan",
  Coach: "Coach",
  ActivitiesStack: "Activities",
  Stats: "Stats",
  Settings: "Settings",
  Philosophy: "Philosophy",
};

const ICONS: Record<RouteKey, keyof typeof Ionicons.glyphMap> = {
  Dashboard: "home",
  Plan: "calendar",
  Coach: "chatbubble-ellipses",
  ActivitiesStack: "fitness",
  Stats: "stats-chart-outline",
  Settings: "settings",
  Philosophy: "book",
};

export function LiquidTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const [showSecondary, setShowSecondary] = useState(false);
  const { resolved, theme } = useTheme();
  const insets = useSafeAreaInsets();
  const isDark = resolved === "dark";
  const borderColor = theme.navBorder;
  const pillBg = theme.navBackground;
  const activeIconColor = theme.navIconActive;
  const inactiveIconColor = theme.navIconInactive;

  const primaryRoutes = useMemo(
    () =>
      PRIMARY_ROUTES.map((key) => {
        const index = state.routes.findIndex((r) => r.name === key);
        if (index === -1) return null;
        return { key, index };
      }).filter(Boolean) as { key: RouteKey; index: number }[],
    [state.routes],
  );

  const goToOffset = (offset: number) => {
    const total = state.routes.length;
    if (total === 0) return;
    const nextIndex = (state.index + offset + total) % total;
    const nextRoute = state.routes[nextIndex];
    navigation.navigate(nextRoute.name as never);
  };

  const handleSwipeEnd = (event: any) => {
    const { translationX, velocityX } = event.nativeEvent;
    if (Math.abs(translationX) < 40 || Math.abs(velocityX) < 200) return;
    if (translationX < 0) {
      goToOffset(1);
    } else {
      goToOffset(-1);
    }
  };

  const handlePress = (routeIndex: number) => {
    const route = state.routes[routeIndex];
    const event = navigation.emit({
      type: "tabPress",
      target: route.key,
      canPreventDefault: true,
    });

    if (!event.defaultPrevented) {
      navigation.navigate(route.name as never);
    }
  };

  const handleLongPress = (routeIndex: number) => {
    const route = state.routes[routeIndex];
    navigation.emit({
      type: "tabLongPress",
      target: route.key,
    });
  };

  const isHidden = (() => {
    const focusedRoute = state.routes[state.index];
    const options = descriptors[focusedRoute.key]?.options;
    // React Navigation flattar ner tabBarStyle.display åt oss
    const displayStyle = (options?.tabBarStyle as any)?.display;
    const tabBarVisible = (options as any)?.tabBarVisible;
    return displayStyle === "none" || tabBarVisible === false;
  })();

  if (isHidden) {
    return null;
  }

  return (
    <PanGestureHandler onEnded={handleSwipeEnd}>
      <View style={[styles.root, { paddingBottom: insets.bottom + 8 }]}>
        <View style={styles.row}>
          <View style={[styles.pill, { borderColor, backgroundColor: pillBg }]}>
            <BlurView intensity={20} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
            <View style={styles.pillContent}>
              {primaryRoutes.map(({ key, index }) => {
                const isFocused = state.index === index;
                return (
                  <Pressable
                    key={key}
                    onPress={() => handlePress(index)}
                    onLongPress={() => setShowSecondary((prev) => !prev)}
                    style={({ pressed }) => [
                      styles.item,
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Ionicons
                      name={ICONS[key]}
                      size={22}
                      color={isFocused ? activeIconColor : inactiveIconColor}
                    />
                    <Text
                      style={[
                        styles.label,
                        {
                          color: isFocused ? activeIconColor : inactiveIconColor,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {LABELS[key]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        {showSecondary && (
        <View style={[styles.secondaryContainer, { bottom: insets.bottom + 72 }]}>
          {SECONDARY_ROUTES.map((key) => {
            const index = state.routes.findIndex((r) => r.name === key);
            if (index === -1) return null;
            const isFocused = state.index === index;
            return (
              <View key={key} style={styles.secondaryRow}>
                <Pressable
                  onPress={() => handlePress(index)}
                  onLongPress={() => handleLongPress(index)}
                  style={({ pressed }) => [
                    styles.secondaryBubble,
                    { borderColor, backgroundColor: pillBg },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <BlurView
                    intensity={22}
                    tint={isDark ? "dark" : "light"}
                    style={StyleSheet.absoluteFill}
                  />
                  <Ionicons
                    name={ICONS[key]}
                    size={18}
                    color={isFocused ? activeIconColor : inactiveIconColor}
                  />
                </Pressable>
                <Text
                  style={[
                    styles.secondaryLabel,
                    {
                      color: isFocused ? activeIconColor : inactiveIconColor,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {LABELS[key]}
                </Text>
              </View>
            );
          })}
        </View>
        )}
      </View>
    </PanGestureHandler>
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  pill: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  pillContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 12,
  },
  item: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 64,
    gap: 2,
  },
  label: {
    fontSize: 11,
    fontWeight: "500",
  },
  searchButton: {
    marginLeft: 10,
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryContainer: {
    position: "absolute",
    right: 16,
    alignItems: "center",
  },
  secondaryRow: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  secondaryBubble: {
    alignItems: "center",
    justifyContent: "center",
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  secondaryLabel: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "500",
  },
});

