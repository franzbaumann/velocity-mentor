import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getSupabaseUrl } from "@/lib/supabase-url";
import {
  AuthTokenError,
  createRequestId,
  getFunctionRequestHeaders,
  getSafeAccessToken,
} from "@/lib/supabase-auth-safe";

type Status = "loading" | "success" | "error";

interface CallbackResult {
  ok?: boolean;
  error?: string;
  detail?: string;
}

export default function VitalCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("Connecting your watch…");
  const exchanged = useRef(false);

  useEffect(() => {
    if (exchanged.current) return;
    exchanged.current = true;

    const vitalUserId = searchParams.get("vital_user_id");

    if (!vitalUserId) {
      setStatus("error");
      setMessage("Missing connection data. Please try connecting again from Settings.");
      setTimeout(() => navigate("/settings"), 3000);
      return;
    }

    (async () => {
      try {
        const accessToken = await getSafeAccessToken();
        const requestId = createRequestId("vital_callback");
        const baseUrl = getSupabaseUrl();
        const res = await fetch(`${baseUrl}/functions/v1/vital-oauth-callback`, {
          method: "POST",
          headers: getFunctionRequestHeaders(accessToken, requestId),
          body: JSON.stringify({ vital_user_id: vitalUserId }),
        });
        const result = (await res.json().catch(() => ({}))) as CallbackResult;
        if (!res.ok || result.error) {
          const message = result.error ?? result.detail ?? `Failed to save connection (HTTP ${res.status})`;
          setStatus("error");
          setMessage(message);
          setTimeout(() => navigate("/settings"), 4000);
          return;
        }

        setStatus("success");
        setMessage("Watch connected! Redirecting…");

        if (window.opener) {
          window.opener.postMessage({ type: "vital-connected" }, window.location.origin);
          window.close();
        } else {
          setTimeout(() => navigate("/settings"), 1500);
        }
      } catch (error) {
        const message = error instanceof AuthTokenError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Failed to connect watch.";
        setStatus("error");
        setMessage(message);
        setTimeout(() => navigate("/settings"), 4000);
      }
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
