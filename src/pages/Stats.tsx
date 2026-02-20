import { AppLayout } from "@/components/AppLayout";
import { BarChart3 } from "lucide-react";

export default function Stats() {
  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <h1 className="text-2xl font-semibold text-foreground">Stats & Progress</h1>
        <div className="glass-card p-12 text-center">
          <BarChart3 className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-medium text-foreground mb-2">Analytics coming soon</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Fitness trends (CTL/ATL/TSB), pace progression, HR & HRV analysis, and VDOT history will populate as your training data grows.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
