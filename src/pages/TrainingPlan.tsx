import { AppLayout } from "@/components/AppLayout";
import { Calendar } from "lucide-react";

export default function TrainingPlan() {
  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <h1 className="text-2xl font-semibold text-foreground">Training Plan</h1>
        <div className="glass-card p-12 text-center">
          <Calendar className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-medium text-foreground mb-2">Your plan is being built</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Connect your Garmin or Strava account to generate a personalized training plan based on your fitness data and race goals.
          </p>
          <button className="pill-button bg-primary text-primary-foreground mt-6">
            Connect Data Source
          </button>
        </div>
      </div>
    </AppLayout>
  );
}
