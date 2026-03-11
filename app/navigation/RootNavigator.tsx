import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { AuthScreen } from "../screens/AuthScreen";
import { PricingScreen } from "../screens/PricingScreen";
import { DashboardScreen } from "../screens/DashboardScreen";
import { ActivitiesScreen } from "../screens/ActivitiesScreen";
import { ActivityDetailScreen } from "../screens/ActivityDetailScreen";
import { TrainingPlanScreen } from "../screens/TrainingPlanScreen";
import { CoachScreen } from "../screens/CoachScreen";
import { StatsScreen } from "../screens/StatsScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { PhilosophyScreen } from "../screens/PhilosophyScreen";
import { StravaCallbackScreen } from "../screens/StravaCallbackScreen";
import { useSupabaseAuth } from "../SupabaseProvider";

export type AuthStackParamList = {
  Auth: undefined;
  StravaCallback: undefined;
  Pricing: undefined;
};

export type ActivitiesStackParamList = {
  ActivitiesList: undefined;
  ActivityDetail: { id: string };
};

export type AppTabsParamList = {
  Dashboard: undefined;
  Plan: undefined;
  ActivitiesStack: undefined;
  Coach: undefined;
  Stats: undefined;
  Settings: undefined;
  Philosophy: undefined;
};

export type RootStackParamList = {
  AuthStack: undefined;
  AppTabs: undefined;
};

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const ActivitiesStack = createNativeStackNavigator<ActivitiesStackParamList>();

function AuthStackNavigator() {
  return (
    <AuthStack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <AuthStack.Screen name="Auth" component={AuthScreen} />
      <AuthStack.Screen name="StravaCallback" component={StravaCallbackScreen} />
      <AuthStack.Screen name="Pricing" component={PricingScreen} />
    </AuthStack.Navigator>
  );
}

function ActivitiesStackNavigator() {
  const { colors } = useTheme();
  return (
    <ActivitiesStack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <ActivitiesStack.Screen name="ActivitiesList" component={ActivitiesScreen} />
      <ActivitiesStack.Screen
        name="ActivityDetail"
        component={ActivityDetailScreen}
        options={{
          headerShown: true,
          headerTitle: "Activity",
          headerBackTitle: "Activities",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.foreground,
          headerShadowVisible: false,
        }}
      />
    </ActivitiesStack.Navigator>
  );
}

import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LiquidTabBar } from "../components/LiquidTabBar";

const Tabs = createBottomTabNavigator<AppTabsParamList>();
const TAB_BAR_HEIGHT = 56;

function AppTabsNavigator() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tabs.Navigator
      tabBar={(props) => <LiquidTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: "transparent",
          borderTopWidth: 0,
          elevation: 0,
          shadowOpacity: 0,
        },
        sceneContainerStyle: {
          paddingBottom: insets.bottom + TAB_BAR_HEIGHT,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarShowLabel: true,
      }}
    >
      <Tabs.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          title: "Dashboard",
          tabBarLabel: "Home",
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="Plan"
        component={TrainingPlanScreen}
        options={{
          title: "Plan",
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="ActivitiesStack"
        component={ActivitiesStackNavigator}
        options={{
          title: "Activities",
          tabBarLabel: "Activities",
          tabBarIcon: ({ color, size }) => <Ionicons name="fitness" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="Coach"
        component={CoachScreen}
        options={{
          title: "Coach",
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubble-ellipses" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="Stats"
        component={StatsScreen}
        options={{
          title: "Stats",
          tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => <Ionicons name="settings" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="Philosophy"
        component={PhilosophyScreen}
        options={{
          title: "Philosophy",
          tabBarIcon: ({ color, size }) => <Ionicons name="book" size={size} color={color} />,
        }}
      />
    </Tabs.Navigator>
  );
}

export function RootNavigator() {
  const { user, loading, devBypass } = useSupabaseAuth();
  const { colors, resolved } = useTheme();
  const isAuthenticated = !!user || devBypass;

  if (loading) {
    return (
      <View style={[styles.loadingRoot, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Loading your session…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <NavigationContainer>
        <StatusBar style={resolved === "dark" ? "light" : "dark"} />
        <RootStack.Navigator
          screenOptions={{
            headerShown: false,
          }}
        >
          {!isAuthenticated ? (
            <RootStack.Screen name="AuthStack" component={AuthStackNavigator} />
          ) : (
            <RootStack.Screen name="AppTabs" component={AppTabsNavigator} />
          )}
        </RootStack.Navigator>
      </NavigationContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loadingRoot: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { marginTop: 8, fontSize: 13 },
});

