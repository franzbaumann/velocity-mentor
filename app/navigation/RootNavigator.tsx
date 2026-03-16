import { NavigationContainer, useNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, StyleSheet, Text, View, TouchableOpacity } from "react-native";
import { useCallback, useRef } from "react";
import { useTheme } from "../context/ThemeContext";
import { AuthScreen } from "../screens/AuthScreen";
import { PricingScreen } from "../screens/PricingScreen";
import { DashboardScreen } from "../screens/DashboardScreen";
import { CalendarScreen } from "../screens/CalendarScreen";
import { ActivitiesScreen } from "../screens/ActivitiesScreen";
import { ActivityDetailScreen } from "../screens/ActivityDetailScreen";
import { TrainingPlanScreen } from "../screens/TrainingPlanScreen";
import { PlanOnboardingScreen } from "../screens/PlanOnboardingScreen";
import { PlanReadyScreen } from "../screens/PlanReadyScreen";
import { CoachScreen } from "../screens/CoachScreen";
import { StatsScreen } from "../screens/StatsScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { PhilosophyScreen } from "../screens/PhilosophyScreen";
import { StravaCallbackScreen } from "../screens/StravaCallbackScreen";
import { SeasonScreen } from "../screens/SeasonScreen";
import { SeasonWizardScreen } from "../screens/SeasonWizardScreen";
import { SeasonViewScreen } from "../screens/SeasonViewScreen";
import { useSupabaseAuth } from "../SupabaseProvider";
import { useOnboardingStatus } from "../hooks/useOnboardingStatus";
import { TutorialNavigator } from "../tutorial/TutorialNavigator";
import { CommunityScreen, COMMUNITY_ENABLED } from "../screens/CommunityScreen";
import { FriendActivityDetailScreen, type FriendActivityParams } from "../screens/FriendActivityDetailScreen";
import { ActivityPostScreen, type ActivityPostParams } from "../screens/ActivityPostScreen";
import { useDailyStreak } from "../hooks/useDailyStreak";

export type AuthStackParamList = {
  Auth: undefined;
  StravaCallback: undefined;
  Pricing: undefined;
};

export type ActivitiesStackParamList = {
  ActivitiesList: undefined;
  ActivityDetail: { id: string; openEditSheet?: boolean };
};

export type PlanStackParamList = {
  PlanOnboarding: { mode?: "rebuild" } | undefined;
  PlanReady: undefined;
  PlanMain: undefined;
  Season: undefined;
  SeasonWizard: undefined;
  SeasonView: { seasonId: string };
};

export type AppTabsParamList = {
  Dashboard: { selectedDate?: string } | undefined;
  Plan: undefined;
  Coach: undefined;
  Community: undefined;
  ActivitiesStack: undefined;
  Stats: undefined;
  Settings: undefined;
  Philosophy: undefined;
};

export type RootStackParamList = {
  AuthStack: undefined;
  AppTabs: undefined;
  Calendar: { selectedDate?: string } | undefined;
  FriendActivityDetail: FriendActivityParams;
  ActivityPost: ActivityPostParams;
};

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const ActivitiesStack = createNativeStackNavigator<ActivitiesStackParamList>();
const PlanStack = createNativeStackNavigator<PlanStackParamList>();

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
  const { theme } = useTheme();
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
        options={({ navigation }) => ({
          headerShown: true,
          headerTitle: "Activity",
          headerBackTitle: "Activities",
          headerStyle: { backgroundColor: theme.appBackground },
          headerTintColor: theme.textPrimary,
          headerShadowVisible: false,
          headerRight: () => (
            <TouchableOpacity
              onPress={() => navigation.getParent()?.navigate("Settings")}
              style={{ paddingHorizontal: 4, paddingVertical: 2 }}
              activeOpacity={0.7}
            >
              <Ionicons name="settings-outline" size={20} color={theme.textPrimary} />
            </TouchableOpacity>
          ),
        })}
      />
    </ActivitiesStack.Navigator>
  );
}

function PlanStackNavigator() {
  return (
    <PlanStack.Navigator
      screenOptions={{
        headerShown: false,
      }}
      initialRouteName="PlanMain"
    >
      <PlanStack.Screen name="PlanOnboarding" component={PlanOnboardingScreen} />
      <PlanStack.Screen name="PlanReady" component={PlanReadyScreen} />
      <PlanStack.Screen name="PlanMain" component={TrainingPlanScreen} />
      <PlanStack.Screen name="Season" component={SeasonScreen} />
      <PlanStack.Screen name="SeasonWizard" component={SeasonWizardScreen} />
      <PlanStack.Screen name="SeasonView" component={SeasonViewScreen} />
    </PlanStack.Navigator>
  );
}

import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { getFocusedRouteNameFromRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FloatingTabBar } from "../components/FloatingTabBar";

const Tabs = createBottomTabNavigator<AppTabsParamList>();
const TAB_BAR_HEIGHT = 56;

function AppTabsNavigator() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const streak = useDailyStreak();
  return (
    <Tabs.Navigator
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={({ route }) => {
        let nestedRouteName = getFocusedRouteNameFromRoute(route);
        if (route.name === "Plan" && !nestedRouteName) {
          nestedRouteName = "PlanMain";
        }
        const hideTabBar = route.name === "Plan" && nestedRouteName === "PlanOnboarding";
        return {
          headerShown: false,
          tabBarStyle: {
            position: "absolute",
            backgroundColor: "transparent",
            borderTopWidth: 0,
            elevation: 0,
            shadowOpacity: 0,
            ...(hideTabBar ? { display: "none" } : {}),
          },
          sceneContainerStyle: {
            paddingBottom: hideTabBar ? 0 : insets.bottom + TAB_BAR_HEIGHT,
          },
          tabBarShowLabel: true,
        };
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
        component={PlanStackNavigator}
        options={{
          title: "Plan",
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="Coach"
        component={CoachScreen}
        options={{
          title: "Coach",
          tabBarIcon: ({ color, size }) => (
            <View style={{ position: "relative" }}>
              <Ionicons name="chatbubble-ellipses" size={size} color={color} />
              {streak.currentStreak > 7 && (
                <View
                  style={{
                    position: "absolute",
                    top: -2,
                    right: -6,
                    backgroundColor: theme.appBackground,
                    borderRadius: 999,
                    paddingHorizontal: 2,
                  }}
                >
                  <Ionicons name="flame-outline" size={10} color="#1C1C1E" />
                </View>
              )}
            </View>
          ),
        }}
      />
      {COMMUNITY_ENABLED && (
        <Tabs.Screen
          name="Community"
          component={CommunityScreen}
          options={{
            title: "Community",
            tabBarIcon: ({ color, size }) => <Ionicons name="globe-outline" size={size} color={color} />,
          }}
        />
      )}
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
  const { user, loading: authLoading, devBypass } = useSupabaseAuth();
  const { theme, resolved } = useTheme();
  const isAuthenticated = !!user || devBypass;
  const { status: onboardingStatus, completeTutorial } = useOnboardingStatus();

  const navRef = useNavigationContainerRef<any>();
  const pendingNavRef = useRef<"settings" | "plan" | null>(null);

  const handleNavigateAfter = useCallback(
    (target: "settings" | "plan" | "explore") => {
      if (target === "settings" || target === "plan") {
        pendingNavRef.current = target;
      }
    },
    [],
  );

  const onNavReady = useCallback(() => {
    const target = pendingNavRef.current;
    if (!target || !navRef.current) return;
    pendingNavRef.current = null;
    if (target === "settings") {
      navRef.current.navigate("Settings" as never);
    } else if (target === "plan") {
      navRef.current.navigate("Plan" as never);
    }
  }, [navRef]);

  if (authLoading) {
    return (
      <View style={[styles.loadingRoot, { backgroundColor: theme.appBackground }]}>
        <ActivityIndicator size="small" color={theme.accentBlue} />
        <Text style={[styles.loadingText, { color: theme.textMuted }]}>Loading your session…</Text>
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={[styles.root, { backgroundColor: theme.appBackground }]}>
        <NavigationContainer>
          <StatusBar style={resolved === "dark" ? "light" : "dark"} />
          <RootStack.Navigator screenOptions={{ headerShown: false }}>
            <RootStack.Screen name="AuthStack" component={AuthStackNavigator} />
          </RootStack.Navigator>
        </NavigationContainer>
      </View>
    );
  }

  if (onboardingStatus === "loading") {
    return (
      <View style={[styles.loadingRoot, { backgroundColor: theme.appBackground }]}>
        <StatusBar style={resolved === "dark" ? "light" : "dark"} />
        <ActivityIndicator size="small" color={theme.accentBlue} />
      </View>
    );
  }

  if (onboardingStatus === "new_user") {
    return (
      <View style={[styles.root, { backgroundColor: theme.appBackground }]}>
        <StatusBar style={resolved === "dark" ? "light" : "dark"} />
        <TutorialNavigator
          onComplete={completeTutorial}
          onNavigateAfter={handleNavigateAfter}
        />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.appBackground }]}>
      <NavigationContainer ref={navRef} onReady={onNavReady}>
        <StatusBar style={resolved === "dark" ? "light" : "dark"} />
        <RootStack.Navigator screenOptions={{ headerShown: false }}>
          <RootStack.Screen name="AppTabs" component={AppTabsNavigator} />
          <RootStack.Screen
            name="Calendar"
            component={CalendarScreen}
            options={{
              headerShown: true,
              headerTitle: "Calendar",
              presentation: "card",
            }}
          />
          <RootStack.Screen
            name="FriendActivityDetail"
            component={FriendActivityDetailScreen}
            options={{
              headerShown: true,
              headerTitle: "Activity",
              presentation: "card",
              headerStyle: { backgroundColor: theme.appBackground },
              headerTintColor: theme.textPrimary,
              headerShadowVisible: false,
            }}
          />
          <RootStack.Screen
            name="ActivityPost"
            component={ActivityPostScreen}
            options={{
              headerShown: true,
              headerTitle: "Your Post",
              presentation: "card",
              headerStyle: { backgroundColor: theme.appBackground },
              headerTintColor: theme.textPrimary,
              headerShadowVisible: false,
            }}
          />
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
