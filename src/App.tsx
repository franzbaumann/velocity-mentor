import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/useTheme";
import { SidebarProvider } from "@/components/SidebarContext";
import Index from "./pages/Index";
import TrainingPlan from "./pages/TrainingPlan";
import Activities from "./pages/Activities";
import ActivityDetail from "./pages/ActivityDetail";
import Coach from "./pages/Coach";
import Stats from "./pages/Stats";
import SettingsPage from "./pages/SettingsPage";
import Philosophy from "./pages/Philosophy";
import AuthPage from "./pages/AuthPage";
import StravaCallback from "./pages/StravaCallback";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ThemeInit() {
  useTheme();
  return null;
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <ThemeInit />
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <SidebarProvider>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/auth/strava/callback" element={<StravaCallback />} />
          <Route
            path="/"
            element={
              <AuthGuard>
                <Index />
              </AuthGuard>
            }
          />
          <Route
            path="/plan"
            element={
              <AuthGuard>
                <TrainingPlan />
              </AuthGuard>
            }
          />
          <Route
            path="/activities"
            element={
              <AuthGuard>
                <Activities />
              </AuthGuard>
            }
          />
          <Route
            path="/activities/:id"
            element={
              <AuthGuard>
                <ActivityDetail />
              </AuthGuard>
            }
          />
          <Route
            path="/coach"
            element={
              <AuthGuard>
                <Coach />
              </AuthGuard>
            }
          />
          <Route
            path="/stats"
            element={
              <AuthGuard>
                <Stats />
              </AuthGuard>
            }
          />
          <Route
            path="/philosophy"
            element={
              <AuthGuard>
                <Philosophy />
              </AuthGuard>
            }
          />
          <Route
            path="/settings"
            element={
              <AuthGuard>
                <SettingsPage />
              </AuthGuard>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
        </SidebarProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
