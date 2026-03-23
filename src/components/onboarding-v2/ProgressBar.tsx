import { motion } from "framer-motion";

interface ProgressBarProps {
  currentIndex: number;
  total: number;
}

export function ProgressBar({ currentIndex, total }: ProgressBarProps) {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex justify-center pt-4">
      <div className="flex items-center gap-1.5">
        {Array.from({ length: total }).map((_, i) => {
          const isActive = i === currentIndex;
          const isPast = i < currentIndex;
          return (
            <motion.div
              key={i}
              animate={{
                width: isActive ? 20 : 6,
                opacity: isPast ? 0.5 : isActive ? 1 : 0.2,
              }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className={`h-1.5 rounded-full ${isActive ? "bg-primary" : isPast ? "bg-primary" : "bg-muted-foreground"}`}
            />
          );
        })}
      </div>
    </div>
  );
}
