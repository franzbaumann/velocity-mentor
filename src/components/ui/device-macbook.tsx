import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type DeviceMacbookProps = {
  src?: string;
  alt?: string;
  children?: ReactNode;
  className?: string;
};

export function DeviceMacbook({ src, alt, children, className }: DeviceMacbookProps) {
  const hasContent = children != null;
  const hasImage = src != null && alt != null;

  return (
    <div
      className={cn(
        "flex flex-col items-center",
        "rounded-lg shadow-2xl",
        className,
      )}
    >
      {/* Screen bezel */}
      <div className="relative overflow-hidden rounded-t-lg border border-zinc-700 bg-zinc-900 px-3 pt-3 pb-2">
        {/* Camera notch */}
        <div className="absolute left-1/2 top-2 z-10 h-2 w-16 -translate-x-1/2 rounded-full bg-zinc-800" />
        {/* Screen */}
        <div className="overflow-hidden rounded-md border border-zinc-800 bg-background">
          {hasContent ? (
            <div className="aspect-[16/10] w-full overflow-hidden">
              {children}
            </div>
          ) : hasImage ? (
            <img
              src={src}
              alt={alt}
              className="aspect-[16/10] w-full object-contain object-top"
            />
          ) : null}
        </div>
      </div>
      {/* Base */}
      <div className="flex w-full flex-col items-center rounded-b-lg border-x border-b border-zinc-700 bg-zinc-800 py-2">
        <div className="mb-1 h-1 w-24 rounded-full bg-zinc-600" />
        <div className="h-2 w-[110%] rounded-b-md border border-zinc-700 bg-zinc-900" />
      </div>
    </div>
  );
}
