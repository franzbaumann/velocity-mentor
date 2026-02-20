import { AppLayout } from "@/components/AppLayout";
import { Settings as SettingsIcon } from "lucide-react";

export default function SettingsPage() {
  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>

        <div className="space-y-4">
          {/* Connected Accounts */}
          <div className="glass-card p-5">
            <p className="section-header">Connected Accounts</p>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                    <span className="text-xs font-semibold text-muted-foreground">G</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Garmin Connect</p>
                    <p className="text-xs text-muted-foreground">Not connected</p>
                  </div>
                </div>
                <button className="pill-button bg-primary text-primary-foreground text-xs">
                  Connect
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                    <span className="text-xs font-semibold text-muted-foreground">S</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Strava</p>
                    <p className="text-xs text-muted-foreground">Not connected</p>
                  </div>
                </div>
                <button className="pill-button bg-primary text-primary-foreground text-xs">
                  Connect
                </button>
              </div>
            </div>
          </div>

          {/* Training Preferences */}
          <div className="glass-card p-5">
            <p className="section-header">Training Preferences</p>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Philosophy</span>
                <span className="font-medium text-foreground">Jack Daniels</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Units</span>
                <span className="font-medium text-foreground">Kilometers</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Long run day</span>
                <span className="font-medium text-foreground">Saturday</span>
              </div>
            </div>
          </div>

          {/* Notifications */}
          <div className="glass-card p-5">
            <p className="section-header">Notifications</p>
            <div className="space-y-3 text-sm">
              {["Coach nudges", "Daily readiness summary", "Pre-workout reminder"].map((item) => (
                <div key={item} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{item}</span>
                  <div className="w-10 h-6 bg-primary rounded-full relative cursor-pointer">
                    <div className="absolute right-0.5 top-0.5 w-5 h-5 bg-primary-foreground rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
