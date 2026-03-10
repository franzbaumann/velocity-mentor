import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

type Status = "loading" | "success" | "error";

export default function StravaCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("Connecting your Strava account…");
  const exchanged = useRef(false);

  useEffect(() => {
    if (exchanged.current) return;
    exchanged.current = true;

    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error || !code) {
      setStatus("error");
      setMessage(
        error === "access_denied"
          ? "You declined the Strava authorization. You can try again from Settings."
          : "Strava authorization failed. Please try again.",
      );
      setTimeout(() => navigate("/settings"), 3000);
      return;
    }

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setStatus("error");
        setMessage("You must be signed in to connect Strava.");
        setTimeout(() => navigate("/settings"), 3000);
        return;
      }

      const redirectUri = `${window.location.origin}/auth/strava/callback`;

      const { data, error: fnError } = await supabase.functions.invoke("strava-oauth", {
        body: { code, redirect_uri: redirectUri },
      });

      if (fnError || (data && typeof data === "object" && "error" in data)) {
        setStatus("error");
        const errMsg = (data as { error?: string; detail?: string })?.error ?? (data as { detail?: string })?.detail ?? fnError?.message ?? "Failed to exchange Strava token.";
        setMessage(errMsg);
        setTimeout(() => navigate("/settings"), 4000);
        return;
      }

      const name = (data as { athlete_name?: string })?.athlete_name ?? "your Strava account";
      setStatus("success");
      setMessage(`Connected as ${name}! Redirecting to Settings…`);
      setTimeout(() => navigate("/settings"), 2000);
    })();
  }, [navigate, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="glass-card p-8 max-w-sm w-full mx-4 text-center space-y-4">
        {status === "loading" && (
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="text-sm text-muted-foreground">{message}</p>
          </div>
        )}
        {status === "success" && (
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm font-medium text-foreground">{message}</p>
          </div>
        )}
        {status === "error" && (
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-destructive/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-sm text-muted-foreground">{message}</p>
          </div>
        )}
      </div>
    </div>
  );
}
