import { ArrowDownRight, ArrowUpRight, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { toneSoft } from "./tone";

/**
 * ▲12% vs last week. Coloured by *meaning*, not by direction:
 * more fraud caught is good (green) even though it's "up"; more overdue reports is bad (red).
 */
export function TrendChip({
  deltaPct,
  meaning,
  suffix,
  className,
}: {
  deltaPct: number;
  meaning: "good" | "bad" | "neutral";
  suffix?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const Icon = deltaPct > 0 ? ArrowUpRight : deltaPct < 0 ? ArrowDownRight : ArrowRight;
  const tone = meaning === "good" ? "ok" : meaning === "bad" ? "danger" : "neutral";
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full px-2 text-small font-semibold tnum",
        toneSoft[tone],
        className,
      )}
    >
      <Icon className="size-3.5" strokeWidth={2.25} aria-hidden />
      {Math.abs(Math.round(deltaPct))}%
      <span className="font-normal opacity-90">{suffix ?? t("common.vsLastWeek")}</span>
    </span>
  );
}
