import { AppLayout } from "@/components/AppLayout";
import { useState } from "react";
import { Send } from "lucide-react";

const quickPrompts = [
  "How am I recovering this week?",
  "Analyze my last run",
  "Should I adjust this week's plan?",
  "What are my current training zones?",
  "Help me prep for race day",
];

export default function Coach() {
  const [message, setMessage] = useState("");
  const [showChips, setShowChips] = useState(true);

  return (
    <AppLayout>
      <div className="animate-fade-in flex flex-col h-[calc(100vh-6rem)]">
        <h1 className="text-2xl font-semibold text-foreground mb-4">AI Coach</h1>

        {/* Chat area */}
        <div className="flex-1 glass-card rounded-2xl flex flex-col overflow-hidden">
          {/* Messages */}
          <div className="flex-1 p-6 overflow-y-auto space-y-4">
            {/* Coach welcome */}
            <div className="flex gap-3 max-w-lg">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-semibold text-primary">P</span>
              </div>
              <div className="glass-card p-4 text-sm text-foreground leading-relaxed">
                Hey Marcus. I've reviewed your data this morning. Your HRV is 11% below your 7-day
                baseline — not alarming, but worth monitoring. Today's easy run at 5:10–5:30/km pace
                is the right call. Keep it truly easy and prioritize sleep tonight.
              </div>
            </div>
          </div>

          {/* Quick chips */}
          {showChips && (
            <div className="px-6 pb-2 flex flex-wrap gap-2">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => {
                    setMessage(prompt);
                    setShowChips(false);
                  }}
                  className="pill-button bg-secondary text-secondary-foreground text-xs hover:bg-primary/10 hover:text-primary"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="p-4 border-t border-border">
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ask your coach anything..."
                className="flex-1 bg-secondary rounded-full px-5 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/20"
              />
              <button className="w-10 h-10 rounded-full bg-primary flex items-center justify-center hover:bg-primary/90 transition-colors">
                <Send className="w-4 h-4 text-primary-foreground" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
