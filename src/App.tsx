import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/useTheme";
import { SidebarProvider } from "@/components/SidebarContext";
import { DailyCheckInProvider } from "@/components/DailyCheckInContext";
import { IntervalsAutoSync } from "@/components/IntervalsAutoSync";
import { useIntervalsIntegration } from "@/hooks/useIntervalsIntegration";
import { useVitalIntegration } from "@/hooks/useVitalIntegration";
import { useAthleteProfile } from "@/hooks/useAthleteProfile";
import { IntervalsSetupGuide } from "@/components/onboarding/IntervalsSetupGuide";
import Index from "./pages/Index";
import SetUsername from "./pages/SetUsername";
import LandingPage from "./pages/LandingPage";
import TrainingPlan from "./pages/TrainingPlan";
import Activities from "./pages/Activities";
import SettingsPage from "./pages/SettingsPage";
import Philosophy from "./pages/Philosophy";
import AuthPage from "./pages/AuthPage";
import ContactPage from "./pages/ContactPage";
import PrivacyPage from "./pages/PrivacyPage";
import TermsPage from "./pages/TermsPage";
import PricingPage from "./pages/PricingPage";
import StravaCallback from "./pages/StravaCallback";
import VitalCallback from "./pages/VitalCallback";
import NotFound from "./pages/NotFound";

// Chart-heavy pages: lazy load to avoid Recharts/ResizeObserver issues on initial hydration
const ActivityDetail = lazy(() => import("./pages/ActivityDetail"));
const Coach = lazy(() => import("./pages/Coach"));
const Stats = lazy(() => import("./pages/Stats"));
const Season = lazy(() => import("./pages/Season"));
const Community = lazy(() => import("./pages/Community"));
const FriendProfile = lazy(() => import("./pages/FriendProfile"));

const queryClient = new QueryClient();

function ThemeInit() {
  useTheme();
  return null;
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { integration, isLoading: integrationLoading } = useIntervalsIntegration();
  const { isConnected: vitalConnected, isLoading: vitalLoading } = useVitalIntegration();
  const { data: profile, isLoading: profileLoading } = useAthleteProfile();
  const location = useLocation();
  const onSetUsername = location.pathname === "/set-username";
  const onSetup = location.pathname === "/setup";
  const onSettings = location.pathname === "/settings";
  const hasDataSource = !!integration || vitalConnected;

  if (loading || integrationLoading || vitalLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" style={{ borderColor: "hsl(211 100% 52%)", borderTopColor: "transparent" }} />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;

  if (!hasDataSource && !onSetup && !onSettings) {
    return <Navigate to="/setup" replace />;
  }

  if (!onSetUsername && !profileLoading && profile && (profile.username == null || profile.username === "")) {
    return <Navigate to="/set-username" replace />;
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
  const { isConnected: vitalConnected, isLoading: vitalLoading } = useVitalIntegration();
  const { data: profile, isLoading: profileLoading } = useAthleteProfile();
  const hasDataSource = !!integration || vitalConnected;
  if (loading || (user && (integrationLoading || vitalLoading))) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" style={{ borderColor: "hsl(211 100% 52%)", borderTopColor: "transparent" }} />
      </div>
    );
  }
  if (user) {
    if (!hasDataSource) return <Navigate to="/setup" replace />;
    if (!profileLoading && profile && (profile.username == null || profile.username === "")) {
      return <Navigate to="/set-username" replace />;
    }
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
        <DailyCheckInProvider>
        <Suspense fallback={
            <div className="min-h-screen bg-background flex items-center justify-center">
              <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" style={{ borderColor: "hsl(211 100% 52%)", borderTopColor: "transparent" }} />
            </div>
          }>
          <Routes>
          <Route path="/sign-in" element={<Navigate to="/auth" replace />} />
          <Route path="/dashboard" element={<Navigate to="/" replace />} />
          <Route path="/app" element={<Navigate to="/" replace />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/auth/strava/callback" element={<StravaCallback />} />
          <Route path="/auth/vital/callback" element={<VitalCallback />} />
          <Route path="/set-username" element={<AuthGuard><SetUsername /></AuthGuard>} />
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
            path="/season"
            element={
              <AuthGuard>
                <Season />
              </AuthGuard>
            }
          />
          <Route
            path="/community"
            element={
              <AuthGuard>
                <Community />
              </AuthGuard>
            }
          />
          <Route
            path="/community/profile/:userId"
            element={
              <AuthGuard>
                <FriendProfile />
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
        </DailyCheckInProvider>
        </SidebarProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
