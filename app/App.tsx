import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Toast, { BaseToast, SuccessToast } from "react-native-toast-message";
import { ThemeProvider } from "./context/ThemeContext";
import { SupabaseProvider } from "./SupabaseProvider";
import { OnboardingProvider } from "./hooks/useOnboardingStatus";
import { RootNavigator } from "./navigation/RootNavigator";

const queryClient = new QueryClient();

const toastConfig = {
  success: (props: any) => (
    <SuccessToast
      {...props}
      style={{ backgroundColor: "#22c55e" }}
      contentContainerStyle={{ backgroundColor: "#22c55e" }}
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
