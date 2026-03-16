import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import React, { useMemo } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { PanGestureHandler } from "react-native-gesture-handler";

const PRIMARY_ROUTES = ["Dashboard", "Plan", "Coach", "Community", "ActivitiesStack", "Stats"] as const;

type RouteKey = (typeof PRIMARY_ROUTES)[number];

const LABELS: Record<RouteKey, string> = {
  Dashboard: "Home",
  Plan: "Plan",
  Coach: "Coach",
  Community: "Community",
  ActivitiesStack: "Activities",
  Stats: "Stats",
};

const ICONS: Record<RouteKey, keyof typeof Ionicons.glyphMap> = {
  Dashboard: "home",
  Plan: "calendar",
  Coach: "chatbubble-ellipses",
  Community: "globe-outline",
  ActivitiesStack: "fitness",
  Stats: "stats-chart-outline",
};

export function LiquidTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  const ACTIVE_COLOR = "#1C1C1E";
  const INACTIVE_COLOR = "#9CA3AF";

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
      <View
        style={[
          styles.root,
          {
            paddingBottom: insets.bottom,
          },
        ]}
      >
        <View
          style={[
            styles.bar,
            {
              shadowColor: "#000",
              shadowOffset: { width: 0, height: -2 },
              shadowOpacity: 0.06,
              shadowRadius: 8,
            },
          ]}
        >
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
                    {LABELS[key]}
                  </Text>
                </>
              );
              return (
                <Pressable
                  key={key}
                  onPress={() => handlePress(index)}
                  onLongPress={() => handleLongPress(index)}
                  style={({ pressed }) => [
                    styles.item,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  {isFocused ? <View style={styles.activePill}>{content}</View> : content}
                </Pressable>
              );
            })}
          </View>
        </View>
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
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderTopWidth: 0.5,
    borderTopColor: "#E5E7EB",
    paddingHorizontal: 12,
    paddingTop: 6,
  },
  barInner: {
    flexDirection: "row",
    flex: 1,
    alignItems: "center",
    justifyContent: "space-around",
  },
  item: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 64,
    gap: 3,
    paddingVertical: 8,
  },
  activePill: {
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  label: {
    fontSize: 11,
  },
});

