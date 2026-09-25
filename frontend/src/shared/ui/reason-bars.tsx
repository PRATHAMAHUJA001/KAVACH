import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { DUR, EASE_OUT } from "@/shared/lib/motion";

export interface Reason {
  text: string;
  /** Relative weight, 0–1. */
  weight: number;
}

function strength(w: number): "strong" | "medium" | "weak" {
  return w >= 0.5 ? "strong" : w >= 0.25 ? "medium" : "weak";
}

/** Top 3 reasons as plain sentences, each with a bar showing its weight. */
export function ReasonBars({ reasons, className }: { reasons: Reason[]; className?: string }) {
  const { t } = useTranslation();
  const top = [...reasons].sort((a, b) => b.weight - a.weight).slice(0, 3);
  const max = Math.max(...top.map((r) => r.weight), 0.0001);
  return (
    <ol className={cn("space-y-4", className)}>
      {top.map((r, i) => {
        const s = strength(r.weight);
        return (
          <li key={i} className="flex gap-3">
            <span
              className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-small font-bold text-brand"
              aria-hidden
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-body font-medium text-fg">{r.text}</p>
              <div className="mt-2 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <motion.div
                    className={cn("h-full rounded-full", s === "strong" ? "bg-brand" : s === "medium" ? "bg-brand/70" : "bg-brand/45")}
                    initial={{ width: 0 }}
                    animate={{ width: `${(r.weight / max) * 100}%` }}
                    transition={{ duration: DUR.countUp, ease: EASE_OUT, delay: i * 0.08 }}
                  />
                </div>
                <span className="w-28 shrink-0 text-right text-small text-muted">{t(`reason.strength.${s}`)}</span>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
