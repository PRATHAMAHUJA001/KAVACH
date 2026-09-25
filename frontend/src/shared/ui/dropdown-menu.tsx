import * as React from "react";
import * as DM from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
import { cn } from "@/shared/lib/cn";

export const DropdownMenu = DM.Root;
export const DropdownMenuTrigger = DM.Trigger;

export const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DM.Content>,
  React.ComponentPropsWithoutRef<typeof DM.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <DM.Portal>
    <DM.Content
      ref={ref}
      sideOffset={sideOffset}
      collisionPadding={12}
      className={cn(
        "anim-pop z-[70] min-w-48 rounded-xl border border-border bg-surface p-1.5 text-body text-fg shadow-overlay",
        className,
      )}
      {...props}
    />
  </DM.Portal>
));
DropdownMenuContent.displayName = "DropdownMenuContent";

const itemCls =
  "relative flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-2 outline-none transition-colors " +
  "data-[highlighted]:bg-surface-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:stroke-[1.75]";

export const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DM.Item>,
  React.ComponentPropsWithoutRef<typeof DM.Item>
>(({ className, ...props }, ref) => <DM.Item ref={ref} className={cn(itemCls, className)} {...props} />);
DropdownMenuItem.displayName = "DropdownMenuItem";

export const DropdownMenuRadioGroup = DM.RadioGroup;
export const DropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof DM.RadioItem>,
  React.ComponentPropsWithoutRef<typeof DM.RadioItem>
>(({ className, children, ...props }, ref) => (
  <DM.RadioItem ref={ref} className={cn(itemCls, "pr-8", className)} {...props}>
    {children}
    <DM.ItemIndicator className="absolute right-2.5">
      <Check />
    </DM.ItemIndicator>
  </DM.RadioItem>
));
DropdownMenuRadioItem.displayName = "DropdownMenuRadioItem";

export const DropdownMenuLabel = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <DM.Label className={cn("px-2.5 pb-1 pt-2 label-caps text-muted", className)} {...p} />
);
export const DropdownMenuSeparator = () => <DM.Separator className="-mx-1.5 my-1.5 h-px bg-border" />;
