import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { CadeLogo } from "@/components/CadeLogo";

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,30}$/;
function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "");
}

export default function SetUsername() {
  const [username, setUsername] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const normalized = normalizeUsername(username);
    if (!USERNAME_REGEX.test(normalized)) {
      setError("Username must be 3–30 characters, letters, numbers, and underscores only.");
      setSubmitting(false);
      return;
    }

    const baseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setError("Session expired. Please sign in again.");
      setSubmitting(false);
      return;
    }

    const checkRes = await fetch(`${baseUrl}/functions/v1/community-proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "" },
      body: JSON.stringify({ __path: "username/check", username: normalized }),
    });
    const checkData = await checkRes.json().catch(() => ({}));
    if (!checkData.available) {
      setError(checkData.error ?? "Username is already taken.");
      setSubmitting(false);
      return;
    }

    const setRes = await fetch(`${baseUrl}/functions/v1/community-proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
      },
      body: JSON.stringify({ __path: "username/set", username: normalized }),
    });
    const setData = await setRes.json().catch(() => ({}));
    if (!setRes.ok) {
      setError(setData.error ?? "Failed to set username.");
      setSubmitting(false);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["athlete_profile"] });
    navigate("/", { replace: true });
    setSubmitting(false);
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2.5">
            <CadeLogo variant="full" size="md" />
          </Link>
        </div>
      </header>

      <div className="flex-1 pt-24 pb-12 px-4 flex items-center justify-center">
        <div className="w-full max-w-md animate-fade-in">
          <div className="glass-card p-7 space-y-5">
            <div>
              <h1 className="text-lg font-semibold text-foreground">Choose a username</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Friends can find you in Community by this username. Your display name stays the same everywhere else.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. franz_run"
                  required
                  minLength={3}
                  maxLength={30}
                  pattern="[a-zA-Z0-9_]+"
                  title="Letters, numbers, and underscores only"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                />
              </div>

              {error && (
                <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="pill-button bg-primary text-primary-foreground w-full disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? "Saving…" : "Save"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
