import { useFormat } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/cn";

/** Horizontal bars for "category → number" results: label, bar, value. One series, one colour. */
export function BarList({
  rows,
  caption,
  format = "number",
  className,
}: {
  rows: Array<{ label: string; value: number }>;
  caption: string;
  format?: "number" | "money";
  className?: string;
}) {
  const f = useFormat();
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1);
  return (
    <figure className={cn("w-full", className)}>
      <figcaption className="sr-only">{caption}</figcaption>
      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li key={i} className="grid grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-3 text-small">
            <span className="truncate text-fg" title={r.label}>
              {r.label}
            </span>
            <span className="h-2.5 overflow-hidden rounded-full bg-surface-2">
              <span className="block h-full rounded-full" style={{ width: `${(Math.abs(r.value) / max) * 100}%`, background: "var(--chart-1)" }} />
            </span>
            <span className="tnum text-right font-medium text-fg">{format === "money" ? f.money(r.value) : f.number(r.value)}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
