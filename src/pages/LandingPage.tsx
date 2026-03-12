import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Zap, Activity, BarChart2, BarChart3, MessageCircle, Calendar, BookOpen, ArrowRight, Check, MoveRight } from "lucide-react";
import { PricingCardComponent } from "@/components/ui/pricing-card-component";
import { AuroraBackground } from "@/components/ui/aurora-background";
import { Button } from "@/components/ui/button";

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
  { label: "Philosophy", href: "#philosophy" },
];

function AnimatedHeroWords() {
  const [titleNumber, setTitleNumber] = useState(0);
  const titles = useMemo(() => ["smarter", "faster", "stronger", "better"], []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setTitleNumber(titleNumber === titles.length - 1 ? 0 : titleNumber + 1);
    }, 2000);
    return () => clearTimeout(timeoutId);
  }, [titleNumber, titles]);

  return (
    <span className="relative flex w-full justify-center overflow-hidden text-center md:pb-4 md:pt-1">
      &nbsp;
      {titles.map((title, index) => (
        <motion.span
          key={index}
          className="absolute font-semibold"
          initial={{ opacity: 0, y: "-100" }}
          transition={{ type: "spring", stiffness: 50 }}
          animate={
            titleNumber === index
              ? { y: 0, opacity: 1 }
              : { y: titleNumber > index ? -150 : 150, opacity: 0 }
          }
        >
          {title}
        </motion.span>
      ))}
    </span>
  );
}

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
          <div className="flex items-center gap-3">
            <Link to="/auth">
              <Button size="sm" className="gap-2">
                Get started <MoveRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link
              to="/auth"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <AuroraBackground className="min-h-[90vh] h-auto pt-24 pb-12">
        <motion.div
          initial={{ opacity: 0.0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8, ease: "easeInOut" }}
          className="relative flex flex-col gap-4 items-center justify-center px-4"
        >
          <div className="flex flex-col gap-4">
            <h1 className="text-5xl md:text-7xl max-w-2xl tracking-tighter text-center font-regular">
              <span className="text-foreground">Train</span>
              <AnimatedHeroWords />
            </h1>
            <p className="text-lg md:text-xl leading-relaxed tracking-tight text-muted-foreground max-w-2xl text-center">
              An AI running coach that reads your actual training data from intervals.icu — not generic advice. Personalized plans, real-time coaching, and stats that matter.
            </p>
          </div>
          <div className="flex flex-row gap-3 mt-4">
            <Link to="/auth">
              <Button size="lg" variant="outline" className="gap-4">
                See how it works <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link to="/auth">
              <Button size="lg" className="gap-4">
                Get started free <MoveRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
          <p className="text-sm text-muted-foreground/80 mt-2">
            Powered by your intervals.icu data. No credit card required.
          </p>
        </motion.div>
      </AuroraBackground>

      <section className="pt-8 pb-20 px-4 sm:px-6 overflow-hidden">
        <div className="max-w-5xl mx-auto">
          <div className="glass-card p-4 sm:p-6 rounded-2xl border border-border overflow-hidden">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {[
                { icon: Activity, label: "Activities", desc: "Runs synced from intervals.icu" },
                { icon: Calendar, label: "Training Plan", desc: "Plans for your goal & schedule" },
                { icon: BarChart3, label: "Stats", desc: "CTL, pace, PRs, readiness" },
                { icon: MessageCircle, label: "Kipcoachee", desc: "Coach that knows your data", badge: "AI Coach" },
                { icon: BookOpen, label: "Philosophy", desc: "Polarized, 80/20, or custom" },
              ].map(({ icon: Icon, label, desc, badge }) => (
                <div
                  key={label}
                  className="glass-card p-4 rounded-xl border border-border hover:border-primary/30 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <p className="font-medium text-foreground text-sm flex items-center gap-2">
                    {label}
                    {badge && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/15 text-primary">
                        {badge}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-12 flex flex-col items-center">
            <div className="w-full max-w-3xl rounded-xl border-2 border-border bg-gradient-to-br from-muted/80 to-muted p-1 shadow-lg overflow-hidden">
              <div className="rounded-lg bg-background/95 border border-border overflow-hidden aspect-video flex items-center justify-center min-h-[240px]">
                <p className="text-sm text-muted-foreground">Dashboard preview coming soon</p>
              </div>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">See your training data come to life.</p>
          </div>
        </div>
      </section>

      <section className="py-12 px-4 sm:px-6 border-t border-border bg-muted/30">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-3 gap-8 text-center">
            <div>
              <p className="text-2xl font-bold text-foreground">500+ runners</p>
              <p className="text-sm text-muted-foreground mt-0.5">Already training</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">intervals.icu native</p>
              <p className="text-sm text-muted-foreground mt-0.5">No Strava setup needed</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">Free to start</p>
              <p className="text-sm text-muted-foreground mt-0.5">No credit card</p>
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
                desc: "Your personal AI running coach — named after Eliud Kipchoge's training philosophy. Chat about workouts, pacing, race strategy. Uses your activities, CTL, and wellness — not generic advice.",
                icon: MessageCircle,
                iconColor: "text-blue-600",
                iconBg: "bg-blue-500/10",
                borderColor: "border-l-blue-600",
              },
              {
                title: "intervals.icu sync",
                desc: "Activities, fitness curves, HRV, sleep. One API key. No Strava or Garmin setup.",
                icon: Zap,
                iconColor: "text-green-600",
                iconBg: "bg-green-500/10",
                borderColor: "border-l-green-600",
              },
              {
                title: "Training plans",
                desc: "Generated for your goal, days per week, and philosophy. Easy, tempo, intervals, long runs.",
                icon: Calendar,
                iconColor: "text-purple-600",
                iconBg: "bg-purple-500/10",
                borderColor: "border-l-purple-600",
              },
              {
                title: "Stats",
                desc: "Weekly mileage, pace progression, PRs, readiness scores. All from your synced data.",
                icon: BarChart2,
                iconColor: "text-orange-600",
                iconBg: "bg-orange-500/10",
                borderColor: "border-l-orange-600",
              },
            ].map(({ title, desc, icon: Icon, iconColor, iconBg, borderColor }) => (
              <div
                key={title}
                className={`glass-card p-8 rounded-xl border border-border border-l-[3px] ${borderColor} hover:shadow-md transition-shadow`}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center ${iconColor}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    {title}
                    {title === "Kipcoachee" && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/15 text-blue-600">
                        AI Coach
                      </span>
                    )}
                  </h3>
                </div>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="py-20 px-4 sm:px-6 border-t border-border">
        <PricingCardComponent
          heading="Simple, transparent pricing"
          subheading="Choose the plan that fits your training goals."
          plans={[
            {
              name: "Starter",
              price: "3.99",
              yearlyPrice: "2.99",
              period: "month",
              features: [
                "intervals.icu sync",
                "Basic stats & CTL",
                "Email support",
              ],
              description: "Perfect for getting started.",
              buttonText: "Get started",
              href: "/auth",
              isPopular: false,
            },
            {
              name: "Pro",
              price: "9.99",
              yearlyPrice: "7.99",
              period: "month",
              features: [
                "Everything in Starter",
                "Kipcoachee AI coach",
                "Training plans",
                "Pace progression & PRs",
              ],
              description: "For serious runners.",
              buttonText: "Upgrade",
              href: "/auth",
              isPopular: true,
            },
            {
              name: "Elite",
              price: "19",
              yearlyPrice: "14.99",
              period: "month",
              features: [
                "Everything in Pro",
                "Unlimited coaching",
                "Priority support",
                "Custom philosophy",
              ],
              description: "For athletes who want the best.",
              buttonText: "Contact us",
              href: "/auth",
              isPopular: false,
            },
          ]}
        />
      </section>

      <section id="philosophy" className="py-20 px-4 sm:px-6 border-t border-border">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-4">
            Start training with a coach that actually knows you.
          </h2>
          <p className="text-muted-foreground mb-8">
            Connect intervals.icu once. Get a personalized plan, AI coaching, and stats — all from your real data. Free to start.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-8">
            <Link
              to="/auth"
              className="pill-button bg-primary text-primary-foreground px-8 py-3 text-base font-medium inline-flex gap-2 w-full sm:w-auto justify-center"
            >
              Get started
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="#features"
              className="pill-button border border-border bg-transparent text-foreground hover:bg-muted px-8 py-3 text-base font-medium w-full sm:w-auto text-center inline-flex justify-center"
            >
              See how it works
            </a>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Check className="w-4 h-4 text-green-600 shrink-0" />
              Free plan available
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="w-4 h-4 text-green-600 shrink-0" />
              No Strava needed
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="w-4 h-4 text-green-600 shrink-0" />
              Setup in 2 minutes
            </span>
          </div>
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
