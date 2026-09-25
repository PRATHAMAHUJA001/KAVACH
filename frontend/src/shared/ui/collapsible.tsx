import * as React from "react";
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";
import { ChevronDown } from "lucide-react";
import { cn } from "@/shared/lib/cn";

/** A labelled expander ("Show the data", "Show the SQL", "For engineers"). */
export function Expander({
  title,
  icon,
  defaultOpen,
  children,
  className,
  meta,
}: {
  title: React.ReactNode;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
  meta?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(!!defaultOpen);
  return (
    <CollapsiblePrimitive.Root
      open={open}
      onOpenChange={setOpen}
      className={cn("rounded-xl border border-border bg-surface", className)}
    >
      <CollapsiblePrimitive.Trigger className="flex w-full items-center gap-2 rounded-xl px-4 py-3 text-left text-body font-medium text-fg transition-colors hover:bg-surface-2 [&_svg]:stroke-[1.75]">
        {icon && <span className="text-muted [&_svg]:size-[18px]">{icon}</span>}
        <span className="flex-1">{title}</span>
        {meta && <span className="text-small text-muted">{meta}</span>}
        <ChevronDown className={cn("size-4 text-muted transition-transform duration-200", open && "rotate-180")} />
      </CollapsiblePrimitive.Trigger>
      <CollapsiblePrimitive.Content className="border-t border-border px-4 py-4">{children}</CollapsiblePrimitive.Content>
    </CollapsiblePrimitive.Root>
  );
}

export const Collapsible = CollapsiblePrimitive.Root;
export const CollapsibleTrigger = CollapsiblePrimitive.Trigger;
export const CollapsibleContent = CollapsiblePrimitive.Content;
