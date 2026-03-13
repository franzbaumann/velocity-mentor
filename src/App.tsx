import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/useTheme";
import { SidebarProvider } from "@/components/SidebarContext";
import { IntervalsAutoSync } from "@/components/IntervalsAutoSync";
import { useIntervalsIntegration } from "@/hooks/useIntervalsIntegration";
import { IntervalsSetupGuide } from "@/components/onboarding/IntervalsSetupGuide";
import Index from "./pages/Index";
import LandingPage from "./pages/LandingPage";
import TrainingPlan from "./pages/TrainingPlan";
import Activities from "./pages/Activities";
import SettingsPage from "./pages/SettingsPage";
import Philosophy from "./pages/Philosophy";
import AuthPage from "./pages/AuthPage";
import StravaCallback from "./pages/StravaCallback";
import NotFound from "./pages/NotFound";

// Chart-heavy pages: lazy load to avoid Recharts/ResizeObserver issues on initial hydration
const ActivityDetail = lazy(() => import("./pages/ActivityDetail"));
const Coach = lazy(() => import("./pages/Coach"));
const Stats = lazy(() => import("./pages/Stats"));

const queryClient = new QueryClient();

function ThemeInit() {
  useTheme();
  return null;
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { integration, isLoading: integrationLoading } = useIntervalsIntegration();
  const location = useLocation();

  if (loading || integrationLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;

  // Redirect to setup if intervals.icu is not connected, unless already there
  const onSetup = location.pathname === "/setup";
  if (!integration && !onSetup) {
    return <Navigate to="/setup" replace />;
  }

  return (
    <>
      <IntervalsAutoSync />
      {children}
    </>
  );
}

function LandingOrDashboard() {
  const { user, loading } = useAuth();
  const { integration, isLoading: integrationLoading } = useIntervalsIntegration();
  if (loading || (user && integrationLoading)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }
  if (user) {
    if (!integration) return <Navigate to="/setup" replace />;
    return (
      <>
        <IntervalsAutoSync />
        <Index />
      </>
    );
  }
  return <LandingPage />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <ThemeInit />
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <SidebarProvider>
        <Suspense fallback={
            <div className="min-h-screen bg-background flex items-center justify-center">
              <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          }>
          <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/auth/strava/callback" element={<StravaCallback />} />
          <Route path="/setup" element={<AuthGuard><IntervalsSetupGuide /></AuthGuard>} />
          <Route path="/" element={<LandingOrDashboard />} />
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
        </Suspense>
        </SidebarProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
