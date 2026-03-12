import { Link } from "react-router-dom";
import { Zap, Activity, BarChart3, MessageCircle, Calendar, BookOpen, ArrowRight } from "lucide-react";

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "Philosophy", href: "#philosophy" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold text-foreground tracking-tight">PaceIQ</span>
          </Link>
          <nav className="hidden sm:flex items-center gap-8">
            {navLinks.map(({ label, href }) => (
              <a
                key={label}
                href={href}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {label}
              </a>
            ))}
          </nav>
          <Link
            to="/auth"
            className="pill-button bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium"
          >
            Sign in
          </Link>
        </div>
      </header>

      <section className="pt-32 pb-20 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground tracking-tight leading-[1.1]">
            Your intervals.icu data, a plan, and a{" "}
            <span className="text-primary">coach that reads it</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Connect intervals.icu once. Get training plans, Kipcoachee feedback, and stats — CTL/ATL/TSB, pace trends, PRs, wellness — all built on your actual data.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/auth"
              className="pill-button bg-primary text-primary-foreground px-8 py-3 text-base font-medium gap-2 w-full sm:w-auto justify-center"
            >
              Get started
              <ArrowRight className="w-4 h-4" />
            </Link>
            <p className="text-sm text-muted-foreground">Free to start.</p>
          </div>
        </div>
      </section>

      <section className="pt-8 pb-20 px-4 sm:px-6 overflow-hidden">
        <div className="max-w-5xl mx-auto">
          <div className="glass-card p-4 sm:p-6 rounded-2xl border border-border overflow-hidden">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {[
                { icon: Activity, label: "Activities", desc: "Runs synced from intervals.icu" },
                { icon: Calendar, label: "Training Plan", desc: "Plans for your goal & schedule" },
                { icon: BarChart3, label: "Stats", desc: "CTL, pace, PRs, readiness" },
                { icon: MessageCircle, label: "Kipcoachee", desc: "Coach that knows your data" },
                { icon: BookOpen, label: "Philosophy", desc: "Polarized, 80/20, or custom" },
              ].map(({ icon: Icon, label, desc }) => (
                <div
                  key={label}
                  className="glass-card p-4 rounded-xl border border-border hover:border-primary/30 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <p className="font-medium text-foreground text-sm">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="py-20 px-4 sm:px-6 border-t border-border">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground text-center mb-12">
            Built around intervals.icu
          </h2>
          <div className="grid sm:grid-cols-2 gap-6">
            {[
              {
                title: "Kipcoachee",
                desc: "Chat about workouts, pacing, race strategy. Uses your activities, CTL, and wellness — not generic advice.",
              },
              {
                title: "intervals.icu sync",
                desc: "Activities, fitness curves, HRV, sleep. One API key. No Strava or Garmin setup.",
              },
              {
                title: "Training plans",
                desc: "Generated for your goal, days per week, and philosophy. Easy, tempo, intervals, long runs.",
              },
              {
                title: "Stats",
                desc: "Weekly mileage, pace progression, PRs, readiness scores. All from your synced data.",
              },
            ].map(({ title, desc }) => (
              <div key={title} className="glass-card p-5 rounded-xl border border-border">
                <h3 className="font-semibold text-foreground mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="philosophy" className="py-20 px-4 sm:px-6 border-t border-border">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-4">
            Ready to go?
          </h2>
          <p className="text-muted-foreground mb-8">
            Sign in, connect intervals.icu in Settings, and you’re set.
          </p>
          <Link
            to="/auth"
            className="pill-button bg-primary text-primary-foreground px-8 py-3 text-base font-medium inline-flex gap-2"
          >
            Get started
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      <footer className="py-8 px-4 sm:px-6 border-t border-border">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-lg bg-primary flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">PaceIQ</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link to="/auth" className="hover:text-foreground transition-colors">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
