import { useState, useMemo, useCallback } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useSeason } from "@/hooks/useSeason";
import { SEASON_CONFIGS, PRIORITY_LABELS } from "@/lib/season/config";
import { getTaperPlan, calculateTaperStart, daysUntil } from "@/lib/season/periodisation";
import type {
  SeasonType,
  RacePriority,
  SeasonRace,
  CompetitionSeason,
} from "@/lib/season/types";
import { supabase } from "@/integrations/supabase/client";
import {
  Trophy,
  Calendar,
  Plus,
  ChevronRight,
  ChevronLeft,
  Loader2,
  X,
  Pencil,
  Check,
  Clock,
  MapPin,
  Trash2,
  PlusCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { DateWheelPicker } from "@/components/ui/date-wheel-picker";
import { TimeWheelPicker } from "@/components/ui/time-wheel-picker";
import { parseGoalTimeToSeconds, formatSecondsToGoalTime } from "@/lib/format";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";

const SEASON_TYPES: { type: SeasonType; label: string; emoji: string }[] = [
  { type: "indoor_track", label: "Indoor Track", emoji: "🏟️" },
  { type: "outdoor_track", label: "Outdoor Track", emoji: "🏃" },
  { type: "road", label: "Road", emoji: "🛣️" },
  { type: "cross_country", label: "Cross Country", emoji: "🌿" },
];

const PRIORITY_COLORS: Record<RacePriority, string> = {
  A: "bg-primary text-primary-foreground",
  B: "bg-yellow-500/80 text-black",
  C: "bg-muted text-muted-foreground",
};

const PRIORITY_DOT: Record<RacePriority, string> = {
  A: "bg-primary",
  B: "bg-yellow-500",
  C: "bg-muted-foreground/50",
};

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateShort(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// ── Empty State ─────────────────────────────────────────────────────────────
function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
        <Trophy className="w-8 h-8 text-primary" />
      </div>
      <h2 className="text-2xl font-bold text-foreground mb-2">Plan your season</h2>
      <p className="text-muted-foreground max-w-md mb-8">
        Racing one event is a goal. Racing a full season is a strategy. Add your races, set
        priorities, and Coach Cade will peak you for the ones that matter.
      </p>
      <Button onClick={onCreate} size="lg">
        <Plus className="w-4 h-4 mr-2" /> Create your season
      </Button>
    </div>
  );
}

// ── Creation Wizard ─────────────────────────────────────────────────────────
interface WizardRace {
  name: string;
  date: string;
  distance: string;
  venue: string;
  priority: RacePriority;
  goal_time: string;
}

function CreationWizard({ onDone }: { onDone: () => void }) {
  const { createSeason, isCreating } = useSeason();
  const [step, setStep] = useState(1);
  const [seasonType, setSeasonType] = useState<SeasonType | null>(null);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [primaryDistance, setPrimaryDistance] = useState("");
  const [races, setRaces] = useState<WizardRace[]>([]);

  const [rName, setRName] = useState("");
  const [rDate, setRDate] = useState("");
  const [rDistance, setRDistance] = useState("");
  const [rVenue, setRVenue] = useState("");
  const [rPriority, setRPriority] = useState<RacePriority>("B");
  const [rGoal, setRGoal] = useState("");

  const cfg = seasonType ? SEASON_CONFIGS[seasonType] : null;

  const selectType = (t: SeasonType) => {
    setSeasonType(t);
    const c = SEASON_CONFIGS[t];
    const year = new Date().getFullYear();
    setName(`${c.label} ${year}`);
    setStep(2);
  };

  const addRace = () => {
    if (!rName || !rDate || !rDistance) return;
    setRaces((p) => [...p, { name: rName, date: rDate, distance: rDistance, venue: rVenue, priority: rPriority, goal_time: rGoal }]);
    setRName(""); setRDate(""); setRDistance(""); setRVenue(""); setRGoal("");
    setRPriority("B");
  };

  const removeRace = (i: number) => setRaces((p) => p.filter((_, idx) => idx !== i));

  const sortedRaces = useMemo(() => [...races].sort((a, b) => a.date.localeCompare(b.date)), [races]);

  const handleCreate = async () => {
    if (!seasonType) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const uid = session.user.id;

    try {
      await createSeason({
        season: {
          user_id: uid,
          name,
          season_type: seasonType,
          start_date: startDate,
          end_date: endDate,
          primary_distance: primaryDistance || null,
          status: "active",
          notes: null,
        },
        races: races.map((r) => ({
          user_id: uid,
          name: r.name,
          date: r.date,
          distance: r.distance,
          venue: r.venue || null,
          surface: cfg?.surface ?? null,
          priority: r.priority,
          goal_time: r.goal_time || null,
          actual_time: null,
          actual_place: null,
          notes: null,
          status: "upcoming" as const,
          activity_id: null,
        })),
      });
      toast.success("Season created!");
      onDone();
    } catch {
      toast.error("Failed to create season");
    }
  };

  const counts = useMemo(() => {
    const c = { A: 0, B: 0, C: 0 };
    races.forEach((r) => c[r.priority]++);
    return c;
  }, [races]);

          return (
    <div className="max-w-2xl mx-auto py-8">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <button
              onClick={() => { if (s < step) setStep(s); }}
              className={`w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center transition-colors ${
                s === step ? "bg-primary text-primary-foreground" : s < step ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
              }`}
            >
              {s < step ? <Check className="w-4 h-4" /> : s}
            </button>
            {s < 4 && <div className={`w-8 h-0.5 ${s < step ? "bg-primary/40" : "bg-border"}`} />}
              </div>
        ))}
              </div>

      {/* STEP 1 — Season Type */}
      {step === 1 && (
        <div>
          <h2 className="text-xl font-bold text-foreground mb-1">What kind of season?</h2>
          <p className="text-muted-foreground text-sm mb-6">Choose the type that best fits your race calendar.</p>
          <div className="grid grid-cols-2 gap-3">
            {SEASON_TYPES.map(({ type, label, emoji }) => (
              <button
                key={type}
                onClick={() => selectType(type)}
                className={`p-5 rounded-xl border text-left transition-all hover:border-primary/50 ${
                  seasonType === type ? "border-primary bg-primary/5" : "border-border bg-card"
                }`}
              >
                <span className="text-2xl mb-2 block">{emoji}</span>
                <span className="font-semibold text-foreground block">{label}</span>
                <span className="text-xs text-muted-foreground">{SEASON_CONFIGS[type].notes}</span>
            </button>
            ))}
      </div>
      <button
            onClick={() => selectType("mixed")}
            className={`mt-3 w-full p-4 rounded-xl border text-left transition-all hover:border-primary/50 ${
              seasonType === "mixed" ? "border-primary bg-primary/5" : "border-border bg-card"
            }`}
          >
            <span className="font-semibold text-foreground">🔀 Mixed season</span>
            <span className="text-xs text-muted-foreground ml-2">Multiple disciplines or a custom combination</span>
      </button>
    </div>
      )}

      {/* STEP 2 — Details */}
      {step === 2 && (
    <div>
          <h2 className="text-xl font-bold text-foreground mb-1">Season details</h2>
          <p className="text-muted-foreground text-sm mb-6">Name your season, set the date range and primary distance.</p>
      <div className="space-y-4">
        <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Season name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
        </div>
            <div className="grid grid-cols-2 gap-4">
          <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Start date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="mt-1 w-full justify-start text-left font-normal">
                      {startDate ? formatDate(startDate) : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <DateWheelPicker
                      value={startDate ? parseISO(startDate) : new Date()}
                      onChange={(d) => setStartDate(format(d, "yyyy-MM-dd"))}
                      size="sm"
                    />
                  </PopoverContent>
                </Popover>
          </div>
          <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">End date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="mt-1 w-full justify-start text-left font-normal">
                      {endDate ? formatDate(endDate) : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <DateWheelPicker
                      value={endDate ? parseISO(endDate) : new Date()}
                      onChange={(d) => setEndDate(format(d, "yyyy-MM-dd"))}
                      size="sm"
                    />
                  </PopoverContent>
                </Popover>
          </div>
        </div>
        <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Primary distance</label>
          <select
            value={primaryDistance}
            onChange={(e) => setPrimaryDistance(e.target.value)}
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Select...</option>
                {cfg?.primary_distances.map((d) => (
                  <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
      </div>
          <div className="flex justify-between mt-8">
            <Button variant="ghost" onClick={() => setStep(1)}><ChevronLeft className="w-4 h-4 mr-1" /> Back</Button>
            <Button onClick={() => setStep(3)} disabled={!name || !startDate || !endDate}>Next <ChevronRight className="w-4 h-4 ml-1" /></Button>
    </div>
        </div>
      )}

      {/* STEP 3 — Add Races */}
      {step === 3 && (
    <div>
          <h2 className="text-xl font-bold text-foreground mb-1">Add your races</h2>
          <p className="text-muted-foreground text-sm mb-6">Add as many or as few as you know. You can always add more later.</p>

          <div className="p-4 rounded-xl border border-border bg-card space-y-3 mb-4">
        <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Race name" value={rName} onChange={(e) => setRName(e.target.value)} />
              <div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      {rDate ? formatDateShort(rDate) : "Race date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <DateWheelPicker
                      value={rDate ? parseISO(rDate) : new Date()}
                      onChange={(d) => setRDate(format(d, "yyyy-MM-dd"))}
                      size="sm"
                    />
                  </PopoverContent>
                </Popover>
        </div>
        </div>
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Distance (e.g. 1500m)" value={rDistance} onChange={(e) => setRDistance(e.target.value)} />
              <Input placeholder="Venue" value={rVenue} onChange={(e) => setRVenue(e.target.value)} />
            </div>
            <div className="flex gap-3 items-center">
              <div className="flex gap-1.5">
          {(["A", "B", "C"] as RacePriority[]).map((p) => (
            <button
              key={p}
                    onClick={() => setRPriority(p)}
                    className={`w-9 h-9 rounded-lg text-xs font-bold transition-all ${
                      rPriority === p ? PRIORITY_COLORS[p] : "bg-muted/50 text-muted-foreground"
                    }`}
                  >
                    {p}
            </button>
          ))}
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="flex-1 justify-start font-normal tabular-nums">
                    {rGoal || "Goal time"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <TimeWheelPicker
                    value={parseGoalTimeToSeconds(rGoal)}
                    onChange={(sec) => setRGoal(formatSecondsToGoalTime(sec))}
            size="sm"
                  />
                </PopoverContent>
              </Popover>
              <Button size="sm" onClick={addRace} disabled={!rName || !rDate || !rDistance}>
                <Plus className="w-4 h-4" />
          </Button>
        </div>
            <p className="text-[10px] text-muted-foreground">
              <span className="font-medium text-primary">A</span> = {PRIORITY_LABELS.A} · <span className="font-medium text-yellow-500">B</span> = {PRIORITY_LABELS.B} · <span className="font-medium">C</span> = {PRIORITY_LABELS.C}
            </p>
      </div>

          {sortedRaces.length > 0 && (
            <div className="space-y-2 mb-6">
              {sortedRaces.map((r, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border bg-card">
                  <span className={`w-7 h-7 rounded-md text-xs font-bold flex items-center justify-center ${PRIORITY_COLORS[r.priority]}`}>{r.priority}</span>
              <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{r.distance} · {formatDateShort(r.date)}{r.goal_time ? ` · Goal: ${r.goal_time}` : ""}</p>
                </div>
                  <button onClick={() => removeRace(races.indexOf(r))} className="text-muted-foreground hover:text-destructive transition-colors">
                    <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

          <div className="flex justify-between mt-8">
            <Button variant="ghost" onClick={() => setStep(2)}><ChevronLeft className="w-4 h-4 mr-1" /> Back</Button>
            <Button onClick={() => setStep(4)}>Review <ChevronRight className="w-4 h-4 ml-1" /></Button>
    </div>
        </div>
      )}

      {/* STEP 4 — Confirmation */}
      {step === 4 && (
    <div>
          <h2 className="text-xl font-bold text-foreground mb-4">Review your season</h2>
          <div className="rounded-xl border border-border bg-card p-5 mb-6">
            <h3 className="text-lg font-bold text-foreground mb-1">{name}</h3>
            <p className="text-sm text-muted-foreground mb-3">
              {startDate && endDate ? `${formatDate(startDate)} → ${formatDate(endDate)}` : "Dates not set"}
              {primaryDistance ? ` · ${primaryDistance}` : ""}
            </p>
            <p className="text-sm text-muted-foreground">
              {sortedRaces.length} race{sortedRaces.length !== 1 ? "s" : ""}: <span className="text-primary font-medium">{counts.A} A</span> · <span className="text-yellow-500 font-medium">{counts.B} B</span> · <span className="font-medium">{counts.C} C</span>
            </p>

            {/* Mini timeline */}
            {startDate && endDate && sortedRaces.length > 0 && (
              <div className="mt-4 relative h-6">
                <div className="absolute inset-x-0 top-1/2 h-0.5 bg-border -translate-y-1/2 rounded-full" />
                {sortedRaces.map((r, i) => {
                  const total = new Date(endDate).getTime() - new Date(startDate).getTime();
                  const pos = total > 0 ? ((new Date(r.date).getTime() - new Date(startDate).getTime()) / total) * 100 : 0;
            return (
              <div
                key={i}
                      className={`absolute w-3 h-3 rounded-full top-1/2 -translate-y-1/2 -translate-x-1/2 border-2 border-background ${PRIORITY_DOT[r.priority]}`}
                      style={{ left: `${Math.min(100, Math.max(0, pos))}%` }}
                title={`${r.name} (${r.priority})`}
              />
            );
          })}
        </div>
            )}
      </div>

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(3)}><ChevronLeft className="w-4 h-4 mr-1" /> Back</Button>
            <Button onClick={handleCreate} disabled={isCreating}>
              {isCreating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trophy className="w-4 h-4 mr-2" />}
            Create season
          </Button>
      </div>
    </div>
            )}
          </div>
  );
}

// ── Race Detail Sheet ───────────────────────────────────────────────────────
function RaceDetailSheet({
  race,
  onClose,
  onUpdate,
  onDelete,
}: {
  race: SeasonRace;
  onClose: () => void;
  onUpdate: (id: string, fields: Partial<SeasonRace>) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [gTime, setGTime] = useState(race.goal_time ?? "");
  const [notes, setNotes] = useState(race.notes ?? "");
  const [priority, setPriority] = useState<RacePriority>(race.priority);
  const [actualTime, setActualTime] = useState(race.actual_time ?? "");
  const [actualPlace, setActualPlace] = useState(race.actual_place?.toString() ?? "");

  const isPast = new Date(race.date + "T00:00:00") < new Date();
  const taperStart = calculateTaperStart(race.date, race.priority);
  const taperPlan = getTaperPlan(race.priority);
  const days = daysUntil(race.date);

  const save = () => {
    onUpdate(race.id, {
      goal_time: gTime || null,
      notes: notes || null,
      priority,
    });
    setEditing(false);
    toast.success("Race updated");
  };

  const logResult = () => {
    onUpdate(race.id, {
      actual_time: actualTime || null,
      actual_place: actualPlace ? parseInt(actualPlace) : null,
      notes: notes || null,
      status: "completed",
    });
    toast.success("Result logged!");
  };

  return (
    <Sheet open onOpenChange={() => onClose()}>
      <SheetContent className="overflow-y-auto w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span className={`w-7 h-7 rounded-md text-xs font-bold flex items-center justify-center ${PRIORITY_COLORS[race.priority]}`}>{race.priority}</span>
            {race.name}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {/* Meta */}
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {formatDate(race.date)}</span>
            <span>{race.distance}</span>
            {race.venue && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {race.venue}</span>}
            {!isPast && <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {days} days away</span>}
            </div>

          {/* Priority selector */}
          {editing && (
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Priority</label>
              <div className="flex gap-2 mt-1">
                {(["A", "B", "C"] as RacePriority[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPriority(p)}
                    className={`w-10 h-10 rounded-lg text-sm font-bold transition-all ${priority === p ? PRIORITY_COLORS[p] : "bg-muted/50 text-muted-foreground"}`}
                  >
                    {p}
                  </button>
                ))}
            </div>
          </div>
          )}

          {/* Goal time */}
          {editing ? (
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Goal time</label>
              <Input value={gTime} onChange={(e) => setGTime(e.target.value)} className="mt-1" placeholder="e.g. 3:58.0" />
              </div>
          ) : race.goal_time ? (
            <p className="text-sm"><span className="text-muted-foreground">Goal:</span> <span className="font-medium text-foreground">{race.goal_time}</span></p>
          ) : null}

          {/* Notes */}
          {editing ? (
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none" />
                    </div>
          ) : race.notes ? (
            <p className="text-sm text-muted-foreground">{race.notes}</p>
          ) : null}

          {/* Edit / Save buttons */}
          {!isPast && (
            <div className="flex gap-2">
              {editing ? (
                <>
                  <Button size="sm" onClick={save}><Check className="w-4 h-4 mr-1" /> Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                </>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil className="w-4 h-4 mr-1" /> Edit</Button>
              )}
                    </div>
          )}

          {/* Taper Plan */}
          {!isPast && (
            <div>
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Taper Plan</h4>
              {taperStart && (
                <p className="text-xs text-muted-foreground mb-2">Taper starts {formatDate(taperStart)}</p>
              )}
              <div className="space-y-1.5">
                {taperPlan.map((w, i) => (
                  <div key={i} className="flex gap-2 text-sm">
                    <span className="text-muted-foreground font-medium min-w-[70px] shrink-0">{w.weekLabel}</span>
                    <span className="text-foreground">{w.instruction}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* After race — log result */}
          {isPast && race.status === "upcoming" && (
            <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-3">
              <h4 className="text-sm font-bold text-foreground">How did it go?</h4>
              <Input placeholder="Actual time" value={actualTime} onChange={(e) => setActualTime(e.target.value)} />
              <Input placeholder="Place (optional)" type="number" value={actualPlace} onChange={(e) => setActualPlace(e.target.value)} />
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notes..." className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none" />
              <Button size="sm" onClick={logResult}>Log result</Button>
              </div>
          )}

          {/* Completed race result display */}
          {race.status === "completed" && (
            <div className="p-4 rounded-xl border border-border bg-card space-y-1">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Result</h4>
              {race.actual_time && <p className="text-sm"><span className="text-muted-foreground">Time:</span> <span className="font-medium">{race.actual_time}</span></p>}
              {race.actual_place && <p className="text-sm"><span className="text-muted-foreground">Place:</span> <span className="font-medium">{race.actual_place}</span></p>}
              {race.notes && <p className="text-sm text-muted-foreground mt-1">{race.notes}</p>}
            </div>
          )}

          {/* Delete */}
          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => { onDelete(race.id); onClose(); }}>
            Delete race
            </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Season Timeline ─────────────────────────────────────────────────────────
function SeasonTimeline({ season }: { season: { start_date: string; end_date: string; races: SeasonRace[] } }) {
  const totalDays = Math.max(1, (new Date(season.end_date).getTime() - new Date(season.start_date).getTime()) / 86_400_000);
  const todayPos = ((Date.now() - new Date(season.start_date).getTime()) / 86_400_000 / totalDays) * 100;

  return (
    <div className="relative h-10 mt-4 mb-2">
      <div className="absolute inset-x-0 top-1/2 h-1 bg-border -translate-y-1/2 rounded-full" />
      {/* Today marker */}
      {todayPos >= 0 && todayPos <= 100 && (
        <div className="absolute top-0 bottom-0 w-0.5 bg-foreground/30" style={{ left: `${todayPos}%` }}>
          <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] text-muted-foreground whitespace-nowrap">Today</span>
        </div>
      )}
      {season.races.map((r) => {
        const pos = ((new Date(r.date).getTime() - new Date(season.start_date).getTime()) / 86_400_000 / totalDays) * 100;
        if (pos < 0 || pos > 100) return null;
        return (
          <div
            key={r.id}
            className={`absolute w-4 h-4 rounded-full top-1/2 -translate-y-1/2 -translate-x-1/2 border-2 border-background ${PRIORITY_DOT[r.priority]} cursor-default`}
            style={{ left: `${pos}%` }}
            title={`${r.name} — ${r.distance} (${r.priority}) — ${formatDateShort(r.date)}`}
          />
        );
      })}
    </div>
  );
}

// ── Main Season View ────────────────────────────────────────────────────────
function SeasonView({ onCreateNewSeason }: { onCreateNewSeason: () => void }) {
  const { activeSeason, raceCounts, seasonPhase, weeksRemaining: wk, updateRace, deleteRace, deleteSeason, deleteSeasonAsync } = useSeason();
  const [selectedRace, setSelectedRace] = useState<SeasonRace | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (!activeSeason) return null;

  const { races } = activeSeason;

  const handleDeleteSeason = () => {
    if (!confirm("Delete this season? All races and data will be removed. This cannot be undone.")) return;
    setDeleting(true);
    deleteSeason(activeSeason.id, {
      onSuccess: () => toast.success("Season deleted"),
      onSettled: () => setDeleting(false),
    });
  };

  const handleCreateNewSeason = async () => {
    if (!confirm("Create a new season? Your current season will be removed first.")) return;
    setDeleting(true);
    try {
      await deleteSeasonAsync(activeSeason.id);
      onCreateNewSeason();
      toast.success("Season removed. Create your new season.");
    } catch {
      toast.error("Failed to remove season");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
            <h1 className="text-2xl font-bold text-foreground">{activeSeason.name}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {formatDate(activeSeason.start_date)} — {formatDate(activeSeason.end_date)} · {wk} weeks remaining
            </p>
        </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" className="rounded-full" onClick={handleCreateNewSeason} disabled={deleting}>
              {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <PlusCircle className="w-4 h-4 mr-1" />}
              Create new season
            </Button>
            <Button variant="outline" size="sm" className="rounded-full text-destructive hover:text-destructive" onClick={handleDeleteSeason} disabled={deleting}>
              {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
              Delete season
            </Button>
        </div>
        </div>
        <div className="flex gap-2 mt-3">
          <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-primary/15 text-primary">{raceCounts.A} A-race{raceCounts.A !== 1 ? "s" : ""}</span>
          <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-yellow-500/15 text-yellow-600 dark:text-yellow-400">{raceCounts.B} B-race{raceCounts.B !== 1 ? "s" : ""}</span>
          <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-muted text-muted-foreground">{raceCounts.C} C-race{raceCounts.C !== 1 ? "s" : ""}</span>
          <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-muted/50 text-muted-foreground capitalize">{seasonPhase.replace("_", " ")}</span>
        </div>
      </div>

      {/* Timeline */}
      <div className="rounded-xl border border-border bg-card p-4 mb-6">
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Season Timeline</h3>
        <SeasonTimeline season={activeSeason} />
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>{formatDateShort(activeSeason.start_date)}</span>
          <span>{formatDateShort(activeSeason.end_date)}</span>
        </div>
      </div>

      {/* Race List */}
      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Races</h3>
      <div className="space-y-2">
        {races.map((r) => {
          const days = daysUntil(r.date);
          const taperStart = calculateTaperStart(r.date, r.priority);
          const isPast = days < 0;
          return (
            <button
              key={r.id}
              onClick={() => setSelectedRace(r)}
              className="w-full text-left p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className={`w-8 h-8 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 ${PRIORITY_COLORS[r.priority]}`}>{r.priority}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{r.name} <span className="font-normal text-muted-foreground">{r.distance}</span></p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(r.date)}
                    {r.venue ? ` · ${r.venue}` : ""}
                    {r.goal_time ? ` · Goal: ${r.goal_time}` : ""}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  {isPast ? (
                    r.status === "completed" ? (
                      <span className="text-xs font-medium text-green-500">{r.actual_time || "Completed"}</span>
                    ) : (
                      <span className="text-xs font-medium text-primary">Log result →</span>
                    )
                  ) : (
      <div>
                      <p className="text-xs font-medium text-foreground">{days} days</p>
                      {taperStart && <p className="text-[10px] text-muted-foreground">Taper {formatDateShort(taperStart)}</p>}
        </div>
                  )}
        </div>
              </div>
            </button>
          );
        })}
      </div>

      {selectedRace && (
        <RaceDetailSheet
        race={selectedRace}
        onClose={() => setSelectedRace(null)}
          onUpdate={(id, fields) => { updateRace({ id, ...fields } as Parameters<typeof updateRace>[0]); setSelectedRace(null); }}
          onDelete={deleteRace}
      />
      )}
    </div>
  );
}

// ── Page Root ───────────────────────────────────────────────────────────────
export default function Season() {
  const { activeSeason, loading } = useSeason();
  const [showWizard, setShowWizard] = useState(false);

  return (
    <AppLayout>
        {loading ? (
        <div className="flex items-center justify-center py-32">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : showWizard ? (
          <CreationWizard onDone={() => setShowWizard(false)} />
        ) : activeSeason ? (
        <SeasonView onCreateNewSeason={() => setShowWizard(true)} />
        ) : (
        <EmptyState onCreate={() => setShowWizard(true)} />
        )}
    </AppLayout>
  );
}
