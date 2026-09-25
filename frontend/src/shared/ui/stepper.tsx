import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { DUR, EASE_OUT } from "@/shared/lib/motion";

export interface StepDef {
  key: string;
  label: string;
}

/**
 * Circular upload: Reading → Finding obligations → Writing checks → Ready for review.
 * `current` = index of the active step; `current >= steps.length` means all done.
 */
export function Stepper({
  steps,
  current,
  error,
  className,
}: {
  steps: StepDef[];
  current: number;
  error?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const activeIdx = Math.min(current, steps.length - 1);
  return (
    <div className={cn("w-full", className)}>
      <p className="sr-only" aria-live="polite">
        {current >= steps.length
          ? steps[steps.length - 1]?.label
          : `${t("stepper.stepOf", { n: activeIdx + 1, total: steps.length })}: ${steps[activeIdx]?.label}`}
      </p>
      <ol className="flex items-start">
        {steps.map((s, i) => {
          const done = i < current;
          const active = i === current && !error;
          const failed = i === current && error;
          return (
            <li key={s.key} className="relative flex flex-1 flex-col items-center text-center" aria-current={active ? "step" : undefined}>
              {i > 0 && (
                <div className="absolute right-1/2 top-[18px] h-0.5 w-full -translate-y-1/2 bg-border" aria-hidden>
                  <motion.div
                    className="h-full bg-ok"
                    initial={false}
                    animate={{ width: i <= current ? "100%" : "0%" }}
                    transition={{ duration: DUR.slow, ease: EASE_OUT }}
                  />
                </div>
              )}
              <span
                className={cn(
                  "relative z-10 inline-flex size-9 items-center justify-center rounded-full border-2 text-body font-semibold transition-colors duration-200",
                  done && "border-ok bg-ok text-white dark:text-[#04140a]",
                  active && "border-brand bg-surface text-brand",
                  failed && "border-danger bg-danger-soft text-danger",
                  !done && !active && !failed && "border-border bg-surface text-muted",
                )}
                aria-hidden
              >
                {done ? (
                  <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.2 }}>
                    <Check className="size-5" strokeWidth={2.5} />
                  </motion.span>
                ) : (
                  i + 1
                )}
                {active && (
                  <span className="absolute -inset-1 animate-spin rounded-full border-2 border-transparent border-t-brand [animation-duration:1.1s]" />
                )}
              </span>
              <span
                className={cn(
                  "mt-2 max-w-32 px-1 text-small font-medium",
                  done ? "text-fg" : active ? "text-brand" : failed ? "text-danger" : "text-muted",
                )}
              >
                {s.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
