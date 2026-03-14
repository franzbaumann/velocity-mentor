import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Zap } from "lucide-react";
import { Marquee } from "@/components/ui/marquee";
import { useAuth } from "@/hooks/use-auth";

type Mode = "login" | "signup";

export default function AuthPage() {
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }
  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name },
          emailRedirectTo: `${window.location.origin}/auth`,
        },
      });
      if (error) {
        setError(error.message);
      } else {
        setSuccessMsg("Check your email to confirm your account, then sign in.");
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    }

    setSubmitting(false);
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold text-foreground tracking-tight">Cade</span>
          </Link>
        </div>
      </header>

      <div className="pt-24 pb-12 px-4 flex items-center justify-center min-h-screen">
        <div className="w-full max-w-md animate-fade-in">
          <div className="glass-card p-7 space-y-5">
            <div>
              <h1 className="text-lg font-semibold text-foreground">
                {mode === "login" ? "Welcome back" : "Create your account"}
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {mode === "login"
                  ? "Sign in to your Cade account"
                  : "Connect intervals.icu, get Coach Cade, and build your plan."}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              {mode === "signup" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Full name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                />
              </div>

              {error && (
                <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              {successMsg && (
                <p className="text-xs text-green-600 bg-green-500/10 rounded-lg px-3 py-2">
                  {successMsg}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="pill-button bg-primary text-primary-foreground w-full mt-1 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting
                  ? "Please wait…"
                  : mode === "login"
                  ? "Sign in"
                  : "Create account"}
              </button>
            </form>

            <div className="text-center">
              <button
                onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); setSuccessMsg(null); }}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {mode === "login"
                  ? "Don't have an account? Sign up"
                  : "Already have an account? Sign in"}
              </button>
            </div>
          </div>

          <div className="mt-8 -mx-4 overflow-hidden border-t border-border pt-6">
            <Marquee pauseOnHover direction="left" duration={35} className="py-1" fadeAmount={15}>
              <span className="mx-6 text-sm text-muted-foreground">Garmin</span>
              <span className="mx-6 text-muted-foreground/50">·</span>
              <span className="mx-6 text-sm text-muted-foreground">Coros</span>
              <span className="mx-6 text-muted-foreground/50">·</span>
              <span className="mx-6 text-sm text-muted-foreground">Apple Watch</span>
              <span className="mx-6 text-muted-foreground/50">·</span>
              <span className="mx-6 text-sm text-muted-foreground">intervals.icu</span>
              <span className="mx-6 text-muted-foreground/50">·</span>
              <span className="mx-6 text-sm text-muted-foreground">80/20 Polarized</span>
              <span className="mx-6 text-muted-foreground/50">·</span>
              <span className="mx-6 text-sm text-muted-foreground">Jack Daniels · Lydiard · Pfitzinger</span>
            </Marquee>
          </div>
        </div>
      </div>
    </div>
  );
}
