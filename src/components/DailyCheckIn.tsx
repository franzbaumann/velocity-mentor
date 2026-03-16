import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useDailyLoad, type CheckInPayload } from "@/hooks/useDailyLoad";
import { useMergedReadiness } from "@/hooks/useMergedIntervalsData";
import { resolveCtlAtlTsb } from "@/hooks/useReadiness";
import { calculateTLS, type OtherTraining } from "@/lib/totalLoad/calculateTLS";
import { ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useDailyCheckIn } from "@/components/DailyCheckInContext";

const OTHER_TYPES = [
  { id: "nothing", label: "Nothing" },
  { id: "padel", label: "Padel" },
  { id: "gym", label: "Gym" },
  { id: "cycling", label: "Cycling" },
  { id: "swimming", label: "Swimming" },
  { id: "other", label: "Other" },
] as const;

const DURATIONS = [
  { min: 30, label: "30 min" },
  { min: 60, label: "1h" },
  { min: 90, label: "1.5h" },
  { min: 120, label: "2h+" },
] as const;

const INTENSITIES = ["easy", "moderate", "hard"] as const;

function SubjectiveScale({ value, onChange, label, lowEmoji, highEmoji }: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  lowEmoji: string;
  highEmoji: string;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-foreground mb-2">{label}</p>
      <div className="flex items-center gap-2">
        <span className="text-lg">{lowEmoji}</span>
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`w-11 h-11 rounded-full text-sm font-medium transition-all ${
              value === v ? "bg-primary text-primary-foreground ring-2 ring-primary/30" : "bg-muted hover:bg-muted/80"
            }`}
          >
            {v}
          </button>
        ))}
        <span className="text-lg">{highEmoji}</span>
      </div>
    </div>
  );
}

export function DailyCheckIn({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(1);
  const [mood, setMood] = useState(3);
  const [energy, setEnergy] = useState(3);
  const [legs, setLegs] = useState(3);
  const [otherType, setOtherType] = useState<string>("nothing");
  const [otherDuration, setOtherDuration] = useState(60);
  const [otherIntensity, setOtherIntensity] = useState<"easy" | "moderate" | "hard">("moderate");
  const [workStress, setWorkStress] = useState(1);
  const [lifeStress, setLifeStress] = useState(1);
  const [travel, setTravel] = useState(false);
  const [lifeNote, setLifeNote] = useState("");
  const [displayScore, setDisplayScore] = useState(0);

  const { checkIn, isCheckingIn } = useDailyLoad();
  const { currentStreak, invalidateStreak } = useDailyCheckIn();
  const { data: readinessRows } = useMergedReadiness(14);
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayReadiness = readinessRows?.find((r) => r.date?.slice(0, 10) === todayStr) ?? readinessRows?.[readinessRows.length - 1];
  const { atl } = todayReadiness ? resolveCtlAtlTsb(todayReadiness) : { atl: null };
  const hrv = todayReadiness?.hrv ?? null;
  const sleepHours = todayReadiness?.sleep_hours ?? 7;
  const sleepScore = todayReadiness?.sleep_score ?? todayReadiness?.readiness ?? 70;

  const otherTraining: OtherTraining[] =
    otherType !== "nothing"
      ? [{
          type: otherType,
          duration_min: otherDuration,
          intensity: otherIntensity,
          label: OTHER_TYPES.find((t) => t.id === otherType)?.label,
        }]
      : [];

  const tlsResult = calculateTLS({
    runningATL: atl != null ? Math.min(100, Math.max(0, atl)) : 0,
    hrvScore: hrv != null ? Math.min(100, Math.max(0, ((hrv - 20) / 80) * 100)) : 50,
    sleepHours,
    sleepScore: sleepScore ?? 70,
    otherTraining,
    workStress,
    lifeStress,
    travel,
    mood,
    energy,
    legs,
  });

  useEffect(() => {
    if (!open) setStep(1);
  }, [open]);

  useEffect(() => {
    if (step !== 4) return;
    const target = tlsResult.totalScore;
    setDisplayScore(0);
    const duration = 600;
    const startTime = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - (1 - progress) ** 2;
      setDisplayScore(Math.round(target * eased));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [step, tlsResult.totalScore]);

  const handleDone = async () => {
    try {
      const payload: CheckInPayload = {
        mood,
        energy,
        legs,
        other_training: otherTraining.length > 0 ? otherTraining : undefined,
        work_stress: workStress,
        life_stress: lifeStress,
        travel,
        life_note: lifeNote.trim() || undefined,
      };
      await checkIn(payload);
      invalidateStreak();
      const newStreak = currentStreak + 1;
      toast.success(newStreak > 1 ? `Check-in saved! You're on a ${newStreak}-day streak!` : "Check-in saved!");
      onClose();
    } catch {
      toast.error("Failed to save check-in");
    }
  };

  const statusColor =
    tlsResult.cnsStatus === "fresh" ? "text-green-500"
    : tlsResult.cnsStatus === "normal" ? "text-green-500"
    : tlsResult.cnsStatus === "loaded" ? "text-yellow-500"
    : tlsResult.cnsStatus === "overloaded" ? "text-orange-500"
    : "text-red-500";

  const statusBg =
    tlsResult.cnsStatus === "fresh" ? "bg-green-500/20"
    : tlsResult.cnsStatus === "normal" ? "bg-green-500/20"
    : tlsResult.cnsStatus === "loaded" ? "bg-yellow-500/20"
    : tlsResult.cnsStatus === "overloaded" ? "bg-orange-500/20"
    : "bg-red-500/20";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>
            {step === 1 && "How are you feeling today?"}
            {step === 2 && "Did you do anything besides running today?"}
            {step === 3 && "How loaded is life right now?"}
            {step === 4 && "Today's Total Load"}
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-6 py-2">
            <SubjectiveScale value={legs} onChange={setLegs} label="Legs" lowEmoji="💀" highEmoji="🚀" />
            <SubjectiveScale value={energy} onChange={setEnergy} label="Energy" lowEmoji="💀" highEmoji="🚀" />
            <SubjectiveScale value={mood} onChange={setMood} label="Mood" lowEmoji="💀" highEmoji="🚀" />
            <Button className="w-full" onClick={() => setStep(2)}>
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6 py-2">
            <div className="flex flex-wrap gap-2">
              {OTHER_TYPES.map((t) => (
                <Button
                  key={t.id}
                  variant={otherType === t.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setOtherType(t.id)}
                >
                  {t.label}
                </Button>
              ))}
            </div>
            {otherType !== "nothing" && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-foreground mb-2">Duration</p>
                  <div className="flex gap-2">
                    {DURATIONS.map((d) => (
                      <Button
                        key={d.min}
                        variant={otherDuration === d.min ? "default" : "outline"}
                        size="sm"
                        onClick={() => setOtherDuration(d.min)}
                      >
                        {d.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground mb-2">Intensity</p>
                  <div className="flex gap-2">
                    {INTENSITIES.map((i) => (
                      <Button
                        key={i}
                        variant={otherIntensity === i ? "default" : "outline"}
                        size="sm"
                        onClick={() => setOtherIntensity(i)}
                      >
                        {i.charAt(0).toUpperCase() + i.slice(1)}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <Button className="w-full" onClick={() => setStep(3)}>
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6 py-2">
            <div>
              <p className="text-sm font-medium text-foreground mb-2">Work stress</p>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setWorkStress(v)}
                    className={`w-10 h-10 rounded-full text-sm font-medium transition-all ${
                      workStress === v ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground mb-2">Life stress</p>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setLifeStress(v)}
                    className={`w-10 h-10 rounded-full text-sm font-medium transition-all ${
                      lifeStress === v ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground mb-2">Travelling today?</p>
              <div className="flex gap-2">
                <Button variant={travel ? "default" : "outline"} size="sm" onClick={() => setTravel(true)}>Yes</Button>
                <Button variant={!travel ? "default" : "outline"} size="sm" onClick={() => setTravel(false)}>No</Button>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground mb-2">Anything Coach Cade should know?</p>
              <textarea
                value={lifeNote}
                onChange={(e) => setLifeNote(e.target.value)}
                placeholder="Big presentation tomorrow, bad sleep, stressful week..."
                rows={2}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              />
            </div>
            <Button className="w-full" onClick={() => setStep(4)}>
              See summary <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6 py-2">
            <div className="text-center">
              <p className="text-5xl font-bold tabular-nums text-foreground">{displayScore}</p>
              <p className={`text-sm font-medium mt-1 capitalize ${statusColor}`}>{tlsResult.cnsStatus}</p>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${statusBg}`}
                style={{ width: `${Math.min(100, tlsResult.totalScore)}%` }}
              />
            </div>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>Running load {Math.round(tlsResult.breakdown.running)}</p>
              {otherTraining.length > 0 && (
                <p>
                  {OTHER_TYPES.find((t) => t.id === otherType)?.label} ({otherDuration}min {otherIntensity}){" "}
                  {Math.round(tlsResult.breakdown.otherTraining)}
                </p>
              )}
              <p>Sleep {Math.round(tlsResult.breakdown.sleep)}</p>
              <p>Work stress {Math.round(tlsResult.breakdown.lifeStress)}</p>
            </div>
            <p className="text-xs text-muted-foreground">Coach Cade will factor this into your plan.</p>
            <Button className="w-full" onClick={handleDone} disabled={isCheckingIn}>
              {isCheckingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {isCheckingIn ? "Saving…" : "Done"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
