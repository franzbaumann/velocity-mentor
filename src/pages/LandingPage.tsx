import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Zap,
  Activity,
  BarChart2,
  Calendar,
  MessageCircle,
  ArrowRight,
  Check,
  Link2,
  Brain,
  TrendingUp,
  Dumbbell,
  FlaskConical,
  Trophy,
} from "lucide-react";
import { AuroraBackground } from "@/components/ui/aurora-background";
import { Button } from "@/components/ui/button";
import { Marquee } from "@/components/ui/marquee";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { supabase } from "@/integrations/supabase/client";

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "Philosophy", href: "#philosophy" },
];

const SCREENSHOTS = [
  { src: "/screenshots/dashboard.png", label: "Dashboard" },
  { src: "/screenshots/stats-fitness.png", label: "Fitness & Fatigue" },
  { src: "/screenshots/stats-wellness.png", label: "Wellness & Recovery" },
  { src: "/screenshots/philosophy.png", label: "Training Philosophies" },
  { src: "/screenshots/onboarding.png", label: "Get started" },
];

export default function LandingPage() {
  const [email, setEmail] = useState("");
  const [betaStatus, setBetaStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [betaError, setBetaError] = useState("");

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
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold text-foreground tracking-tight">Cade</span>
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
          <a href="#beta">
            <Button size="sm" className="gap-2 rounded-full">
              Join beta <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </a>
        </div>
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
          <div className="flex flex-col sm:flex-row gap-3 mt-2">
            <a href="#beta">
              <Button size="lg" className="gap-2 rounded-full px-8">
                Join the beta <ArrowRight className="w-4 h-4" />
              </Button>
            </a>
            <a href="#features">
              <Button size="lg" variant="outline" className="gap-2 rounded-full px-8">
                See how it works
              </Button>
            </a>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-5 text-sm text-muted-foreground mt-1">
            <span className="flex items-center gap-1.5">
              <Check className="w-4 h-4 text-green-600 shrink-0" />
              Free during beta
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="w-4 h-4 text-green-600 shrink-0" />
              Works with your Garmin, Coros or Apple Watch
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
            <span className="mx-8 text-lg font-medium text-muted-foreground">intervals.icu</span>
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

      {/* ── SEE THE APP ─────────────────────────────────────────────────── */}
      <section id="screenshots" className="py-24 px-4 sm:px-6 border-t border-border">
        <div className="max-w-[900px] mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-3">
              See the app
            </h2>
            <p className="text-lg text-muted-foreground max-w-[560px] mx-auto">
              Your dashboard, stats, and training philosophy in one place.
            </p>
          </div>
          <Carousel opts={{ loop: true, align: "center" }} className="w-full">
            <CarouselContent>
              {SCREENSHOTS.map(({ src, label }) => (
                <CarouselItem key={src}>
                  <div className="rounded-xl border border-border overflow-hidden bg-muted/20 shadow-lg">
                    <img
                      src={src}
                      alt={label}
                      className="w-full max-w-full object-contain"
                    />
                    <p className="text-sm text-muted-foreground text-center py-3 border-t border-border">
                      {label}
                    </p>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious className="left-0 sm:-left-12" />
            <CarouselNext className="right-0 sm:-right-12" />
          </Carousel>
        </div>
      </section>

      {/* ── THE PROBLEM ─────────────────────────────────────────────────── */}
      <section className="py-24 px-4 sm:px-6 bg-muted/30 border-t border-border">
        <div className="max-w-[700px] mx-auto text-center">
          <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-6">
            Why Cade Exists
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-8 leading-snug">
            "Most running apps give you a plan.<br />
            None of them know you."
          </h2>
          <div className="space-y-4 text-lg text-muted-foreground text-left max-w-[600px] mx-auto">
            <p className="italic">They don't know you played padel on Thursday.</p>
            <p className="italic">They don't know work has been brutal this week.</p>
            <p className="italic">They don't know your left achilles has been tight since October.</p>
            <p className="italic">They give you Tuesday's interval session anyway.</p>
          </div>
          <p className="mt-10 text-xl font-semibold text-foreground">Cade does.</p>
        </div>
      </section>

      {/* ── VISION ──────────────────────────────────────────────────────── */}
      <section id="philosophy" className="py-24 px-4 sm:px-6 border-t border-border">
        <div className="max-w-[1100px] mx-auto">
          <div className="max-w-[680px] mx-auto text-center">
            <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-6">
              Our Vision
            </p>
            <h2 className="text-3xl sm:text-[42px] font-bold text-foreground mb-10 leading-snug">
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
      <section className="py-24 px-4 sm:px-6 bg-muted/30 border-t border-border">
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
                desc: "Link your intervals.icu account. Cade instantly reads your full training history, HRV, sleep, CTL and fitness curves. Works with Garmin, Coros, Apple Watch and Polar.",
              },
              {
                icon: Brain,
                step: "2",
                title: "Meet Coach Cade, your coach",
                desc: "Coach Cade analyses your physiology and builds a training plan around your goal, your philosophy and your current fitness. Not a template — built from your actual data.",
              },
              {
                icon: TrendingUp,
                step: "3",
                title: "Your plan adapts",
                desc: "Every session adjusts in real time. Tired week? Coach Cade sees it in your HRV and TSB before you do. Big race coming? Your load is managed automatically.",
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
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">Built on your real data.</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {[
              {
                icon: MessageCircle,
                title: "Coach Cade — AI Coach",
                desc: "Ask Coach Cade anything. Pre-run readiness, post-workout analysis, race strategy, pacing questions. Every answer references your actual CTL, HRV and training zones — never generic advice.",
              },
              {
                icon: Activity,
                title: "Total Load Management",
                desc: "Cade counts everything — running load, padel, gym, work stress, sleep deficit. Your CNS doesn't distinguish between stressors. Neither does Cade.",
              },
              {
                icon: Calendar,
                title: "Philosophy-Based Training Plans",
                desc: "80/20 polarized, Jack Daniels VDOT, Lydiard, Pfitzinger, Hansons, Norwegian method. Choose your philosophy — Cade builds every session around it.",
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
                icon: Trophy,
                title: "Post-Workout Analysis",
                desc: "Every run automatically analysed. Coach Cade tells you what the numbers mean and what to do differently next time. No logging required.",
              },
            ].map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="glass-card p-8 rounded-xl border border-border hover:border-primary/30 transition-colors"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground">{title}</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BETA CTA ────────────────────────────────────────────────────── */}
      <section id="beta" className="py-24 px-4 sm:px-6 bg-muted/30 border-t border-border">
        <div className="max-w-[680px] mx-auto text-center">
          <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-6">
            Early Access
          </p>
          <h2 className="text-4xl sm:text-5xl font-bold text-foreground mb-4 leading-snug">
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
            <span className="flex items-center gap-1.5">
              <Check className="w-4 h-4 text-green-600 shrink-0" />
              Works with intervals.icu
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

      {/* ── FOOTER ──────────────────────────────────────────────────────── */}
      <footer className="py-6 px-4 sm:px-6 border-t border-border">
        <div className="max-w-[1100px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-primary flex items-center justify-center">
              <Zap className="w-3 h-3 text-primary-foreground" />
            </div>
            <span className="font-medium text-foreground">Cade</span>
            <span>© 2026</span>
          </div>
          <div className="flex items-center gap-6">
            <Link to="/auth" className="hover:text-foreground transition-colors">
              Sign in to app
            </Link>
            <a href="mailto:hello@caderunning.com" className="hover:text-foreground transition-colors">
              hello@caderunning.com
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
