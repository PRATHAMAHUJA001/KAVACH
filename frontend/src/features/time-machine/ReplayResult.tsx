import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Card } from "@/shared/ui";
import { cn } from "@/shared/lib/cn";
import { useFormat } from "@/shared/lib/i18n";
import { DUR, EASE_OUT, prefersReducedMotion } from "@/shared/lib/motion";
import type { Replay, RuleParam } from "@/services/api";
import { USE_MOCKS } from "@/services/api";

type Metric = "alerts" | "fraudCaught" | "analystHours";
/** More fraud caught is good; more alerts and hours are a cost. */
const GOOD_WHEN_UP: Record<Metric, boolean> = { alerts: false, fraudCaught: true, analystHours: false };

export function formatParam(p: Pick<RuleParam, "unit">, v: number, f: ReturnType<typeof useFormat>) {
  return p.unit === "inr" ? f.money(v) : p.unit === "hours" ? `${f.number(v)} h` : p.unit === "percent" ? `${v}%` : f.number(v);
}

function Bars({ metric, replay }: { metric: Metric; replay: Replay }) {
  const { t } = useTranslation();
  const f = useFormat();
  const a = replay.current[metric];
  const b = replay.proposed[metric];
  const max = Math.max(a, b, metric === "fraudCaught" ? replay.fraudTotal : 0, 1);
  const delta = b - a;
  const good = delta === 0 ? null : (delta > 0) === GOOD_WHEN_UP[metric];
  const animate = !prefersReducedMotion();
  const row = (label: string, v: number, tone: string, delay: number) => (
    <div className="grid grid-cols-[6.5rem_1fr_5rem] items-center gap-3">
      <span className="text-small text-muted">{label}</span>
      <span className="h-3 overflow-hidden rounded-full bg-surface-2">
        <motion.span
          className={cn("block h-full rounded-full", tone)}
          initial={animate ? { width: 0 } : false}
          animate={{ width: `${(v / max) * 100}%` }}
          transition={{ duration: DUR.countUp, ease: EASE_OUT, delay }}
        />
      </span>
      <span className="text-right font-semibold text-fg tnum">{f.number(v)}</span>
    </div>
  );
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-semibold text-fg">{t(`tm.metric.${metric}`)}</p>
        {delta !== 0 && (
          <span className={cn("rounded-full px-2 text-small font-semibold tnum", good ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger")}>
            {delta > 0 ? "+" : "−"}
            {f.number(Math.abs(delta))}
          </span>
        )}
      </div>
      {row(t("tm.now"), a, "bg-[var(--chart-5)]", 0)}
      {row(t("tm.proposed"), b, "bg-brand", 0.12)}
      {metric === "fraudCaught" && <p className="text-small text-muted">{t("tm.ofTotal", { total: replay.fraudTotal })}</p>}
    </div>
  );
}

export function ReplayResult({ replay, param }: { replay: Replay; param: RuleParam }) {
  const { t } = useTranslation();
  const f = useFormat();
  const c = replay.current;
  const p = replay.proposed;
  const dFraud = p.fraudCaught - c.fraudCaught;
  const dHours = Math.round(p.analystHours - c.analystHours);
  const move = p.value === c.value ? "keep" : p.value < c.value ? "lower" : "raise";
  const key =
    move === "keep" || (dFraud === 0 && dHours === 0) ? "same" : dFraud > 0 ? (dHours > 0 ? "moreFraudMoreHours" : "moreFraudFewerHours") : dFraud < 0 ? (dHours < 0 ? "lessFraudFewerHours" : "lessFraudMoreHours") : dHours < 0 ? "fewerHours" : "moreHours";
  const verdict = t(`tm.verdict.${key}`, {
    move: t(`tm.move.${move}`, { value: formatParam(param, p.value, f) }),
    fraud: Math.abs(dFraud),
    count: Math.abs(dFraud),
    hours: f.number(Math.abs(dHours)),
    days: replay.days,
  });
  const tone = key === "same" ? "neutral" : dFraud > 0 || (dFraud === 0 && dHours < 0) ? "ok" : "warn";
  return (
    <Card className="space-y-6 p-6" aria-live="polite">
      <p
        className={cn(
          "rounded-xl px-5 py-4 font-display text-h2 font-semibold",
          tone === "ok" ? "bg-ok-soft text-ok" : tone === "warn" ? "bg-warn-soft text-warn" : "bg-surface-2 text-fg",
        )}
      >
        {verdict}
      </p>
      <div className="grid gap-6 lg:grid-cols-3">
        <Bars metric="alerts" replay={replay} />
        <Bars metric="fraudCaught" replay={replay} />
        <Bars metric="analystHours" replay={replay} />
      </div>
      <p className="text-small text-muted">{t(USE_MOCKS ? "tm.methodDemo" : "tm.method", { days: replay.days })}</p>
    </Card>
  );
}
