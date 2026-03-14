import { AppLayout } from "@/components/AppLayout";
import { GarminImportBlock } from "@/components/GarminImportBlock";
import { useIntervalsIntegration } from "@/hooks/useIntervalsIntegration";
import { useIntervalsSync } from "@/hooks/useIntervalsSync";
import { useStravaConnection } from "@/hooks/use-strava-connection";
import { useAuth } from "@/hooks/use-auth";
import { syncStravaActivities } from "@/integrations/strava";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, Unlink, Loader2, RefreshCw, Upload, Heart, Trash2, User, Brain, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { format, subDays } from "date-fns";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

function StravaLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.599h4.172L10.463 0l-7 13.828h4.169" />
    </svg>
  );
}

const SYNC_COOLDOWN_MINUTES = 15; // Strava rate limit: 200 req/15min — avoid hammering API

function StravaNotConnectedBlock({
  connectStrava,
  refetch,
  queryClient,
}: {
  connectStrava: () => void;
  refetch: () => void;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [showPersonalToken, setShowPersonalToken] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSavePersonalToken = async () => {
    if (!accessToken.trim()) {
      toast.error("Enter your access token");
      return;
    }
    setSaving(true);
    try {
      // Refresh session to ensure we have a valid, non-expired token
      const { data: { session }, error: sessionError } = await supabase.auth.refreshSession();
      if (sessionError) {
        toast.error("Session expired. Please sign out and sign back in.");
        setSaving(false);
        return;
      }
      if (!session?.access_token) {
        toast.error("Please sign in first, then try saving the token.");
        setSaving(false);
        return;
      }
      const { data, error } = await supabase.functions.invoke("strava-save-personal-token", {
        body: { access_token: accessToken.trim(), refresh_token: refreshToken.trim() || undefined },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (data && typeof data === "object" && "error" in data) {
        const err = data as { error?: string; detail?: string };
        throw new Error(err.detail ?? err.error ?? "Failed");
      }
      if (error) {
        if (error instanceof FunctionsHttpError) {
          try {
            const body = (await error.context.json()) as { error?: string; detail?: string };
            const msg = body.detail ?? body.error ?? (error.context.status === 401 ? "Session expired. Sign out and sign back in." : `HTTP ${error.context.status}`);
            throw new Error(msg);
          } catch (e) {
            if (e instanceof Error) throw e;
            throw new Error(`HTTP ${error.context.status}: ${error.message}`);
          }
        }
        throw error;
      }
      refetch();
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      toast.success("Personal token saved. Click Sync now to fetch activities.");
      setShowPersonalToken(false);
      setAccessToken("");
      setRefreshToken("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save token");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
            <StravaLogo className="w-4 h-4 text-orange-500" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Strava</p>
            <p className="text-xs text-muted-foreground">Not connected</p>
          </div>
        </div>
        <Button
          onClick={() => {
            try {
              connectStrava();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Strava not configured");
            }
          }}
          className="rounded-full bg-orange-500 hover:bg-orange-600 text-white gap-2"
        >
          <StravaLogo className="w-4 h-4" />
          Connect Strava (OAuth)
        </Button>
      </div>
      <div className="border-t border-border pt-3">
        <button
          type="button"
          onClick={() => setShowPersonalToken(!showPersonalToken)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {showPersonalToken ? "Hide" : "Or use personal token"} (bypasses athlete limit)
        </button>
        {showPersonalToken && (
          <div className="mt-3 space-y-2 pl-0">
            <p className="text-xs text-muted-foreground">
              Paste tokens from{" "}
              <a href="https://www.strava.com/settings/api" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                Strava → Settings → API
              </a>
              . Token must have <strong>activity:read_all</strong> scope. If you get permission errors, use Connect Strava (OAuth) instead.
            </p>
            <Input
              placeholder="Access Token"
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              className="bg-secondary/50"
            />
            <Input
              placeholder="Refresh Token (optional, for auto-refresh)"
              type="password"
              value={refreshToken}
              onChange={(e) => setRefreshToken(e.target.value)}
              className="bg-secondary/50"
            />
            <Button onClick={handleSavePersonalToken} size="sm" className="rounded-full" disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
              Save personal token
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function StravaConnectionBlock({ queryClient }: { queryClient: ReturnType<typeof useQueryClient> }) {
  const { connected, athleteName, lastSyncAt, loading, error, connectStrava, disconnectStrava, refetch } = useStravaConnection();
  const [isSyncing, setIsSyncing] = useState(false);

  const canSync = !lastSyncAt || (Date.now() - new Date(lastSyncAt).getTime()) > SYNC_COOLDOWN_MINUTES * 60 * 1000;
  const nextSyncIn = lastSyncAt
    ? Math.max(0, Math.ceil((SYNC_COOLDOWN_MINUTES * 60 * 1000 - (Date.now() - new Date(lastSyncAt).getTime())) / 60000))
    : 0;

  const handleSync = async () => {
    if (!canSync) return;
    setIsSyncing(true);
    try {
      const count = await syncStravaActivities();
      refetch();
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      toast.success(`Synced ${count} runs from Strava.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setIsSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
            <StravaLogo className="w-4 h-4 text-orange-500" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Strava</p>
            <p className="text-xs text-muted-foreground">Loading…</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
              <StravaLogo className="w-4 h-4 text-orange-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Strava</p>
              <p className="text-xs text-destructive">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!connected) {
    return (
      <StravaNotConnectedBlock connectStrava={connectStrava} refetch={refetch} queryClient={queryClient} />
    );
  }

  return (
    <div className="flex justify-between items-center flex-wrap gap-3">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
          <StravaLogo className="w-4 h-4 text-orange-500" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground flex items-center gap-2">
            Strava
            <span className="inline-flex items-center gap-1 text-xs font-normal text-green-600 dark:text-green-400">
              <Check className="w-3.5 h-3.5" /> Connected as {athleteName || "Strava athlete"}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {lastSyncAt ? `Last sync: ${format(new Date(lastSyncAt), "MMM d, HH:mm")}` : "Not synced yet"}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          onClick={handleSync}
          size="sm"
          variant="outline"
          className="rounded-full px-4"
          disabled={isSyncing || !canSync}
          title={!canSync ? `Wait ${nextSyncIn} min to avoid Strava rate limits` : undefined}
        >
          {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {isSyncing ? "Syncing…" : !canSync && nextSyncIn > 0 ? `Sync in ${nextSyncIn} min` : "Sync now"}
        </Button>
        <Button onClick={disconnectStrava} size="sm" variant="outline" className="rounded-full px-4">
          <Unlink className="w-4 h-4 mr-1" /> Disconnect
        </Button>
      </div>
    </div>
  );
}

function TrainingPlanSection({ queryClient }: { queryClient: ReturnType<typeof useQueryClient> }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: plan, isLoading } = useQuery({
    queryKey: ["training-plan"],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("training_plan")
        .select("id, plan_name, start_date, end_date")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const [deleting, setDeleting] = useState(false);
  const handleDeletePlanAndRestart = async () => {
    if (!user || !confirm("Delete your current training plan and create a new one? You'll go through onboarding again.")) return;
    setDeleting(true);
    try {
      const { data: plans } = await supabase.from("training_plan").select("id").eq("user_id", user.id);
      for (const p of plans ?? []) {
        await supabase.from("training_plan").delete().eq("id", p.id);
      }
      await supabase.from("athlete_profile").upsert(
        { user_id: user.id, onboarding_complete: false, onboarding_answers: null, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
      queryClient.invalidateQueries({ queryKey: ["training-plan"] });
      queryClient.invalidateQueries({ queryKey: ["athlete_profile"] });
      localStorage.removeItem("cade_onboarding_v2");
      toast.success("Plan deleted. Starting fresh onboarding…");
      navigate("/coach", { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete plan");
    } finally {
      setDeleting(false);
    }
  };

  if (isLoading) return null;

  if (!plan) {
    return (
      <div className="glass-card p-5">
        <p className="section-header">Training Plan (Cade)</p>
        <p className="text-sm text-muted-foreground mb-4">
          No plan yet. Complete onboarding with Coach Cade to get a personalized training plan.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full gap-2"
          onClick={() => navigate("/coach")}
        >
          Create new plan
        </Button>
      </div>
    );
  }

  return (
    <div className="glass-card p-5">
      <p className="section-header">Training Plan (Cade)</p>
      <p className="text-sm text-muted-foreground mb-4">
        {plan.plan_name ?? "Your plan"} · {plan.start_date && plan.end_date
          ? `${plan.start_date} – ${plan.end_date}`
          : "Active"}
      </p>
      <Button
        variant="outline"
        size="sm"
        className="rounded-full gap-2"
        onClick={handleDeletePlanAndRestart}
        disabled={deleting}
      >
        {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        Delete plan and create new one
      </Button>
    </div>
  );
}

function LabTestSection() {
  const [uploading, setUploading] = useState(false);
  const [labData, setLabData] = useState<Record<string, unknown> | null>(null);

  const { data: profile } = useQuery({
    queryKey: ["athlete-profile-lab"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      if (!user) return null;
      const { data } = await supabase
        .from("athlete_profile")
        .select("vo2max, lactate_threshold_hr, lactate_threshold_pace, vlamax, max_hr_measured, lab_test_date, lab_name")
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
  });

  const hasLab = profile?.vo2max || profile?.lactate_threshold_hr;
  const zoneSource = hasLab ? `Lab test${profile?.lab_name ? ` (${profile.lab_name})` : ""}${profile?.lab_test_date ? ` — ${profile.lab_test_date}` : ""}` : "Max HR percentage";

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || file.type !== "application/pdf") {
      toast.error("Please drop a PDF file");
      return;
    }
    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke("lab-extract", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { pdf: base64 },
      });
      if (error) throw error;
      if (data?.extracted) {
        setLabData(data.extracted);
        const vals: string[] = [];
        if (data.extracted.vo2max) vals.push(`VO2max ${data.extracted.vo2max}`);
        if (data.extracted.lactate_threshold_hr) vals.push(`LT HR ${data.extracted.lactate_threshold_hr} bpm`);
        if (data.extracted.lactate_threshold_pace) vals.push(`LT Pace ${data.extracted.lactate_threshold_pace}`);
        toast.success(vals.length > 0 ? `Found: ${vals.join(" · ")}` : "Lab data extracted");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to process PDF");
    } finally {
      setUploading(false);
    }
  };

  const display = labData ?? profile;

  return (
    <div className="glass-card p-5">
      <p className="section-header">Lab Results</p>
      <p className="text-sm text-muted-foreground mb-4">
        Upload a lab test PDF to extract VO2max, lactate threshold, and other markers. These override HR-based zone calculations.
      </p>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Extracting lab data...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="w-6 h-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Drop lab test PDF here</p>
          </div>
        )}
      </div>
      {display && (display as Record<string, unknown>).vo2max && (
        <div className="mt-4 space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            {(display as Record<string, unknown>).vo2max && (
              <div className="bg-secondary/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">VO2max</p>
                <p className="font-semibold">{Number((display as Record<string, unknown>).vo2max).toFixed(1)} ml/kg/min</p>
              </div>
            )}
            {(display as Record<string, unknown>).lactate_threshold_hr && (
              <div className="bg-secondary/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">LT Heart Rate</p>
                <p className="font-semibold">{Math.round(Number((display as Record<string, unknown>).lactate_threshold_hr))} bpm</p>
              </div>
            )}
            {(display as Record<string, unknown>).lactate_threshold_pace && (
              <div className="bg-secondary/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">LT Pace</p>
                <p className="font-semibold">{String((display as Record<string, unknown>).lactate_threshold_pace)}</p>
              </div>
            )}
            {(display as Record<string, unknown>).vlamax && (
              <div className="bg-secondary/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">VLamax</p>
                <p className="font-semibold">{Number((display as Record<string, unknown>).vlamax).toFixed(2)} mmol/L/s</p>
              </div>
            )}
            {(display as Record<string, unknown>).max_hr_measured && (
              <div className="bg-secondary/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Max HR (measured)</p>
                <p className="font-semibold">{String((display as Record<string, unknown>).max_hr_measured)} bpm</p>
              </div>
            )}
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground mt-3">
        Zones based on: <span className="font-medium">{zoneSource}</span>
      </p>
    </div>
  );
}

const MEMORY_CATEGORY_COLORS: Record<string, string> = {
  preference: "bg-blue-500/20 text-blue-600 dark:text-blue-400",
  goal: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400",
  injury: "bg-red-500/20 text-red-600 dark:text-red-400",
  lifestyle: "bg-purple-500/20 text-purple-600 dark:text-purple-400",
  race: "bg-amber-500/20 text-amber-600 dark:text-amber-400",
  personality: "bg-pink-500/20 text-pink-600 dark:text-pink-400",
  other: "bg-gray-500/20 text-gray-600 dark:text-gray-400",
};

function CoachingMemorySection() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [clearingAll, setClearingAll] = useState(false);

  const { data: memories = [], isLoading } = useQuery({
    queryKey: ["coaching_memory", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("coaching_memory")
        .select("id, category, content, importance, created_at, expires_at")
        .eq("user_id", user.id)
        .order("importance", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) return [];
      return data as { id: string; category: string; content: string; importance: number; created_at: string; expires_at: string | null }[];
    },
    enabled: !!user,
  });

  const handleDelete = async (id: string) => {
    if (!user) return;
    await supabase.from("coaching_memory").delete().eq("id", id).eq("user_id", user.id);
    queryClient.invalidateQueries({ queryKey: ["coaching_memory"] });
  };

  const handleClearAll = async () => {
    if (!user || !confirm("Clear all coaching memories? Coach Cade will lose all context from past conversations.")) return;
    setClearingAll(true);
    try {
      await supabase.from("coaching_memory").delete().eq("user_id", user.id);
      queryClient.invalidateQueries({ queryKey: ["coaching_memory"] });
      toast.success("All coaching memories cleared.");
    } catch {
      toast.error("Failed to clear memories");
    } finally {
      setClearingAll(false);
    }
  };

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-2">
        <p className="section-header flex items-center gap-2">
          <Brain className="w-4 h-4" /> Coaching Memory
        </p>
        {memories.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="rounded-full text-xs text-destructive hover:text-destructive"
            onClick={handleClearAll}
            disabled={clearingAll}
          >
            {clearingAll ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Trash2 className="w-3 h-3 mr-1" />}
            Clear all
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Coach Cade remembers key facts from your conversations to personalize coaching across sessions.
      </p>
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading memories…
        </div>
      ) : memories.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No memories yet. Chat with Coach Cade and memories will be extracted automatically.
        </p>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {memories.map((m) => (
            <div key={m.id} className="flex items-start gap-2 group">
              <div className="flex-1 rounded-lg bg-secondary/50 px-3 py-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${MEMORY_CATEGORY_COLORS[m.category] ?? MEMORY_CATEGORY_COLORS.other}`}>
                    {m.category}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(m.created_at), "MMM d, yyyy")}
                  </span>
                </div>
                <p className="text-sm text-foreground">{m.content}</p>
              </div>
              <button
                onClick={() => handleDelete(m.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                title="Delete memory"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { integration, isConnected, save, isSaving, disconnect } = useIntervalsIntegration();

  const { data: activityCount = 0 } = useQuery({
    queryKey: ["activityCount", user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { count } = await supabase.from("activity").select("id", { count: "exact", head: true }).eq("user_id", user.id);
      return count ?? 0;
    },
    enabled: !!user,
  });

  const { data: athleteProfile } = useQuery({
    queryKey: ["athlete_profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("athlete_profile")
        .select("max_hr, resting_hr, weight_kg, height_cm, training_philosophy, preferred_longrun_day, preferred_units")
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const { data: latestWeight } = useQuery({
    queryKey: ["latest_weight", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("daily_readiness")
        .select("weight")
        .eq("user_id", user.id)
        .not("weight", "is", null)
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data?.weight ?? null;
    },
    enabled: !!user && !!isConnected,
  });

  const [clearing, setClearing] = useState(false);
  const handleClearAllData = async () => {
    if (!user || !confirm("Delete all imported activities and wellness data? This cannot be undone.")) return;
    setClearing(true);
    try {
      await supabase.from("activity").delete().eq("user_id", user.id);
      await supabase.from("daily_readiness").delete().eq("user_id", user.id);
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      queryClient.invalidateQueries({ queryKey: ["daily_readiness"] });
      queryClient.invalidateQueries({ queryKey: ["activityCount"] });
      toast.success("All imported data cleared.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to clear data");
    } finally {
      setClearing(false);
    }
  };
  const [athleteId, setAthleteId] = useState(integration?.athlete_id ?? "");
  const [apiKey, setApiKey] = useState(integration?.api_key ?? "");
  const [showIntervalsForm, setShowIntervalsForm] = useState(false);

  // Sync when integration loads
  const [synced, setSynced] = useState(false);
  if (integration && !synced) {
    setAthleteId(integration.athlete_id);
    setApiKey(integration.api_key);
    setSynced(true);
  }

  const { syncing: intervalsSyncing, progress: syncProgress, runSync } = useIntervalsSync();
  const [isTesting, setIsTesting] = useState(false);
  const [maxHr, setMaxHr] = useState("");
  const [restingHr, setRestingHr] = useState("");
  const [savingHr, setSavingHr] = useState(false);
  const [weightKg, setWeightKg] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [philosophy, setPhilosophy] = useState<string>("jack_daniels");
  const [longRunDay, setLongRunDay] = useState<string>("Saturday");
  const [units, setUnits] = useState<string>("km");
  const [savingProfile, setSavingProfile] = useState(false);
  const [streamsSyncing, setStreamsSyncing] = useState(false);
  const [pbsSyncing, setPbsSyncing] = useState(false);

  const { data: syncStatus } = useQuery({
    queryKey: ["sync_progress", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      await supabase.auth.refreshSession();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return null;
      const { data } = await supabase.functions.invoke("intervals-proxy", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { action: "get_sync_progress" },
      });
      const row = data as { updated_at?: string; done?: boolean } | null;
      return row ? { updated_at: row.updated_at, done: row.done } : null;
    },
    enabled: !!user?.id && isConnected,
  });

  const handleSyncPRs = async () => {
    await supabase.auth.refreshSession();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      toast.error("Not signed in");
      return;
    }
    setPbsSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("intervals-proxy", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { action: "sync_pbs" },
      });
      if (error) throw error;
      const res = data as { pbs?: number } | null;
      toast.success(`Synced ${res?.pbs ?? 0} personal records.`);
      queryClient.invalidateQueries({ queryKey: ["personal_records"] });
      queryClient.invalidateQueries({ queryKey: ["sync_progress"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to sync PRs");
    } finally {
      setPbsSyncing(false);
    }
  };

  const handleSyncStreams = async () => {
    await supabase.auth.refreshSession();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      toast.error("Not signed in");
      return;
    }
    setStreamsSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("intervals-proxy", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { action: "sync_streams" },
      });
      if (error) throw error;
      const res = data as { ok?: number; failed?: number; total?: number } | null;
      const ok = res?.ok ?? 0;
      const total = res?.total ?? 0;
      toast.success(`Chart data synced for ${ok} of ${total} activities.`);
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      queryClient.invalidateQueries({ queryKey: ["activity-detail"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to sync chart data");
    } finally {
      setStreamsSyncing(false);
    }
  };

  useEffect(() => {
    if (athleteProfile) {
      setMaxHr(athleteProfile.max_hr != null ? String(athleteProfile.max_hr) : "");
      setRestingHr(athleteProfile.resting_hr != null ? String(athleteProfile.resting_hr) : "");
      setWeightKg(athleteProfile.weight_kg != null ? String(athleteProfile.weight_kg) : "");
      setHeightCm(athleteProfile.height_cm != null ? String(athleteProfile.height_cm) : "");
      setPhilosophy((athleteProfile.training_philosophy as string) ?? "jack_daniels");
      setLongRunDay(athleteProfile.preferred_longrun_day ?? "Saturday");
      setUnits(athleteProfile.preferred_units ?? "km");
    }
  }, [athleteProfile]);

  const handleSaveHr = async () => {
    if (!user) return;
    const m = maxHr.trim() ? parseInt(maxHr.trim(), 10) : null;
    const r = restingHr.trim() ? parseInt(restingHr.trim(), 10) : null;
    if (m != null && (m < 100 || m > 250)) {
      toast.error("Max HR should be 100–250 bpm");
      return;
    }
    if (r != null && (r < 30 || r > 120)) {
      toast.error("Resting HR should be 30–120 bpm");
      return;
    }
    setSavingHr(true);
    try {
      const { data: existing } = await supabase.from("athlete_profile").select("id").eq("user_id", user.id).maybeSingle();
      const payload = { max_hr: m, resting_hr: r };
      const { error } = existing
        ? await supabase.from("athlete_profile").update(payload).eq("user_id", user.id)
        : await supabase.from("athlete_profile").insert({ user_id: user.id, name: "Athlete", ...payload });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["athlete_profile"] });
      toast.success("Heart rate settings saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingHr(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    const w = weightKg.trim() ? parseFloat(weightKg.trim()) : null;
    const h = heightCm.trim() ? parseFloat(heightCm.trim()) : null;
    if (w != null && (w < 30 || w > 200)) {
      toast.error("Weight should be 30–200 kg");
      return;
    }
    if (h != null && (h < 100 || h > 250)) {
      toast.error("Height should be 100–250 cm");
      return;
    }
    setSavingProfile(true);
    try {
      const { data: existing } = await supabase.from("athlete_profile").select("id").eq("user_id", user.id).maybeSingle();
      const payload = {
        weight_kg: w,
        height_cm: h,
        training_philosophy: philosophy as "jack_daniels" | "pfitzinger" | "hansons" | "ai" | "80_20" | "lydiard",
        preferred_longrun_day: longRunDay,
        preferred_units: units,
      };
      const { error } = existing
        ? await supabase.from("athlete_profile").update(payload).eq("user_id", user.id)
        : await supabase.from("athlete_profile").insert({ user_id: user.id, name: "Athlete", ...payload });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["athlete_profile"] });
      queryClient.invalidateQueries({ queryKey: ["training-plan"] });
      toast.success("Profile saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSave = () => {
    save({ athleteId: athleteId.trim() || "0", apiKey: apiKey.trim() });
    setShowIntervalsForm(false);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    try {
      await supabase.auth.refreshSession();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error("Not signed in — sign out and sign back in, then try again");
        return;
      }
      const { data, error } = await supabase.functions.invoke("intervals-proxy", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { action: "test_connection" },
      });
      if (error) {
        const msg = error.message ?? "Connection failed";
        const hint = msg.includes("Refresh Token") || msg.includes("401") || msg.includes("403")
          ? " Try signing out and signing back in first."
          : "";
        toast.error(msg + hint);
        return;
      }
      const result = data as { ok?: boolean; error?: string } | null;
      if (result?.ok === false && result.error) {
        toast.error(`intervals.icu: ${result.error}`);
        return;
      }
      if (result?.ok === true) {
        toast.success("Connection works! API key is valid.");
      } else {
        toast.error("Connection failed");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Connection failed";
      const hint = msg.includes("Refresh Token") || msg.includes("401") || msg.includes("403")
        ? " Sign out and sign back in, then verify your intervals.icu API key in Settings → API."
        : "";
      toast.error(msg + hint);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>

        <div className="space-y-4">
          {/* Connected Accounts */}
          <div className="glass-card p-5">
            <p className="section-header">Connected Accounts</p>
            <p className="text-sm text-muted-foreground mb-4">
              Connect intervals.icu to sync activities, wellness, and fitness data.
            </p>
            <div className="space-y-3">
              {/* intervals.icu */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                      <span className="text-xs font-semibold text-muted-foreground">I</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        intervals.icu{" "}
                        <a href="https://intervals.icu/settings" target="_blank" rel="noopener noreferrer" className="text-primary text-xs hover:underline">(Settings)</a>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {isConnected ? "Connected" : "Not connected"}
                      </p>
                    </div>
                  </div>
                  {isConnected ? (
                    <div className="flex gap-2">
                      <Button onClick={runSync} size="sm" className="rounded-full px-5 pill-button bg-primary text-primary-foreground text-xs" disabled={intervalsSyncing}>
                        {intervalsSyncing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                        {intervalsSyncing ? "Syncing..." : "Sync Now"}
                      </Button>
                      <Button onClick={handleTestConnection} size="sm" variant="outline" className="rounded-full px-5" disabled={isTesting}>
                        {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Test"}
                      </Button>
                      <Button onClick={() => disconnect()} size="sm" variant="outline" className="rounded-full px-5">
                        <Unlink className="w-4 h-4 mr-1" /> Disconnect
                      </Button>
                    </div>
                  ) : (
                    <Button onClick={() => setShowIntervalsForm(!showIntervalsForm)} size="sm" className="rounded-full px-5 pill-button bg-primary text-primary-foreground text-xs">
                      Connect
                    </Button>
                  )}
                </div>
                {showIntervalsForm && !isConnected && (
                  <div className="pl-11 space-y-2 pt-2 border-l-2 border-border ml-4">
                    <p className="text-xs text-muted-foreground">API key from intervals.icu → Settings → API (Athlete ID optional, used for display)</p>
                    <Input
                      placeholder="Athlete ID (e.g. i123456)"
                      value={athleteId}
                      onChange={(e) => setAthleteId(e.target.value)}
                      className="max-w-xs bg-secondary/50"
                    />
                    <Input
                      placeholder="API Key"
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="max-w-xs bg-secondary/50"
                    />
                    <Button onClick={handleSave} size="sm" className="rounded-full px-5" disabled={isSaving || !apiKey.trim()}>
                      {isSaving ? "Saving…" : <><Check className="w-4 h-4 mr-1" /> Save</>}
                    </Button>
                  </div>
                )}
                {isConnected && (
                  <div className="pl-11 ml-4 mt-2 space-y-2">
                    {syncStatus?.updated_at && syncStatus?.done && (
                      <p className="text-xs text-muted-foreground">
                        Last synced: {format(new Date(syncStatus.updated_at), "MMM d, yyyy 'at' HH:mm")}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={handleSyncStreams} size="sm" variant="outline" className="rounded-full px-4 text-xs" disabled={streamsSyncing || intervalsSyncing}>
                        {streamsSyncing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                        Sync Streams
                      </Button>
                      <Button onClick={handleSyncPRs} size="sm" variant="outline" className="rounded-full px-4 text-xs" disabled={pbsSyncing || intervalsSyncing}>
                        {pbsSyncing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                        Sync PRs
                      </Button>
                    </div>
                    {syncProgress && (
                      <div className={`text-xs px-3 py-2 rounded-lg ${syncProgress.done && syncProgress.stage !== "error" ? "bg-emerald-500/10 text-emerald-600" : syncProgress.stage === "error" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
                        {syncProgress.stage === "error" ? syncProgress.detail : (
                          <>
                            {syncProgress.done ? (
                              <div className="space-y-1">
                                <p className="font-medium">Sync complete</p>
                                <p>{syncProgress.detail}</p>
                                {syncProgress.yearsCompleted && Object.keys(syncProgress.yearsCompleted).length > 0 && (
                                  <p className="text-muted-foreground mt-1">
                                    {Object.entries(syncProgress.yearsCompleted)
                                      .sort(([a], [b]) => a.localeCompare(b))
                                      .map(([yr, n]) => `✓ ${yr} — ${n} runs`)
                                      .join(" · ")}
                                  </p>
                                )}
                                {(syncProgress.ctl != null || syncProgress.pbsCount != null) && (
                                  <p className="text-muted-foreground text-[11px]">
                                    {syncProgress.ctl != null && `CTL: ${Math.round(syncProgress.ctl)}`}
                                    {syncProgress.pbsCount != null && ` · PRs: ${syncProgress.pbsCount} distances`}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="flex items-center gap-2">
                                <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                                {syncProgress.yearsCompleted && Object.keys(syncProgress.yearsCompleted).length > 0 ? (
                                  <>
                                    {Object.entries(syncProgress.yearsCompleted)
                                      .sort(([a], [b]) => a.localeCompare(b))
                                      .map(([yr, n]) => `✓ ${yr} — ${n} runs`)
                                      .join(" · ")}
                                    {syncProgress.streamsProgress && ` · Streams ${syncProgress.streamsProgress.done}/${syncProgress.streamsProgress.total}`}
                                  </>
                                ) : (
                                  syncProgress.detail
                                )}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Garmin + Strava hidden — intervals.icu is the primary data source */}
              {activityCount > 0 && (
                <div className="pl-11 ml-4 flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                  <span>{activityCount} activities synced</span>
                  <button
                    type="button"
                    onClick={handleClearAllData}
                    disabled={clearing}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    {clearing ? "Clearing…" : "Clear all data"}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Heart Rate */}
          <div className="glass-card p-5">
            <p className="section-header">Heart Rate</p>
            <p className="text-sm text-muted-foreground mb-2">
              Max HR is used for smart activity names (Easy vs Tempo) and zone calculations.
            </p>
            {isConnected && (
              <p className="text-xs text-muted-foreground mb-4">
                Resting HR is synced from intervals.icu daily with your wellness data. Enter a value here only if you want to override it (e.g. your device doesn&apos;t report it).
              </p>
            )}
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Max HR (bpm)</label>
                <Input
                  type="number"
                  min={100}
                  max={250}
                  placeholder="e.g. 185"
                  value={maxHr}
                  onChange={(e) => setMaxHr(e.target.value)}
                  className="w-24 bg-secondary/50"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Resting HR (bpm)</label>
                <Input
                  type="number"
                  min={30}
                  max={120}
                  placeholder="e.g. 52"
                  value={restingHr}
                  onChange={(e) => setRestingHr(e.target.value)}
                  className="w-24 bg-secondary/50"
                />
              </div>
              <Button onClick={handleSaveHr} size="sm" className="rounded-full" disabled={savingHr}>
                {savingHr ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Heart className="w-4 h-4 mr-1" /> Save</>}
              </Button>
            </div>
          </div>

          {/* Athlete Info */}
          <div className="glass-card p-5">
            <p className="section-header">Athlete Info</p>
            <p className="text-sm text-muted-foreground mb-4">
              {isConnected
                ? "Weight and height are synced from intervals.icu when available. Enter values here only if they're not coming through automatically — we use them for calorie estimates and VO2max calculations."
                : "Enter your weight and height for calorie estimates and VO2max calculations. If you connect intervals.icu, we'll sync these when available."}
            </p>
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Weight (kg)</label>
                <Input
                  type="number"
                  min={30}
                  max={200}
                  step={0.1}
                  placeholder={latestWeight != null && typeof latestWeight === "number" ? `${latestWeight.toFixed(1)} (from intervals)` : "e.g. 70"}
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  className="w-28 bg-secondary/50"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Height (cm)</label>
                <Input
                  type="number"
                  min={100}
                  max={250}
                  placeholder="e.g. 175"
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                  className="w-24 bg-secondary/50"
                />
              </div>
              <Button onClick={handleSaveProfile} size="sm" className="rounded-full" disabled={savingProfile}>
                {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <><User className="w-4 h-4 mr-1" /> Save</>}
              </Button>
            </div>
          </div>

          {/* Lab Test Upload */}
          <LabTestSection />

          {/* Training Plan */}
          <TrainingPlanSection queryClient={queryClient} />

          {/* Coaching Memory */}
          <CoachingMemorySection />

          {/* Training Preferences */}
          <div className="glass-card p-5">
            <p className="section-header">Training Preferences</p>
            <p className="text-sm text-muted-foreground mb-4">
              These preferences shape how Coach Cade designs your plan and describes workouts.
            </p>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Philosophy</label>
                <Select value={philosophy} onValueChange={setPhilosophy}>
                  <SelectTrigger className="w-full max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="jack_daniels">Jack Daniels</SelectItem>
                    <SelectItem value="pfitzinger">Pfitzinger</SelectItem>
                    <SelectItem value="hansons">Hansons</SelectItem>
                    <SelectItem value="80_20">80/20</SelectItem>
                    <SelectItem value="lydiard">Lydiard</SelectItem>
                    <SelectItem value="ai">AI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Units</label>
                <Select value={units} onValueChange={setUnits}>
                  <SelectTrigger className="w-full max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="km">Kilometers</SelectItem>
                    <SelectItem value="mi">Miles</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Long run day</label>
                <Select value={longRunDay} onValueChange={setLongRunDay}>
                  <SelectTrigger className="w-full max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleSaveProfile} size="sm" className="rounded-full" disabled={savingProfile}>
                {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4 mr-1" /> Save preferences</>}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
