import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/shared/lib/cn";

/** Large slider with an optional "current value" marker (Time Machine). */
export const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & {
    marker?: number;
    markerLabel?: string;
    thumbLabel?: string;
  }
>(({ className, marker, markerLabel, thumbLabel, min = 0, max = 100, ...props }, ref) => {
  const markerPct = marker != null ? ((marker - min) / (max - min)) * 100 : null;
  return (
    <SliderPrimitive.Root
      ref={ref}
      min={min}
      max={max}
      className={cn("relative flex h-10 w-full touch-none select-none items-center", className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-2.5 w-full grow overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-border">
        <SliderPrimitive.Range className="absolute h-full bg-brand" />
      </SliderPrimitive.Track>
      {markerPct != null && (
        <div
          className="pointer-events-none absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
          style={{ left: `${markerPct}%` }}
          aria-hidden
        >
          <div className="h-6 w-0.5 rounded-full bg-fg/60" />
          {markerLabel && (
            <span className="absolute top-7 whitespace-nowrap text-small font-medium text-muted">{markerLabel}</span>
          )}
        </div>
      )}
      <SliderPrimitive.Thumb
        aria-label={thumbLabel}
        className="block size-6 rounded-full border-2 border-brand bg-surface shadow-md transition-transform hover:scale-110 focus-visible:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      />
    </SliderPrimitive.Root>
  );
});
Slider.displayName = "Slider";
