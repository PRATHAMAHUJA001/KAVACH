import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => {
  const { t } = useTranslation();
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="anim-fade fixed inset-0 z-50 bg-scrim backdrop-blur-[2px]" />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "anim-dialog fixed left-1/2 top-1/2 z-50 w-[min(560px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2",
          "rounded-card border border-border bg-surface p-6 shadow-overlay outline-none",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className="absolute right-4 top-4 inline-flex size-9 items-center justify-center rounded-control text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          aria-label={t("common.close")}
        >
          <X className="size-5" strokeWidth={1.75} />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});
DialogContent.displayName = "DialogContent";

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn("pr-10 text-h2 font-semibold font-display", className)} {...props} />
));
DialogTitle.displayName = "DialogTitle";

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("mt-1 text-body text-muted", className)} {...props} />
));
DialogDescription.displayName = "DialogDescription";
