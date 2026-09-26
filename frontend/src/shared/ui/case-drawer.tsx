import * as React from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "./sheet";
import { RiskMeter, type RiskLevel } from "./risk-meter";
import { Skeleton } from "./skeleton";

/**
 * Right panel, 640px, sticky header (title, RiskMeter, deadline countdown, primary action),
 * scrolling body and a sticky action footer.
 *
 * `side` pins a second column to the right of the body (a chat console, say) and widens
 * the drawer to fit it; on narrow screens it stacks under the body instead.
 */
export function CaseDrawer({
  open,
  onOpenChange,
  title,
  eyebrow,
  riskLevel,
  deadline,
  primaryAction,
  footer,
  children,
  loading,
  description,
  side,
  width = 640,
  sideWidth = 380,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  riskLevel?: RiskLevel;
  deadline?: React.ReactNode;
  primaryAction?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  loading?: boolean;
  description?: string;
  side?: React.ReactNode;
  width?: number;
  sideWidth?: number;
}) {
  const { t } = useTranslation();
  const main = (
    <>
      <header className="sticky top-0 z-10 border-b border-border bg-surface/95 px-6 pb-4 pt-5 backdrop-blur">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {eyebrow && <div className="mb-1 text-small font-medium text-muted">{eyebrow}</div>}
            {loading ? (
              <Skeleton className="h-7 w-3/4" />
            ) : (
              <SheetTitle className="font-display text-h1 font-semibold text-fg">{title}</SheetTitle>
            )}
            {description && <SheetDescription className="sr-only">{description}</SheetDescription>}
          </div>
          {primaryAction && <div className="shrink-0">{primaryAction}</div>}
          <SheetClose
            className="-mr-2 inline-flex size-9 shrink-0 items-center justify-center rounded-control text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            aria-label={t("common.close")}
          >
            <X className="size-5" strokeWidth={1.75} />
          </SheetClose>
        </div>
        {(riskLevel || deadline) && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            {riskLevel && <RiskMeter level={riskLevel} />}
            {deadline}
          </div>
        )}
      </header>
      <div className="scrollbar-thin flex-1 overflow-y-auto px-6 py-6">{children}</div>
      {footer && (
        <footer className={cn("sticky bottom-0 border-t border-border bg-surface/95 px-6 py-4 backdrop-blur")}>{footer}</footer>
      )}
    </>
  );
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        width={side ? width + sideWidth : width}
        hideClose
        aria-describedby={undefined}
        className={cn(side && "flex-col lg:flex-row")}
      >
        {side ? (
          <>
            {/* min-h-0 / min-w-0: without them the two columns refuse to shrink and the
                drawer scrolls as a whole instead of each column scrolling itself. */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">{main}</div>
            {side}
          </>
        ) : (
          main
        )}
      </SheetContent>
    </Sheet>
  );
}

/** A titled section inside the case drawer ("1. The story"). */
export function CaseSection({
  title,
  aside,
  children,
  className,
  id,
}: {
  title: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section className={cn("py-5 first:pt-0", className)} aria-labelledby={id}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 id={id} className="text-h2 font-semibold text-fg">
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}
