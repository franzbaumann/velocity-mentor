import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SupabaseProvider } from "./SupabaseProvider";
import { RootNavigator } from "./navigation/RootNavigator";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <SupabaseProvider>
          <RootNavigator />
        </SupabaseProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
