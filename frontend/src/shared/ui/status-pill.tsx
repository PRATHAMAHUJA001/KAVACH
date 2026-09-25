import { CheckCircle2, AlertTriangle, OctagonAlert, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import type { DeadlineStatus } from "@/shared/lib/format";

export type PillStatus = DeadlineStatus;

const CONFIG: Record<PillStatus, { Icon: typeof CheckCircle2; cls: string }> = {
  ok: { Icon: CheckCircle2, cls: "bg-ok-soft text-ok" },
  attention: { Icon: AlertTriangle, cls: "bg-warn-soft text-warn" },
  act: { Icon: OctagonAlert, cls: "bg-danger-soft text-danger" },
  overdue: { Icon: Clock, cls: "bg-danger text-white dark:text-[#1a0606]" },
};

/** Icon + word + soft background. Never colour alone. */
export function StatusPill({
  status,
  label,
  size = "md",
  className,
}: {
  status: PillStatus;
  /** Override the default word ("Report due in 2 days"). */
  label?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const { t } = useTranslation();
  const { Icon, cls } = CONFIG[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full font-medium",
        size === "sm" ? "h-6 px-2 text-small" : "h-7 px-2.5 text-body",
        cls,
        className,
      )}
    >
      <Icon className={size === "sm" ? "size-3.5" : "size-4"} strokeWidth={2} aria-hidden />
      {label ?? t(`status.${status}`)}
    </span>
  );
}
