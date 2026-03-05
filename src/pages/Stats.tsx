import { AppLayout } from "@/components/AppLayout";
import { useIntervalsId } from "@/hooks/useIntervalsId";
import { BarChart3, Link2, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

const charts = [
  {
    title: "Fitness & Fatigue (CTL / ATL / TSB)",
    path: "fitness",
  },
  {
    title: "Weekly Mileage",
    path: "weekly-distance",
  },
  {
    title: "Pace Trends",
    path: "pace",
  },
];

export default function Stats() {
  const { athleteId } = useIntervalsId();
  const navigate = useNavigate();

  if (!athleteId) {
    return (
      <AppLayout>
        <div className="animate-fade-in space-y-6">
          <h1 className="text-2xl font-semibold text-foreground">Stats & Progress</h1>
          <div className="glass-card p-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
              <Link2 className="w-7 h-7 text-primary" />
            </div>
            <h2 className="text-lg font-medium text-foreground mb-2">
              Connect intervals.icu
            </h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
              Link your intervals.icu account to view fitness charts, weekly mileage, and pace trends right here. Go to{" "}
              <span className="text-foreground font-medium">Settings</span> and paste your Athlete ID.
            </p>
            <button
              onClick={() => navigate("/settings")}
              className="pill-button bg-primary text-primary-foreground gap-2"
            >
              Go to Settings
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <h1 className="text-2xl font-semibold text-foreground">Stats & Progress</h1>

        <div className="space-y-5">
          {charts.map((chart) => (
            <div key={chart.path} className="glass-card overflow-hidden">
              {/* Frosted header */}
              <div className="px-5 py-3 border-b border-border bg-card/60 backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">
                    {chart.title}
                  </span>
                </div>
              </div>
              {/* iframe embed */}
              <div className="w-full aspect-[2.5/1] min-h-[280px]">
                <iframe
                  src={`https://intervals.icu/api/v1/athlete/${athleteId}/charts/${chart.path}?theme=dark`}
                  className="w-full h-full border-0"
                  title={chart.title}
                  loading="lazy"
                  sandbox="allow-scripts allow-same-origin"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
