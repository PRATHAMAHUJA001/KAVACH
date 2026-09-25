import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/shared/lib/cn";

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({
  content,
  children,
  side = "top",
  className,
  delayDuration,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
  delayDuration?: number;
}) {
  if (content == null || content === "") return <>{children}</>;
  return (
    <TooltipPrimitive.Root delayDuration={delayDuration}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          collisionPadding={12}
          className={cn(
            "z-[80] max-w-72 rounded-lg bg-fg px-3 py-2 text-small text-surface shadow-overlay",
            "anim-pop",
            className,
          )}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-fg" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
