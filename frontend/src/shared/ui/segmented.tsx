import { motion } from "framer-motion";
import { useId } from "react";
import { cn } from "@/shared/lib/cn";

/** Two-to-four option switch (EN | हिन्दी, chart/table). */
export function Segmented<V extends string>({
  options,
  value,
  onChange,
  label,
  size = "md",
  className,
}: {
  options: { value: V; label: React.ReactNode; lang?: string }[];
  value: V;
  onChange: (v: V) => void;
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex items-center rounded-control bg-surface-2 p-0.5", className)}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            lang={o.lang}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative inline-flex items-center justify-center rounded-lg font-medium transition-colors",
              size === "sm" ? "h-7 px-2.5 text-small" : "h-8 px-3 text-body",
              selected ? "text-fg" : "text-muted hover:text-fg",
            )}
          >
            {selected && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-lg bg-surface shadow-sm ring-1 ring-border"
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
