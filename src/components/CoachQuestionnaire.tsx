import { useState } from "react";
import { ChevronRight, ChevronLeft, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type QuestionType = "select" | "number" | "text" | "multi" | "pace";

interface Question {
  id: string;
  question: string;
  type: QuestionType;
  options?: string[];
  placeholder?: string;
  suffix?: string;
  min?: number;
  max?: number;
}

const questions: Question[] = [
  {
    id: "experience",
    question: "How long have you been running consistently?",
    type: "select",
    options: ["Less than 6 months", "6–12 months", "1–3 years", "3–5 years", "5+ years"],
  },
  {
    id: "weekly_frequency",
    question: "How many days per week do you currently run?",
    type: "select",
    options: ["1–2 days", "3 days", "4 days", "5 days", "6–7 days"],
  },
  {
    id: "weekly_volume",
    question: "What's your current weekly mileage (km)?",
    type: "number",
    placeholder: "e.g. 40",
    suffix: "km/week",
    min: 0,
    max: 300,
  },
  {
    id: "longest_run",
    question: "What's the longest run you've done in the past 4 weeks?",
    type: "number",
    placeholder: "e.g. 18",
    suffix: "km",
    min: 0,
    max: 100,
  },
  {
    id: "race_goal",
    question: "What race distance are you targeting?",
    type: "select",
    options: ["5K", "10K", "Half Marathon", "Marathon", "Ultra (50K+)", "No specific race"],
  },
  {
    id: "target_time",
    question: "Do you have a specific goal time in mind?",
    type: "text",
    placeholder: "e.g. 3:30:00 or 'just finish'",
  },
  {
    id: "race_date",
    question: "When is your target race? (approximate is fine)",
    type: "text",
    placeholder: "e.g. October 2026 or 'no date yet'",
  },
  {
    id: "recent_race",
    question: "What's your most recent race result?",
    type: "text",
    placeholder: "e.g. Half Marathon in 1:42:00, 3 months ago",
  },
  {
    id: "easy_pace",
    question: "What's your current easy/comfortable pace?",
    type: "text",
    placeholder: "e.g. 5:30/km or 8:50/mi",
  },
  {
    id: "max_hr",
    question: "Do you know your max heart rate?",
    type: "text",
    placeholder: "e.g. 186 or 'not sure'",
  },
  {
    id: "training_style",
    question: "Which training approach resonates with you?",
    type: "select",
    options: [
      "Jack Daniels (structured zones)",
      "Pfitzinger (high mileage focus)",
      "Hansons (cumulative fatigue)",
      "Let AI decide for me",
    ],
  },
  {
    id: "available_days",
    question: "Which days are you available to train?",
    type: "multi",
    options: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  },
  {
    id: "long_run_day",
    question: "What's your preferred day for the long run?",
    type: "select",
    options: ["Saturday", "Sunday", "Flexible"],
  },
  {
    id: "cross_training",
    question: "Do you do any cross-training?",
    type: "multi",
    options: ["Cycling", "Swimming", "Strength training", "Yoga/Mobility", "None"],
  },
  {
    id: "injuries",
    question: "Do you have any current injuries or problem areas?",
    type: "text",
    placeholder: "e.g. mild knee pain on downhills, or 'none'",
  },
  {
    id: "injury_history",
    question: "Any significant past injuries that affect your training?",
    type: "text",
    placeholder: "e.g. stress fracture in 2024, or 'nothing major'",
  },
  {
    id: "sleep_avg",
    question: "How many hours of sleep do you average per night?",
    type: "select",
    options: ["Less than 6", "6–7 hours", "7–8 hours", "8–9 hours", "9+ hours"],
  },
  {
    id: "life_stress",
    question: "How would you rate your current life stress level?",
    type: "select",
    options: ["Low — pretty chill", "Moderate — manageable", "High — demanding schedule", "Very high — major stressors"],
  },
  {
    id: "wearable",
    question: "What wearable/watch do you use?",
    type: "select",
    options: ["Garmin", "Apple Watch", "COROS", "Polar", "Suunto", "Other", "None"],
  },
  {
    id: "coaching_style",
    question: "What kind of coaching tone do you prefer?",
    type: "select",
    options: [
      "Direct & data-driven — just the facts",
      "Motivational — push me hard",
      "Balanced — firm but supportive",
      "Gentle — I'm fragile, be kind",
    ],
  },
];

interface CoachQuestionnaireProps {
  onComplete: (answers: Record<string, string | string[]>) => void;
}

export function CoachQuestionnaire({ onComplete }: CoachQuestionnaireProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [direction, setDirection] = useState(1);

  const current = questions[currentIndex];
  const progress = ((currentIndex + 1) / questions.length) * 100;
  const currentAnswer = answers[current.id];

  const setAnswer = (value: string | string[]) => {
    setAnswers((prev) => ({ ...prev, [current.id]: value }));
  };

  const toggleMulti = (option: string) => {
    const existing = (currentAnswer as string[]) || [];
    if (existing.includes(option)) {
      setAnswer(existing.filter((o) => o !== option));
    } else {
      setAnswer([...existing, option]);
    }
  };

  const canProceed = () => {
    if (!currentAnswer) return false;
    if (Array.isArray(currentAnswer) && currentAnswer.length === 0) return false;
    if (typeof currentAnswer === "string" && currentAnswer.trim() === "") return false;
    return true;
  };

  const next = () => {
    if (!canProceed()) return;
    if (currentIndex < questions.length - 1) {
      setDirection(1);
      setCurrentIndex((i) => i + 1);
    } else {
      onComplete(answers);
    }
  };

  const prev = () => {
    if (currentIndex > 0) {
      setDirection(-1);
      setCurrentIndex((i) => i - 1);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") next();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Progress bar */}
      <div className="px-6 pt-6 pb-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground font-medium">
            Question {currentIndex + 1} of {questions.length}
          </span>
          <span className="text-xs text-muted-foreground">{Math.round(progress)}%</span>
        </div>
        <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-primary rounded-full"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          />
        </div>
      </div>

      {/* Question area */}
      <div className="flex-1 flex flex-col justify-center px-6 py-8 overflow-y-auto">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={current.id}
            custom={direction}
            initial={{ opacity: 0, x: direction * 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -40 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="space-y-6"
          >
            <h2 className="text-lg font-semibold text-foreground leading-snug">
              {current.question}
            </h2>

            {/* Select options */}
            {current.type === "select" && current.options && (
              <div className="space-y-2">
                {current.options.map((option) => (
                  <button
                    key={option}
                    onClick={() => setAnswer(option)}
                    className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-all border ${
                      currentAnswer === option
                        ? "bg-primary/10 border-primary text-primary font-medium"
                        : "bg-secondary/50 border-transparent text-foreground hover:bg-secondary"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}

            {/* Multi select */}
            {current.type === "multi" && current.options && (
              <div className="flex flex-wrap gap-2">
                {current.options.map((option) => {
                  const selected = Array.isArray(currentAnswer) && currentAnswer.includes(option);
                  return (
                    <button
                      key={option}
                      onClick={() => toggleMulti(option)}
                      className={`px-4 py-2 rounded-full text-sm transition-all border ${
                        selected
                          ? "bg-primary/10 border-primary text-primary font-medium"
                          : "bg-secondary/50 border-transparent text-foreground hover:bg-secondary"
                      }`}
                    >
                      {selected && <CheckCircle2 className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />}
                      {option}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Number input */}
            {current.type === "number" && (
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={(currentAnswer as string) || ""}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={current.placeholder}
                  min={current.min}
                  max={current.max}
                  className="flex-1 bg-secondary rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/20"
                  autoFocus
                />
                {current.suffix && (
                  <span className="text-sm text-muted-foreground">{current.suffix}</span>
                )}
              </div>
            )}

            {/* Text / pace input */}
            {(current.type === "text" || current.type === "pace") && (
              <input
                type="text"
                value={(currentAnswer as string) || ""}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={current.placeholder}
                className="w-full bg-secondary rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/20"
                autoFocus
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <div className="px-6 pb-6 flex items-center justify-between">
        <button
          onClick={prev}
          disabled={currentIndex === 0}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>

        <button
          onClick={next}
          disabled={!canProceed()}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all ${
            canProceed()
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-secondary text-muted-foreground cursor-not-allowed"
          }`}
        >
          {currentIndex === questions.length - 1 ? "Build My Plan" : "Continue"}
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
