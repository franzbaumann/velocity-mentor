import { AppLayout } from "@/components/AppLayout";
import { Marquee } from "@/components/ui/marquee";
import { BookOpen, ChevronDown } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

interface Philosophy {
  name: string;
  slug: string;
  founder: string;
  principle: string;
  distribution: { easy: number; moderate: number; hard: number };
  bestFor: string;
  athletes: string;
  weekly: string;
}

const philosophies: Philosophy[] = [
  {
    name: "80/20 Polarized",
    slug: "polarized",
    founder: "Stephen Seiler",
    principle:
      "80% of training at low intensity, 20% at high intensity. Nothing in between. The simplest and most research-backed approach.",
    distribution: { easy: 80, moderate: 0, hard: 20 },
    bestFor:
      "Time-crunched athletes who want maximum results from minimal structure",
    athletes: "Jakob Ingebrigtsen, many Olympic distance runners",
    weekly:
      "Mon: Rest, Tue: Easy 50min, Wed: Intervals 8x1000m, Thu: Easy 45min, Fri: Easy 40min, Sat: Long Run 90min, Sun: Tempo 30min",
  },
  {
    name: "Jack Daniels VDOT",
    slug: "jack-daniels",
    founder: "Jack Daniels",
    principle:
      "Five precise zones (E/M/T/I/R) all calculated from your most recent race time. Every workout has a specific physiological purpose.",
    distribution: { easy: 70, moderate: 10, hard: 20 },
    bestFor:
      "Data-driven athletes who love precise paces and structured plans",
    athletes: "Jim Ryun, Alberto Salazar's coached athletes",
    weekly:
      "Mon: Rest, Tue: E 45min, Wed: I 5x1000m @ I pace, Thu: E 40min, Fri: T 20min tempo, Sat: Long E 90min, Sun: E + strides",
  },
  {
    name: "Lydiard",
    slug: "lydiard",
    founder: "Arthur Lydiard",
    principle:
      "Build a massive aerobic base first over months, then add speed work only in the final phase before racing. Patience is the ultimate weapon.",
    distribution: { easy: 85, moderate: 10, hard: 5 },
    bestFor:
      "Patient athletes willing to invest months in base building for breakthrough races",
    athletes: "Peter Snell, Murray Halberg, Barry Magee",
    weekly:
      "Mon: Easy 60min, Tue: Easy 75min, Wed: Easy 60min, Thu: Easy 45min, Fri: Easy 60min, Sat: Long 2h, Sun: Easy 50min",
  },
  {
    name: "Hansons",
    slug: "hansons",
    founder: "Hansons-Brooks",
    principle:
      "Cumulative fatigue approach. No single run over 26km, but the weekly volume and back-to-back quality sessions simulate marathon-specific stress.",
    distribution: { easy: 65, moderate: 20, hard: 15 },
    bestFor:
      "Marathon runners who want to simulate race-day fatigue without extremely long runs",
    athletes: "Desiree Linden (2018 Boston Marathon winner)",
    weekly:
      "Mon: Easy 8km, Tue: Speed 12x400m, Wed: Easy 10km, Thu: Tempo 10km @ MP, Fri: Easy 8km, Sat: Long 25km, Sun: Rest",
  },
  {
    name: "Pfitzinger",
    slug: "pfitzinger",
    founder: "Pete Pfitzinger",
    principle:
      "High volume (100+ km/week), mid-week long runs (MLR), and lactate threshold focus. The approach that built champions through consistent, high mileage.",
    distribution: { easy: 75, moderate: 15, hard: 10 },
    bestFor:
      "Experienced runners comfortable with 80-120km weeks and structured periodization",
    athletes: "Pete Pfitzinger himself (2x Olympic marathoner)",
    weekly:
      "Mon: Rest/Easy, Tue: LT 14km w/ 8km @ LT, Wed: MLR 18km, Thu: Easy 10km, Fri: VO2max 5x1200m, Sat: Long 28km, Sun: Recovery 10km",
  },
  {
    name: "Norwegian Method",
    slug: "norwegian",
    founder: "Gjert Ingebrigtsen / Norwegian school",
    principle:
      "Threshold-dominant training built around double threshold sessions — two threshold workouts in one day separated by 4–6 hours. Minimal VO2max work. Lactate-controlled intensity at LT1–LT2. For most athletes adapted as AM easy + PM threshold.",
    distribution: { easy: 70, moderate: 20, hard: 10 },
    bestFor:
      "Athletes with a solid aerobic base (CTL 55+) who want lactate-controlled threshold focus",
    athletes: "Jakob Ingebrigtsen, Norwegian middle-distance tradition",
    weekly:
      "Mon: Easy 45min, Tue: AM Easy 40min + PM Threshold 4x8min, Wed: Easy 50min, Thu: AM Easy 35min + PM Threshold 25min, Fri: Easy 45min, Sat: Long 90min easy, Sun: Easy 40min",
  },
  {
    name: "Japanese / Ekiden-style",
    slug: "ekiden",
    founder: "Japanese distance running tradition",
    principle:
      "Extremely high aerobic volume with group-oriented training. Long steady jogs (jogingu) at moderate effort build a massive aerobic base. Quality sessions are shorter but very intense — track repetitions at race pace. Morning runs are a non-negotiable daily habit. Volume before intensity; base periods are long and patient.",
    distribution: { easy: 85, moderate: 10, hard: 5 },
    bestFor:
      "Athletes who can run high volume and prefer group-based, consistent structure",
    athletes: "Japanese university and corporate league runners, ekiden athletes",
    weekly:
      "Mon: AM Jog 60min, Tue: AM Jog 50min + PM Track 8x1km, Wed: AM Jog 70min, Thu: AM Jog 50min, Fri: AM Jog 60min, Sat: Long Jog 2h, Sun: AM Jog 45min",
  },
  {
    name: "Kenyan/Ethiopian Model",
    slug: "kenyan",
    founder: "East African tradition",
    principle:
      "High altitude, twice-daily easy running, and extreme patience with aerobic base. Speed emerges naturally from years of consistent volume.",
    distribution: { easy: 90, moderate: 5, hard: 5 },
    bestFor:
      "Athletes who can run twice daily and want to build a lifetime aerobic engine",
    athletes: "Eliud Kipchoge, Kenenisa Bekele, Haile Gebrselassie",
    weekly:
      "Mon: AM Easy 40min + PM Easy 30min, Tue: AM Fartlek 50min + PM Easy 30min, Wed: AM Easy 50min + PM Easy 30min, Thu: AM Tempo 40min + PM Easy 30min, Fri: AM Easy 40min + PM Easy 30min, Sat: AM Long 90min, Sun: Rest",
  },
];

function DistributionBar({
  easy,
  moderate,
  hard,
}: {
  easy: number;
  moderate: number;
  hard: number;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex h-3 w-full overflow-hidden rounded-full">
        {easy > 0 && (
          <div
            className="transition-all"
            style={{
              width: `${easy}%`,
              backgroundColor: "hsl(142 76% 36%)",
            }}
          />
        )}
        {moderate > 0 && (
          <div
            className="transition-all"
            style={{
              width: `${moderate}%`,
              backgroundColor: "hsl(45 93% 47%)",
            }}
          />
        )}
        {hard > 0 && (
          <div
            className="transition-all"
            style={{
              width: `${hard}%`,
              backgroundColor: "hsl(0 84% 60%)",
            }}
          />
        )}
      </div>
      <div className="flex gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: "hsl(142 76% 36%)" }}
          />
          Easy {easy}%
        </span>
        {moderate > 0 && (
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: "hsl(45 93% 47%)" }}
            />
            Moderate {moderate}%
          </span>
        )}
        <span className="flex items-center gap-1">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: "hsl(0 84% 60%)" }}
          />
          Hard {hard}%
        </span>
      </div>
    </div>
  );
}

function PhilosophyCard({ philosophy }: { philosophy: Philosophy }) {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();

  const weekDays = philosophy.weekly.split(", ").map((entry) => {
    const [day, ...rest] = entry.split(": ");
    return { day, workout: rest.join(": ") };
  });

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <BookOpen className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-semibold text-base leading-tight">
            {philosophy.name}
          </h3>
          <p className="text-xs text-muted-foreground">{philosophy.founder}</p>
        </div>
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed">
        {philosophy.principle}
      </p>

      <DistributionBar {...philosophy.distribution} />

      <div className="space-y-1.5">
        <p className="text-sm">
          <span className="font-medium">Best for:</span>{" "}
          <span className="text-muted-foreground">{philosophy.bestFor}</span>
        </p>
        <p className="text-sm">
          <span className="font-medium">Famous athletes:</span>{" "}
          <span className="text-muted-foreground">{philosophy.athletes}</span>
        </p>
      </div>

      <div className="border-t border-border pt-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-between text-sm font-medium hover:text-primary transition-colors"
        >
          Weekly structure
          <ChevronDown
            className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
        {expanded && (
          <div className="mt-3 grid grid-cols-1 gap-1">
            {weekDays.map(({ day, workout }) => (
              <div key={day} className="flex gap-2 text-sm">
                <span className="w-10 shrink-0 font-medium text-muted-foreground">
                  {day}
                </span>
                <span className="text-foreground">{workout}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={() => navigate(`/plan?philosophy=${philosophy.slug}`)}
        className="mt-1 w-full rounded-lg border border-primary/40 bg-primary/5 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10 transition-colors text-left"
      >
        Train with {philosophy.name} →
      </button>
    </div>
  );
}

export default function Philosophy() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Training Philosophies
          </h1>
          <p className="text-muted-foreground mt-1">
            Find the approach that fits your physiology
          </p>
        </div>

        <p className="text-muted-foreground text-center mb-6">Cade supports all major training philosophies. Pick one to shape your plan.</p>

        <div className="overflow-hidden -mx-4 py-3 border-y border-border">
          <Marquee pauseOnHover direction="right" duration={45} className="py-1" fadeAmount={12}>
            <span className="mx-6 text-sm font-medium text-muted-foreground">80/20 Polarized</span>
            <span className="mx-6 text-muted-foreground/50">·</span>
            <span className="mx-6 text-sm font-medium text-muted-foreground">Jack Daniels VDOT</span>
            <span className="mx-6 text-muted-foreground/50">·</span>
            <span className="mx-6 text-sm font-medium text-muted-foreground">Lydiard</span>
            <span className="mx-6 text-muted-foreground/50">·</span>
            <span className="mx-6 text-sm font-medium text-muted-foreground">Hansons</span>
            <span className="mx-6 text-muted-foreground/50">·</span>
            <span className="mx-6 text-sm font-medium text-muted-foreground">Pfitzinger</span>
            <span className="mx-6 text-muted-foreground/50">·</span>
            <span className="mx-6 text-sm font-medium text-muted-foreground">Norwegian Method</span>
            <span className="mx-6 text-muted-foreground/50">·</span>
            <span className="mx-6 text-sm font-medium text-muted-foreground">Japanese / Ekiden</span>
            <span className="mx-6 text-muted-foreground/50">·</span>
            <span className="mx-6 text-sm font-medium text-muted-foreground">Kenyan/Ethiopian</span>
          </Marquee>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {philosophies.map((p) => (
            <PhilosophyCard key={p.name} philosophy={p} />
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
