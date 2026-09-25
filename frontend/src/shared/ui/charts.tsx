import * as React from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import { useFormat } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/cn";
import { prefersReducedMotion } from "@/shared/lib/motion";

/** Series colours, fixed meaning everywhere: Alerts = indigo, Confirmed fraud = rose. */
export const SERIES = {
  alerts: "var(--chart-1)",
  teal: "var(--chart-2)",
  amber: "var(--chart-3)",
  fraud: "var(--chart-4)",
  neutral: "var(--chart-5)",
} as const;

export const axisProps = {
  tick: { fill: "var(--text-muted)", fontSize: 12 },
  tickLine: false,
  axisLine: false,
} as const;

export interface SeriesDef<K extends string> {
  key: K;
  label: string;
  color: string;
  format?: "number" | "money";
}

export function ChartLegend({ series, className }: { series: { label: string; color: string }[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1", className)}>
      {series.map((s) => (
        <li key={s.label} className="inline-flex items-center gap-2 text-small text-muted">
          <span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} aria-hidden />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

function ChartTooltipContent<K extends string>({
  active,
  payload,
  label,
  series,
  labelFormatter,
}: TooltipProps<number, string> & { series: SeriesDef<K>[]; labelFormatter: (l: string) => string }) {
  const f = useFormat();
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-44 rounded-xl border border-border bg-surface px-3 py-2.5 shadow-overlay">
      <p className="mb-1.5 text-small font-semibold text-fg">{labelFormatter(String(label))}</p>
      <ul className="space-y-1">
        {series.map((s) => {
          const item = payload.find((p) => p.dataKey === s.key);
          if (!item || item.value == null) return null;
          const v = Number(item.value);
          return (
            <li key={s.key} className="flex items-center justify-between gap-4 text-small">
              <span className="inline-flex items-center gap-2 text-muted">
                <span className="size-2 rounded-full" style={{ background: s.color }} aria-hidden />
                {s.label}
              </span>
              <span className="font-semibold text-fg tnum">{s.format === "money" ? f.money(v) : f.number(v)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Time series line chart: 2px lines, faint horizontal grid only, crosshair + tooltip,
 * legend above, and an sr-only table so it is readable without colour or sight.
 */
export function TrendChart<K extends string>({
  data,
  xKey,
  series,
  height = 260,
  caption,
  className,
}: {
  data: Array<Record<string, string | number>>;
  xKey: string;
  series: SeriesDef<K>[];
  height?: number;
  caption: string;
  className?: string;
}) {
  const f = useFormat();
  const fmtX = React.useCallback((v: string) => f.dayMonth(v), [f]);
  const animate = !prefersReducedMotion();
  // Evenly spaced ticks, anchored on the latest day so "today" is always labelled.
  const ticks = React.useMemo(() => {
    const step = Math.max(1, Math.round(data.length / 6));
    const out: string[] = [];
    for (let i = data.length - 1; i >= 0; i -= step) out.unshift(String(data[i]?.[xKey]));
    return out;
  }, [data, xKey]);
  return (
    <figure className={cn("w-full", className)}>
      {series.length > 1 && <ChartLegend series={series} className="mb-3" />}
      <div style={{ height }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 24, bottom: 0, left: -12 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey={xKey} {...axisProps} ticks={ticks} interval={0} tickFormatter={fmtX} dy={6} />
            <YAxis {...axisProps} allowDecimals={false} width={44} />
            <RTooltip
              cursor={{ stroke: "var(--border-strong)", strokeWidth: 1, strokeDasharray: "3 3" }}
              content={<ChartTooltipContent series={series} labelFormatter={(l) => f.date(l)} />}
            />
            {series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--surface)" }}
                isAnimationActive={animate}
                animationDuration={600}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">{caption}</figcaption>
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            {series.map((s) => (
              <th key={s.key} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i}>
              <th scope="row">{f.date(String(row[xKey]))}</th>
              {series.map((s) => (
                <td key={s.key}>{row[s.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
