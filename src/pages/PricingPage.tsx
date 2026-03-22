import { useState } from "react";
import { Link } from "react-router-dom";
import { CadeLogo } from "@/components/CadeLogo";
import { useAuth } from "@/hooks/use-auth";

export default function PricingPage() {
  const { user } = useAuth();
  const [email, setEmail] = useState(
    (user as { email?: string } | null)?.email ?? ""
  );
  const [showProForm, setShowProForm] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleProCta = () => {
    if (submitted) return;
    setShowProForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setShowProForm(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 flex items-center h-16">
          <Link to="/" className="flex items-center gap-2.5">
            <CadeLogo variant="full" size="xl" />
          </Link>
        </div>
      </header>

      <main className="max-w-[900px] mx-auto px-4 sm:px-6 py-16">
        <div className="text-center mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-3">
            Simple, honest pricing
          </h1>
          <p className="text-lg text-muted-foreground">
            Free during beta. Lock in 50% off when we launch.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Beta (Free) card */}
          <div className="rounded-2xl border border-border bg-card p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-foreground">Beta</h2>
              {user ? (
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-green-500/15 text-green-600 dark:text-green-400">
                  Current plan
                </span>
              ) : (
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
                  Free
                </span>
              )}
            </div>

            <div className="mb-6">
              <span className="text-4xl font-bold text-foreground">€0</span>
              <span className="text-muted-foreground ml-1">/ month</span>
            </div>

            <ul className="space-y-2.5 mb-8 flex-1">
              {[
                "Full training plan generation",
                "Coach Cade AI coaching (10 msgs/day)",
                "All training philosophies",
                "intervals.icu sync",
                "HRV & readiness tracking",
                "Stats & race predictions",
              ].map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="w-4 h-4 rounded-full bg-green-500/15 text-green-600 dark:text-green-400 flex items-center justify-center text-xs flex-shrink-0">✓</span>
                  {f}
                </li>
              ))}
            </ul>

            {user ? (
              <button
                disabled
                className="w-full rounded-full px-4 py-2.5 text-sm font-medium bg-muted text-muted-foreground cursor-not-allowed"
              >
                You're already in
              </button>
            ) : (
              <Link
                to="/auth"
                className="w-full rounded-full px-4 py-2.5 text-sm font-medium bg-muted text-foreground hover:bg-muted/80 transition-colors text-center"
              >
                Join free beta →
              </Link>
            )}
          </div>

          {/* Cade Pro card */}
          <div className="rounded-2xl border border-primary/50 bg-card p-6 flex flex-col shadow-[0_0_24px_rgba(59,130,246,0.08)]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-foreground">Cade Pro</h2>
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                Coming at launch
              </span>
            </div>

            <div className="mb-1">
              <span className="text-muted-foreground line-through text-lg mr-2">€19.99</span>
              <span className="text-4xl font-bold text-foreground">€9.99</span>
              <span className="text-muted-foreground ml-1">/ month</span>
            </div>
            <p className="text-xs text-primary mb-6">Beta member discount: 50% off forever</p>

            <ul className="space-y-2.5 mb-8 flex-1">
              {[
                "Everything in Beta, plus:",
                "Unlimited Coach Cade messages",
                "Priority AI responses",
                "Advanced season planning",
                "Early feature access",
                "Direct support",
              ].map((f, i) => (
                <li key={f} className={`flex items-center gap-2 text-sm ${i === 0 ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                  {i > 0 && (
                    <span className="w-4 h-4 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs flex-shrink-0">✓</span>
                  )}
                  {f}
                </li>
              ))}
            </ul>

            {submitted ? (
              <div className="w-full rounded-full px-4 py-2.5 text-sm font-medium bg-green-500/15 text-green-600 dark:text-green-400 text-center">
                Spot reserved! We'll be in touch.
              </div>
            ) : showProForm ? (
              <form onSubmit={handleSubmit} className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Enter your email and we'll notify you when Cade Pro launches. Your 50% discount is reserved.
                </p>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full bg-secondary rounded-lg px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/20"
                />
                <button
                  type="submit"
                  className="w-full rounded-full px-4 py-2.5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Save my spot
                </button>
              </form>
            ) : (
              <button
                onClick={handleProCta}
                className="w-full rounded-full px-4 py-2.5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Lock in 50% off →
              </button>
            )}
          </div>
        </div>
      </main>

      <footer className="py-6 px-4 sm:px-6 border-t border-border mt-16">
        <div className="max-w-[900px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
          <Link to="/" className="hover:text-foreground transition-colors">← Back to home</Link>
          <div className="flex items-center gap-6">
            <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
