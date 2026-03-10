import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { AuthScreen } from "../screens/AuthScreen";
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
    </AuthStack.Navigator>
  );
}

function ActivitiesStackNavigator() {
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
          headerStyle: { backgroundColor: "#0f172a" },
          headerTintColor: "#f3f4f6",
          headerShadowVisible: false,
        }}
      />
    </ActivitiesStack.Navigator>
  );
}

import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

const Tabs = createBottomTabNavigator<AppTabsParamList>();

function AppTabsNavigator() {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#0f172a",
          borderTopColor: "rgba(255,255,255,0.08)",
        },
        tabBarActiveTintColor: "#f3f4f6",
        tabBarInactiveTintColor: "#6b7280",
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
  const isAuthenticated = !!user || devBypass;

  if (loading) {
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator size="small" color="#3b82f6" />
        <Text style={styles.loadingText}>Loading your session…</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <NavigationContainer>
        <StatusBar style="light" />
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
  root: {
    flex: 1,
    backgroundColor: "#020617",
  },
  loadingRoot: {
    flex: 1,
    backgroundColor: "#020617",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 8,
    color: "#9ca3af",
    fontSize: 13,
  },
});

