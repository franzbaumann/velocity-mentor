import { AppLayout } from "@/components/AppLayout";
import { useIntervalsId } from "@/hooks/useIntervalsId";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

export default function SettingsPage() {
  const { athleteId, saveAthleteId } = useIntervalsId();
  const [draft, setDraft] = useState(athleteId);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    saveAthleteId(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>

        <div className="space-y-4">
          {/* intervals.icu */}
          <div className="glass-card p-5">
            <p className="section-header">intervals.icu</p>
            <p className="text-sm text-muted-foreground mb-3">
              Paste your Athlete ID from{" "}
              <a
                href="https://intervals.icu/settings"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                intervals.icu → Settings
              </a>{" "}
              to see fitness charts on the Stats page.
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. i12345"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="max-w-xs bg-secondary/50"
              />
              <Button onClick={handleSave} size="sm" className="rounded-full px-5">
                {saved ? <><Check className="w-4 h-4 mr-1" /> Saved</> : "Save"}
              </Button>
            </div>
          </div>

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
