import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type DeviceIphoneProps = {
  src?: string;
  alt?: string;
  children?: ReactNode;
  className?: string;
};

/** iPhone 17: 6.3" display, portrait 9:19.5 (width:height), thinner bezels */
export function DeviceIphone({ src, alt, children, className }: DeviceIphoneProps) {
  const hasContent = children != null;
  const hasImage = src != null && alt != null;

  return (
    <div
      className={cn(
        "relative flex flex-col items-center",
        "rounded-[2.75rem] border-[6px] border-zinc-800 bg-zinc-900 p-1.5 shadow-2xl",
        "dark:border-zinc-700 dark:bg-zinc-800",
        className,
      )}
    >
      {/* Dynamic Island */}
      <div className="absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black px-6 py-1.5" />
      {/* Screen - portrait: 9/19.5 (width/height) = tall phone */}
      <div className="relative w-full overflow-hidden rounded-[2.25rem] bg-background">
        {hasContent ? (
          <div className="aspect-[9/19.5] w-full overflow-hidden">
            {children}
          </div>
        ) : hasImage ? (
          <img
            src={src}
            alt={alt}
            className="aspect-[9/19.5] w-full object-cover object-center"
          />
        ) : null}
      </div>
    </div>
  );
}
