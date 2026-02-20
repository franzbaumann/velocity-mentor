import { AppLayout } from "@/components/AppLayout";
import { Activity } from "lucide-react";

export default function Activities() {
  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <h1 className="text-2xl font-semibold text-foreground">Activities</h1>
        <div className="glass-card p-12 text-center">
          <Activity className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-medium text-foreground mb-2">No activities yet</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Your runs from Garmin and Strava will appear here with detailed splits, HR analysis, and AI-powered coaching insights.
          </p>
          <button className="pill-button bg-primary text-primary-foreground mt-6">
            Connect Garmin or Strava
          </button>
        </div>
      </div>
    </AppLayout>
  );
}
