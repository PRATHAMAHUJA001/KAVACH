import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { DUR, EASE_OUT, prefersReducedMotion } from "@/shared/lib/motion";
import { useCountUp } from "@/shared/lib/useCountUp";
import { Skeleton } from "./skeleton";

const SWEEP = 240;
const CX = 100;
const CY = 100;
const R = 80;

function point(angleDeg: number) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: CX + R * Math.sin(a), y: CY - R * Math.cos(a) };
}
const start = point(-SWEEP / 2);
const end = point(SWEEP / 2);
const ARC = `M ${start.x} ${start.y} A ${R} ${R} 0 1 1 ${end.x} ${end.y}`;

export function readinessBand(v: number): "danger" | "warn" | "ok" {
  return v < 60 ? "danger" : v <= 80 ? "warn" : "ok";
}
const BAND_STROKE = { danger: "var(--danger)", warn: "var(--warn)", ok: "var(--ok)" } as const;
const BAND_TEXT = { danger: "text-danger bg-danger-soft", warn: "text-warn bg-warn-soft", ok: "text-ok bg-ok-soft" } as const;

/** 240° radial arc, value 0–100, band colour by value, reason under it. */
export function ReadinessGauge({
  value,
  reason,
  size = 220,
  className,
}: {
  value: number;
  reason?: string;
  size?: number;
  className?: string;
}) {
  const { t } = useTranslation();
  const v = Math.max(0, Math.min(100, value));
  const band = readinessBand(v);
  const shown = useCountUp(v, DUR.gauge * 1000);
  const reduce = prefersReducedMotion();

  return (
    <figure className={cn("flex flex-col items-center text-center", className)}>
      <div className="relative" style={{ width: size, height: size * 0.78 }}>
        <svg
          viewBox="0 0 200 156"
          width={size}
          height={size * 0.78}
          role="img"
          aria-label={`${t("readiness.title")}: ${Math.round(v)} ${t("readiness.outOf")} — ${t(`readiness.band.${band}`)}`}
        >
          <path d={ARC} fill="none" stroke="var(--surface-2)" strokeWidth={14} strokeLinecap="round" />
          <path d={ARC} fill="none" stroke="var(--border)" strokeWidth={14} strokeLinecap="round" opacity={0.5} />
          <motion.path
            d={ARC}
            fill="none"
            stroke={BAND_STROKE[band]}
            strokeWidth={14}
            strokeLinecap="round"
            initial={{ pathLength: reduce ? v / 100 : 0 }}
            animate={{ pathLength: v / 100 }}
            transition={{ duration: DUR.gauge, ease: EASE_OUT }}
          />
        </svg>
        <div className="absolute inset-x-0 top-[34%] flex flex-col items-center" aria-hidden>
          <span className="font-display text-[3rem] font-bold leading-none tracking-tight text-fg tnum">
            {Math.round(shown)}
          </span>
          <span className="mt-1 text-small text-muted">{t("readiness.outOf")}</span>
        </div>
      </div>
      <span className={cn("-mt-3 inline-flex h-6 items-center rounded-full px-2.5 text-small font-semibold", BAND_TEXT[band])}>
        {t(`readiness.band.${band}`)}
      </span>
      {reason && <figcaption className="mt-3 max-w-60 text-body text-fg">{reason}</figcaption>}
    </figure>
  );
}

export function ReadinessGaugeSkeleton({ size = 220 }: { size?: number }) {
  return (
    <div className="flex flex-col items-center">
      <div className="overflow-hidden" style={{ width: size * 0.8, height: size * 0.62 }} aria-hidden>
        <div className="rounded-full border-[14px] border-surface-2" style={{ width: size * 0.8, height: size * 0.8 }} />
      </div>
      <Skeleton className="mt-4 h-6 w-20 rounded-full" />
      <Skeleton className="mt-3 h-4 w-48" />
    </div>
  );
}
