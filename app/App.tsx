import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Toast, { BaseToast, SuccessToast } from "react-native-toast-message";
import { ThemeProvider } from "./context/ThemeContext";
import { SupabaseProvider } from "./SupabaseProvider";
import { OnboardingProvider } from "./hooks/useOnboardingStatus";
import { RootNavigator } from "./navigation/RootNavigator";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});

const toastConfig = {
  success: (props: any) => (
    <BaseToast
      {...props}
      style={{
        backgroundColor: "#ffffff",
        borderLeftColor: "#000000",
        borderLeftWidth: 2,
        minHeight: 40,
      }}
      contentContainerStyle={{
        backgroundColor: "#ffffff",
        paddingVertical: 6,
      }}
      text1Style={{
        fontSize: 13,
        fontWeight: "600",
        color: "#111827",
      }}
      text2Style={{
        fontSize: 11,
        color: "#4b5563",
      }}
    />
  ),
  neutral: (props: any) => (
    <BaseToast
      {...props}
      style={{ backgroundColor: "#71717a" }}
      contentContainerStyle={{ backgroundColor: "#71717a" }}
    />
  ),
};

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <ThemeProvider>
            <SupabaseProvider>
              <OnboardingProvider>
                <RootNavigator />
              </OnboardingProvider>
              <Toast position="bottom" config={toastConfig} />
            </SupabaseProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
