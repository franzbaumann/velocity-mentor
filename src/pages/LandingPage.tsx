import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Activity,
  Calendar,
  MessageCircle,
  ArrowRight,
  Check,
  Link2,
  Brain,
  Dumbbell,
  FlaskConical,
  Trophy,
  Users,
  UserPlus,
  Sparkles,
  Menu,
  X,
} from "lucide-react";
import { AuroraBackground } from "@/components/ui/aurora-background";
import { Button } from "@/components/ui/button";
import { Marquee } from "@/components/ui/marquee";
import { supabase } from "@/integrations/supabase/client";
import { CadeLogo } from "@/components/CadeLogo";
import { FAQAccordionBlock } from "@/components/ui/faq-accordion-block-shadcnui";
import { DeviceShowcase } from "@/components/DeviceShowcase";
import { DashboardPlaceholder } from "@/components/device-showcase-screens";

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "Philosophy", href: "#philosophy" },
  { label: "FAQ", href: "#faq" },
  { label: "Contact", href: "/contact" },
];

export default function LandingPage() {
  const [email, setEmail] = useState("");
  const [betaStatus, setBetaStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [betaError, setBetaError] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  async function handleBetaSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBetaStatus("loading");
    setBetaError("");
    const { error } = await supabase.from("beta_signups").insert({ email: email.trim(), source: "landing_page" });
    if (error) {
      if (error.code === "23505") {
        setBetaStatus("success");
      } else {
        setBetaStatus("error");
        setBetaError("Something went wrong. Please try again.");
      }
    } else {
      setBetaStatus("success");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ── NAV ─────────────────────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2.5">
            <CadeLogo variant="full" size="xl" />
          </Link>
          {/* Desktop nav */}
          <nav className="hidden sm:flex items-center gap-8">
            {navLinks.map(({ label, href }) =>
              href.startsWith("/") ? (
                <Link
                  key={label}
                  to={href}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {label}
                </Link>
              ) : (
                <a
                  key={label}
                  href={href}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {label}
                </a>
              )
            )}
            <Link
              to="/auth"
              className="text-sm font-medium text-foreground hover:text-primary transition-colors"
            >
              Sign in
            </Link>
          </nav>
          {/* Desktop CTA + mobile hamburger */}
          <div className="flex items-center gap-3">
            <Link to="/auth" className="hidden sm:block">
              <Button size="sm" className="gap-2 rounded-lg font-medium">
                Get started <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
            <button
              className="sm:hidden flex items-center justify-center w-9 h-9 rounded-lg text-foreground hover:bg-accent transition-colors"
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((o) => !o)}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
        {/* Mobile dropdown */}
        {mobileMenuOpen && (
          <nav
            className="sm:hidden border-t border-border bg-background/95 backdrop-blur-xl"
            aria-label="Mobile navigation"
          >
            <div className="flex flex-col px-4 py-3 gap-1">
              {navLinks.map(({ label, href }) =>
                href.startsWith("/") ? (
                  <Link
                    key={label}
                    to={href}
                    className="px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {label}
                  </Link>
                ) : (
                  <a
                    key={label}
                    href={href}
                    className="px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {label}
                  </a>
                )
              )}
              <Link
                to="/auth"
                className="px-3 py-2.5 rounded-lg text-sm font-medium text-foreground hover:text-primary hover:bg-accent transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Sign in
              </Link>
              <div className="pt-2 pb-1">
                <Link to="/auth" onClick={() => setMobileMenuOpen(false)}>
                  <Button size="sm" className="w-full gap-2 rounded-lg font-medium">
                    Get started <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </Link>
              </div>
            </div>
          </nav>
        )}
      </header>

      {/* ── HERO ────────────────────────────────────────────────────────── */}
      <AuroraBackground className="min-h-screen pt-16">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.7, ease: "easeOut" }}
          className="relative flex flex-col items-center justify-center px-4 text-center gap-6 max-w-[1100px] mx-auto"
        >
          <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
            AI Running Coach
          </p>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-foreground leading-[1.1]">
            Train like<br />an athlete.
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-[560px] leading-relaxed">
            Cade coaches you the way elite runners are coached — with your actual physiology,
            your training history, and a plan that adjusts when life gets in the way.
          </p>
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-sm font-medium text-primary">
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            50% off at launch — for beta members
          </div>
          <div className="flex flex-col sm:flex-row gap-3 mt-2">
            <Link to="/auth">
              <Button size="lg" className="gap-2 rounded-full px-8">
                Get started <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <a href="#how-it-works">
              <Button
                size="lg"
                variant="outline"
                className="gap-2 rounded-full px-8 border-border bg-background/80 text-foreground hover:bg-accent hover:text-accent-foreground dark:border-white/30 dark:bg-white/10 dark:text-white dark:hover:bg-white/20 dark:hover:text-white"
              >
                See how it works
              </Button>
            </a>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Join 300+ runners already training with Cade
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Already have an account?{" "}
            <Link to="/auth" className="font-medium text-foreground hover:text-primary underline underline-offset-2">
              Sign in
            </Link>
          </p>
          <div className="flex flex-wrap items-center justify-center gap-5 text-sm text-muted-foreground mt-1">
            <span className="flex items-center gap-1.5">
              <Check className="w-4 h-4 text-green-600 shrink-0" />
              Free during beta
            </span>
            <span className="flex items-center gap-1.5 relative group cursor-help">
              <Check className="w-4 h-4 text-green-600 shrink-0" />
              Works with intervals.icu
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 rounded-md bg-popover border border-border shadow-sm text-xs text-popover-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                intervals.icu — free training log used by serious runners
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="w-4 h-4 text-green-600 shrink-0" />
              No credit card
            </span>
          </div>
        </motion.div>
      </AuroraBackground>

      {/* ── MARQUEE: devices & philosophies ─────────────────────────────── */}
      <section className="py-8 border-t border-border overflow-hidden bg-muted/20">
        <div className="flex flex-col gap-6">
          <Marquee pauseOnHover direction="left" duration={30} className="py-2">
            <span className="mx-8 text-lg font-medium text-muted-foreground">Garmin</span>
            <span className="mx-8 text-muted-foreground">·</span>
            <span className="mx-8 text-lg font-medium text-muted-foreground">Coros</span>
            <span className="mx-8 text-muted-foreground">·</span>
            <span className="mx-8 text-lg font-medium text-muted-foreground">Apple Watch</span>
            <span className="mx-8 text-muted-foreground">·</span>
            <span className="mx-8 text-lg font-medium text-muted-foreground">Polar</span>
            <span className="mx-8 text-muted-foreground">·</span>
            <span className="mx-8 text-lg font-medium text-muted-foreground">Suunto</span>
            <span className="mx-8 text-muted-foreground">·</span>
            <span className="mx-8 relative group cursor-help">
              <span className="text-lg font-medium text-muted-foreground">intervals.icu</span>
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 rounded-md bg-popover border border-border shadow-sm text-xs text-popover-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                intervals.icu — free training log used by serious runners
              </span>
            </span>
          </Marquee>
          <Marquee pauseOnHover direction="right" duration={40} className="py-2">
            <span className="mx-8 text-lg font-medium text-muted-foreground">80/20 Polarized</span>
            <span className="mx-8 text-muted-foreground">·</span>
            <span className="mx-8 text-lg font-medium text-muted-foreground">Jack Daniels VDOT</span>
            <span className="mx-8 text-muted-foreground">·</span>
            <span className="mx-8 text-lg font-medium text-muted-foreground">Lydiard</span>
            <span className="mx-8 text-muted-foreground">·</span>
            <span className="mx-8 text-lg font-medium text-muted-foreground">Hansons</span>
            <span className="mx-8 text-muted-foreground">·</span>
            <span className="mx-8 text-lg font-medium text-muted-foreground">Pfitzinger</span>
            <span className="mx-8 text-muted-foreground">·</span>
            <span className="mx-8 text-lg font-medium text-muted-foreground">Norwegian Method</span>
          </Marquee>
        </div>
      </section>

      {/* ── THE PROBLEM ─────────────────────────────────────────────────── */}
      <section className="py-24 px-4 sm:px-6 bg-muted/30 border-t border-border">
        <div className="max-w-[700px] mx-auto text-center">
          <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-6">
            Why Cade Exists
          </p>
          <h2 className="text-3xl sm:text-4xl font-semibold text-foreground mb-8 leading-snug">
            "Most running apps give you a plan.<br />
            None of them know you."
          </h2>
          <div className="text-left max-w-[600px] mx-auto">
            <p className="italic text-lg text-gray-500 dark:text-muted-foreground py-4">They don't know you played padel on Thursday.</p>
            <p className="italic text-lg text-gray-500 dark:text-muted-foreground py-4">They don't know work has been brutal this week.</p>
            <p className="italic text-lg text-gray-500 dark:text-muted-foreground py-4">They don't know your left achilles has been tight since October.</p>
            <p className="italic text-lg text-gray-500 dark:text-muted-foreground py-4">They give you Tuesday's interval session anyway.</p>
          </div>
          <p className="mt-10 text-2xl font-semibold text-gray-900 dark:text-foreground">Cade does.</p>
        </div>
      </section>

      {/* ── TESTIMONIALS ─────────────────────────────────────────────────── */}
      <section className="py-16 px-4 sm:px-6 border-t border-border bg-background">
        <div className="max-w-[1100px] mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                quote: "Cade moved my tempo run when I was tired without me even asking. Ran my first sub-45 10K last month.",
                name: "Erik L.",
                city: "Stockholm",
              },
              {
                quote: "I've tried Garmin Coach and TrainingPeaks. Nothing actually knew my training history like this.",
                name: "Sarah M.",
                city: "Oslo",
              },
              {
                quote: "The Norwegian method plan is frighteningly accurate. 8 weeks in and my easy pace has dropped 20 seconds.",
                name: "Mikael K.",
                city: "Gothenburg",
              },
            ].map(({ quote, name, city }) => (
              <div
                key={name}
                className="rounded-xl border border-border bg-card p-5 space-y-3"
              >
                <p className="text-sm italic text-muted-foreground leading-relaxed">"{quote}"</p>
                <p className="text-xs font-medium text-foreground">
                  {name} <span className="text-muted-foreground font-normal">· {city}</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SEE THE APP ─────────────────────────────────────────────────── */}
      <DeviceShowcase />

      {/* ── VISION ──────────────────────────────────────────────────────── */}
      <section id="philosophy" className="py-24 px-4 sm:px-6 border-t border-border">
        <div className="max-w-[1100px] mx-auto">
          <div className="max-w-[680px] mx-auto text-center">
            <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-6">
              Our Vision
            </p>
            <h2 className="text-3xl sm:text-[42px] font-semibold text-foreground mb-10 leading-snug">
              Elite coaching has always existed.<br />Just not for you.
            </h2>
            <div className="space-y-6 text-lg text-muted-foreground text-left">
              <p>
                Elite runners have always had an advantage — a real coach who knows their physiology,
                adjusts their plan week by week, and treats every session as data. That coach has
                never existed for the rest of us.
              </p>
              <p>
                Cade is built on the same training science used by Kipchoge's coaching team, the
                Norwegian national program, and the coaches behind the fastest marathon times in
                history. Double threshold. Back-to-back long runs. Lactate-controlled tempo. Not
                watered down — adapted for people who run before work, not for a living.
              </p>
              <p>
                We're building the coach that serious recreational runners never had. One that
                understands your physiology, your philosophy, and your life outside running.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ────────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-24 px-4 sm:px-6 bg-muted/30 border-t border-border">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-3">
              How It Works
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">Set up in 2 minutes.</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {[
              {
                icon: Link2,
                step: "1",
                title: "Connect your data",
                desc: "Link intervals.icu. Cade reads your training history, HRV, sleep, CTL and fitness curves. Garmin, Coros, Apple Watch and Polar sync via intervals.icu — direct connections coming soon.",
              },
              {
                icon: Trophy,
                step: "2",
                title: "Create your season",
                desc: "Add your races with A/B/C priorities, pick your end goal (e.g. Stockholm Marathon), and Cade auto-generates a plan that tapers around every race.",
              },
              {
                icon: Brain,
                step: "3",
                title: "Meet Coach Cade",
                desc: "Chat with your AI coach, do daily check-ins, and adapt your plan. Tired week? Coach Cade sees it in your HRV and TSB. Run with friends — share activities and invite them to workouts.",
              },
            ].map(({ icon: Icon, step, title, desc }) => (
              <div key={step} className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-xs font-semibold text-muted-foreground tracking-widest uppercase">
                    Step {step}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-foreground">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ────────────────────────────────────────────────────── */}
      <section id="features" className="py-24 px-4 sm:px-6 border-t border-border">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-3">
              What Cade Does
            </p>
            <h2 className="text-3xl sm:text-4xl font-semibold text-foreground">Built on your real data.</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: MessageCircle,
                title: "Coach Cade — AI Coach",
                desc: "Ask Coach Cade anything — pre-run readiness, post-workout analysis (every run interpreted automatically), race strategy, pacing. Every answer references your CTL, HRV and zones — never generic advice.",
                core: true,
              },
              {
                icon: Trophy,
                title: "Season Planning",
                desc: "Create your season with A/B/C races, set your end goal (e.g. Stockholm Marathon), and Cade generates a plan that tapers around every race.",
                core: true,
              },
              {
                icon: Calendar,
                title: "Philosophy-Based Training Plans",
                desc: "80/20 polarized, Jack Daniels VDOT, Lydiard, Pfitzinger, Hansons, Norwegian method. Doubles for high volume (e.g. 180 km/week) when you enable them.",
                core: true,
              },
              {
                icon: Users,
                title: "Community",
                desc: "Friend feed, activity sharing, likes, and full friend profiles. See what your friends are training for.",
              },
              {
                icon: UserPlus,
                title: "Workout Invites",
                desc: "Invite a friend to run together. Coach Cade creates a combined workout for both of you.",
              },
              {
                icon: Activity,
                title: "Total Load Management",
                desc: "Cade counts everything — running load, padel, gym, work stress, sleep deficit. Your CNS doesn't distinguish between stressors. Neither does Cade.",
              },
              {
                icon: Dumbbell,
                title: "Elite Session Library",
                desc: "Double threshold, back-to-back long runs, Norwegian singles, 30-30 VO2max intervals. Every session used by elite coaches — scaled to your level.",
              },
              {
                icon: FlaskConical,
                title: "Physiological Depth",
                desc: "CTL, ATL, TSB, HRV trends, lactate threshold estimates, aerobic decoupling, VO2max tracking. The data serious runners actually care about.",
              },
              {
                icon: Sparkles,
                title: "Weekly plan proposals",
                desc: "Review AI-proposed weeks, approve or tweak sessions, and keep your plan aligned with recovery — without losing the big picture.",
              },
            ].map(({ icon: Icon, title, desc, core }) => (
              <div
                key={title}
                className={`glass-card p-6 rounded-xl border transition-colors ${
                  core
                    ? "border-primary/40 hover:border-primary/60"
                    : "border-border hover:border-gray-300 dark:hover:border-border"
                }`}
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="w-6 h-6 text-primary stroke-[1.75]" />
                  </div>
                  <div className="flex-1 flex items-start justify-between pt-1.5 gap-2">
                    <h3 className="text-base font-medium text-foreground">{title}</h3>
                    {core && (
                      <span className="shrink-0 text-[10px] font-semibold tracking-wide uppercase px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                        Core
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ANCHOR ───────────────────────────────────────────────── */}
      <section className="py-16 px-4 sm:px-6 border-t border-border bg-muted/20">
        <div className="max-w-[680px] mx-auto text-center space-y-4">
          <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">Free now. Stays affordable.</h2>
          <p className="text-muted-foreground leading-relaxed">
            Cade Pro launches at €19.99/month. Beta members lock in 50% off forever — €9.99/month.
            Join free today, no credit card needed.
          </p>
          <Link to="/auth">
            <Button size="default" className="rounded-full px-6 gap-2 mt-2">
              Join free beta <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* ── BETA CTA ────────────────────────────────────────────────────── */}
      <section id="beta" className="py-24 px-4 sm:px-6 bg-muted/30 border-t border-border">
        <div className="max-w-[680px] mx-auto text-center">
          <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-6">
            Early Access
          </p>
          <h2 className="text-4xl sm:text-5xl font-semibold text-foreground mb-4 leading-snug">
            Free during beta.<br />Join now.
          </h2>
          <p className="text-lg text-muted-foreground mb-10">
            Cade is in private beta. Early members train free and get 50% off when we launch.
          </p>

          {betaStatus === "success" ? (
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center gap-2 text-green-600 text-lg font-semibold">
                <Check className="w-5 h-5" />
                You're on the list.
              </div>
              <p className="text-muted-foreground text-sm">
                We'll be in touch when your spot is ready.
              </p>
            </div>
          ) : (
            <form onSubmit={handleBetaSignup} className="flex flex-col sm:flex-row gap-3 max-w-[520px] mx-auto">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="flex-1 h-11 px-4 rounded-full border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <Button
                type="submit"
                size="default"
                className="rounded-full px-6 gap-2 shrink-0"
                disabled={betaStatus === "loading"}
              >
                {betaStatus === "loading" ? "Joining…" : "Join the beta"}
                {betaStatus !== "loading" && <ArrowRight className="w-4 h-4" />}
              </Button>
            </form>
          )}

          {betaStatus === "error" && (
            <p className="mt-3 text-sm text-destructive">{betaError}</p>
          )}

          {betaStatus !== "success" && (
            <p className="mt-4 text-xs text-muted-foreground">No credit card. No commitment. Cancel anytime.</p>
          )}

          <div className="flex flex-wrap items-center justify-center gap-5 text-sm text-muted-foreground mt-8">
            <span className="flex items-center gap-1.5 relative group cursor-help">
              <Check className="w-4 h-4 text-green-600 shrink-0" />
              Works with intervals.icu
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 rounded-md bg-popover border border-border shadow-sm text-xs text-popover-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                intervals.icu — free training log used by serious runners
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="w-4 h-4 text-green-600 shrink-0" />
              Garmin · Coros · Apple Watch · Polar
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="w-4 h-4 text-green-600 shrink-0" />
              Cancel anytime
            </span>
          </div>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────────── */}
      <FAQAccordionBlock />

      {/* ── FOOTER ──────────────────────────────────────────────────────── */}
      <footer className="py-6 px-4 sm:px-6 border-t border-border">
        <div className="max-w-[1100px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <CadeLogo variant="full" size="sm" />
            <span>© 2026</span>
          </div>
          <div className="flex items-center gap-6">
            <Link to="/auth" className="hover:text-foreground transition-colors">
              Sign in to app
            </Link>
            <Link to="/contact" className="hover:text-foreground transition-colors">
              Contact
            </Link>
            <Link to="/privacy" className="hover:text-foreground transition-colors">
              Privacy Policy
            </Link>
            <Link to="/terms" className="hover:text-foreground transition-colors">
              Terms of Service
            </Link>
            <a href="mailto:info@caderunning.com" className="hover:text-foreground transition-colors">
              info@caderunning.com
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
