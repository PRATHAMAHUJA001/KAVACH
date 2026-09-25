import * as React from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { useCountUp } from "@/shared/lib/useCountUp";
import { useFormat } from "@/shared/lib/i18n";
import { Skeleton } from "./skeleton";
import { TrendChip } from "./trend-chip";
import { toneSoft, type Tone } from "./tone";

export interface KpiTileProps {
  label: string;
  value: number;
  format?: "number" | "money" | "percent";
  /** One plain sentence that explains the number. */
  sentence: React.ReactNode;
  icon?: React.ReactNode;
  tone?: Tone;
  trend?: { deltaPct: number; meaning: "good" | "bad" | "neutral" };
  to?: string;
  onClick?: () => void;
  className?: string;
  "data-tour"?: string;
}

export function KpiTile({ label, value, format = "number", sentence, icon, tone = "brand", trend, to, onClick, className, ...rest }: KpiTileProps) {
  const f = useFormat();
  const animated = useCountUp(value);
  const shown =
    format === "money"
      ? f.money(animated)
      : format === "percent"
        ? f.percent(animated)
        : f.number(Math.round(animated));
  const final =
    format === "money" ? f.money(value) : format === "percent" ? f.percent(value) : f.number(value);

  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="text-body font-medium text-muted">{label}</span>
        {icon && (
          <span
            className={cn(
              "inline-flex size-9 items-center justify-center rounded-xl [&_svg]:size-[18px] [&_svg]:stroke-[1.75]",
              toneSoft[tone],
            )}
            aria-hidden
          >
            {icon}
          </span>
        )}
      </div>
      <div className="mt-2 font-display text-display font-bold tracking-tight text-fg tnum" aria-hidden>
        {shown}
      </div>
      <span className="sr-only">{final}</span>
      <p className="mt-1 text-body text-muted">{sentence}</p>
      <div className="mt-auto flex h-9 items-end justify-between gap-2 pt-3">
        {trend ? <TrendChip deltaPct={trend.deltaPct} meaning={trend.meaning} /> : <span />}
        {(to || onClick) && (
          <ChevronRight
            className="size-4 text-muted transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-brand"
            aria-hidden
          />
        )}
      </div>
    </>
  );

  const cls = cn(
    "group flex h-full flex-col rounded-card border border-border bg-surface p-5 text-left shadow-card",
    (to || onClick) &&
      "cursor-pointer transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-px hover:border-border-strong hover:shadow-card-hover",
    className,
  );

  if (to)
    return (
      <Link to={to} className={cls} data-tour={rest["data-tour"]}>
        {body}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cls} data-tour={rest["data-tour"]}>
        {body}
      </button>
    );
  return (
    <div className={cls} data-tour={rest["data-tour"]}>
      {body}
    </div>
  );
}

export function KpiTileSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-full flex-col rounded-card border border-border bg-surface p-5 shadow-card", className)}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="size-9 rounded-xl" />
      </div>
      <Skeleton className="mt-3 h-9 w-24" />
      <Skeleton className="mt-3 h-4 w-full" />
      <Skeleton className="mt-1.5 h-4 w-2/3" />
      <Skeleton className="mt-4 h-6 w-32 rounded-full" />
    </div>
  );
}
