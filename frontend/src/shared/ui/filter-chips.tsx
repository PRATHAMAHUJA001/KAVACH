import { cn } from "@/shared/lib/cn";

export interface FilterOption<V extends string> {
  value: V;
  label: string;
  count?: number;
}

/** Toggle chips across the top of a list. Single-select by default. */
export function FilterChips<V extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: FilterOption<V>[];
  value: V;
  onChange: (v: V) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap items-center gap-2", className)}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-body font-medium transition-colors duration-200",
              selected
                ? "border-brand/40 bg-brand-soft text-brand"
                : "border-border bg-surface text-muted hover:border-border-strong hover:text-fg",
            )}
          >
            {o.label}
            {o.count != null && (
              <span
                className={cn(
                  "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[0.6875rem] font-semibold tnum",
                  selected ? "bg-brand text-brand-fg" : "bg-surface-2 text-muted",
                )}
              >
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
