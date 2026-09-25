import { AlertTriangle, RotateCw, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { Button } from "./button";
import { toneSoft, type Tone } from "./tone";

/** Large soft-tinted icon in a circle, one sentence, and one button. */
export function EmptyState({
  icon: Icon,
  title,
  action,
  tone = "brand",
  className,
  compact,
}: {
  icon: LucideIcon;
  title: React.ReactNode;
  action?: React.ReactNode;
  tone?: Tone;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "py-8" : "py-14", className)}>
      <span className={cn("inline-flex items-center justify-center rounded-full", compact ? "size-12" : "size-16", toneSoft[tone])} aria-hidden>
        <Icon className={compact ? "size-6" : "size-8"} strokeWidth={1.5} />
      </span>
      <p className={cn("mt-4 max-w-sm text-fg", compact ? "text-body" : "text-h2 font-display font-semibold")}>{title}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Says what happened and what to do next, with a Retry button. */
export function ErrorState({
  message,
  onRetry,
  retrying,
  className,
  compact,
}: {
  message?: React.ReactNode;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className={cn(
        "flex items-center gap-4 rounded-xl border border-danger/25 bg-danger-soft/50",
        compact ? "p-4" : "flex-col p-8 text-center",
        className,
      )}
    >
      <span className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger", compact ? "size-10" : "size-14")} aria-hidden>
        <AlertTriangle className={compact ? "size-5" : "size-7"} strokeWidth={1.75} />
      </span>
      <div className={cn("min-w-0", compact && "flex-1")}>
        <p className="font-semibold text-fg">{t("error.title")}</p>
        <p className="mt-0.5 text-body text-muted">{message ?? t("error.generic")}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" size={compact ? "sm" : "md"} onClick={onRetry} loading={retrying}>
          {!retrying && <RotateCw />}
          {t("common.retry")}
        </Button>
      )}
    </div>
  );
}
