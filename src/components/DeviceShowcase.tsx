import { motion } from "framer-motion";
import { DeviceIphone } from "@/components/ui/device-iphone";
import { DeviceMacbook } from "@/components/ui/device-macbook";
import {
  DashboardPlaceholder,
  StatsFitnessPlaceholder,
  StatsWellnessPlaceholder,
  PhilosophyPlaceholder,
  OnboardingPlaceholder,
} from "@/components/device-showcase-screens";

const GRAIN_BG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.14'/%3E%3C/svg%3E")`;

export function DeviceShowcase() {
  return (
    <section id="screenshots" className="relative border-t border-border bg-[#0F172A] py-24 overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.4]"
        style={{ backgroundImage: GRAIN_BG }}
        aria-hidden
      />
      <div className="relative mx-auto max-w-[1400px] px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
          className="mb-14 text-center"
        >
          <h2 className="text-3xl font-semibold text-slate-100 sm:text-4xl">
            See the app
          </h2>
          <p className="mx-auto mt-3 max-w-[560px] text-lg text-slate-400">
            Dashboard, stats, philosophy, and more — all in one place.
          </p>
        </motion.div>

        <div className="flex items-end justify-center gap-4 overflow-x-auto pb-4 md:gap-6 lg:gap-8" id="device-scroll-container">
          {/* Left phones */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="flex items-end gap-2 md:-mr-4 md:gap-4 scale-90 -rotate-[4deg] origin-bottom"
          >
            <DeviceIphone
              className="w-[200px] shrink-0 md:w-[220px] lg:w-[240px]"
            >
              <StatsFitnessPlaceholder />
            </DeviceIphone>
            <DeviceIphone
              className="w-[180px] shrink-0 md:w-[200px] lg:w-[220px]"
            >
              <PhilosophyPlaceholder />
            </DeviceIphone>
          </motion.div>

          {/* MacBook center */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="relative z-10 shrink-0"
          >
            <DeviceMacbook className="w-full max-w-[520px] md:max-w-[600px] lg:max-w-[680px]">
              <DashboardPlaceholder />
            </DeviceMacbook>
          </motion.div>

          {/* Right phones */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="flex items-end gap-2 md:-ml-4 md:gap-4 scale-90 rotate-[4deg] origin-bottom"
          >
            <DeviceIphone
              className="w-[180px] shrink-0 md:w-[200px] lg:w-[220px]"
            >
              <StatsWellnessPlaceholder />
            </DeviceIphone>
            <DeviceIphone
              className="w-[200px] shrink-0 md:w-[220px] lg:w-[240px]"
            >
              <OnboardingPlaceholder />
            </DeviceIphone>
          </motion.div>
        </div>

        {/* Navigation dots */}
        <div className="flex justify-center gap-2 mt-8">
          {["Stats", "Philosophy", "Dashboard", "Wellness", "Onboarding"].map((label, i) => (
            <div
              key={label}
              title={label}
              className={`rounded-full transition-all ${
                i === 2
                  ? "w-4 h-1.5 bg-slate-400"
                  : "w-1.5 h-1.5 bg-slate-600"
              }`}
            />
          ))}
        </div>
        <p className="text-center text-xs text-slate-500 mt-3 md:hidden">Scroll to explore</p>
      </div>
    </section>
  );
}
