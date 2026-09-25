import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";

/** Right-hand drawer (DESIGN_SPEC: drawers slide in from the right, 280ms). */
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export const SheetTitle = DialogPrimitive.Title;
export const SheetDescription = DialogPrimitive.Description;

export const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { width?: number; hideClose?: boolean }
>(({ className, children, width = 640, hideClose, style, ...props }, ref) => {
  const { t } = useTranslation();
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="anim-fade fixed inset-0 z-50 bg-scrim backdrop-blur-[2px]" />
      <DialogPrimitive.Content
        ref={ref}
        style={{ width: `min(${width}px, 100vw)`, ...style }}
        className={cn(
          "anim-sheet fixed inset-y-0 right-0 z-50 flex flex-col border-l border-border bg-surface shadow-overlay outline-none",
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose && (
          <DialogPrimitive.Close
            className="absolute right-4 top-4 z-10 inline-flex size-9 items-center justify-center rounded-control text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            aria-label={t("common.close")}
          >
            <X className="size-5" strokeWidth={1.75} />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});
SheetContent.displayName = "SheetContent";
