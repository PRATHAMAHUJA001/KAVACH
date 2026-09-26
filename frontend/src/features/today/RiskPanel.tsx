import { useState } from "react";
import { Link } from "react-router-dom";
import { MessagesSquare, Wallet } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Button, Card, CardHeader, EmptyState, ErrorState, Money, Segmented, Skeleton } from "@/shared/ui";
import { useFormat } from "@/shared/lib/i18n";
import { DUR, EASE_OUT, fadeUpItem, listStagger } from "@/shared/lib/motion";
import { cn } from "@/shared/lib/cn";
import type { ExposureRow, Liquidity } from "@/services/api";
import { useRisk } from "@/services/api";

type Grouping = "segment" | "branch";

/** Same three brand steps the case-file reason bars use, relative to the biggest row. */
function strength(share: number): "strong" | "medium" | "weak" {
  return share >= 0.5 ? "strong" : share >= 0.25 ? "medium" : "weak";
}

function LiquidityLine({ l }: { l: Liquidity }) {
  const { t } = useTranslation();
  const f = useFormat();
  const up = l.net >= 0;
  return (
    <div className="mb-5 rounded-xl bg-surface-2 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="inline-flex items-center gap-2 text-body font-medium text-fg">
          <Wallet className="size-4 text-muted" strokeWidth={1.75} aria-hidden />
          {t("today.risk.liquidity.title")}
        </p>
        <p className="text-small text-muted">{t("today.risk.liquidity.window", { days: l.windowDays, txns: f.number(l.txnCount) })}</p>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        <div>
          <dt className="label-caps text-muted">{t("today.risk.liquidity.inflow")}</dt>
          <dd className="text-body font-medium text-fg">
            <Money amount={l.inflow} focusable={false} />
          </dd>
        </div>
        <div>
          <dt className="label-caps text-muted">{t("today.risk.liquidity.outflow")}</dt>
          <dd className="text-body font-medium text-fg">
            <Money amount={l.outflow} focusable={false} />
          </dd>
        </div>
        <div>
          <dt className="label-caps text-muted">{t("today.risk.liquidity.net")}</dt>
          <dd className={cn("text-body font-semibold", up ? "text-ok" : "text-danger")}>
            {up && <span aria-hidden>+</span>}
            <Money amount={l.net} focusable={false} />
          </dd>
        </div>
        <div>
          <dt className="label-caps text-muted">{t("today.risk.liquidity.coverage")}</dt>
          <dd className="tnum text-body font-medium text-fg">{t("today.risk.liquidity.coverageValue", { ratio: f.number(l.coverageRatio, 2) })}</dd>
        </div>
      </dl>
      <p className="mt-2 text-small text-muted">{t(up ? "today.risk.liquidity.netPositive" : "today.risk.liquidity.netNegative")}</p>
    </div>
  );
}

function Row({ row, grouping, maxPct, index }: { row: ExposureRow; grouping: Grouping; maxPct: number; index: number }) {
  const { t } = useTranslation();
  const f = useFormat();
  const pct = f.percent(row.pctAtRisk / 100, 1);
  const share = row.pctAtRisk / maxPct;
  const s = strength(share);
  const question = t(`today.risk.askQuestion.${grouping}`, { label: row.label, pct });
  return (
    <motion.li
      variants={fadeUpItem}
      className={cn(
        // Narrow: label + amounts on one line, the bar under them, the action last.
        // From sm it's a single row: label · bar · amounts · action.
        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2.5 py-3.5 first:pt-0 last:pb-0",
        "sm:grid-cols-[9rem_minmax(0,1fr)_9rem_auto]",
      )}
    >
      <div className="order-1 min-w-0 sm:order-none">
        <p className="truncate text-body font-medium text-fg" title={row.label}>
          {row.label}
        </p>
        <p className="text-small text-muted">{t("today.risk.accounts", { count: row.accounts, n: f.number(row.accounts) })}</p>
      </div>

      <div className="order-3 col-span-2 flex min-w-0 items-center gap-3 sm:order-none sm:col-span-1">
        <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2">
          <motion.div
            className={cn("h-full rounded-full", s === "strong" ? "bg-brand" : s === "medium" ? "bg-brand/70" : "bg-brand/45")}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, share * 100)}%` }}
            transition={{ duration: DUR.countUp, ease: EASE_OUT, delay: index * 0.06 }}
          />
        </div>
        <span className="tnum w-14 shrink-0 text-right text-body font-semibold text-fg">{pct}</span>
      </div>

      <div className="order-2 min-w-0 text-right sm:order-none">
        <p className="text-body font-medium text-fg">
          <Money amount={row.exposureAtRisk} focusable={false} />
        </p>
        <p className="truncate text-small text-muted">{t("today.risk.ofExposure", { amount: f.money(row.exposure) })}</p>
      </div>

      <Button asChild variant="ghost" size="sm" className="order-4 col-span-2 justify-self-end sm:order-none sm:col-span-1">
        <Link to={`/ask?q=${encodeURIComponent(question)}`} aria-label={t("today.risk.askAria", { label: row.label })}>
          <MessagesSquare />
          {t("today.risk.ask")}
        </Link>
      </Button>
    </motion.li>
  );
}

/** Where the loan book is concentrated, how much of it is flagged, and the money-in/out read. */
export function RiskPanel() {
  const { t } = useTranslation();
  const f = useFormat();
  const [grouping, setGrouping] = useState<Grouping>("segment");
  const risk = useRisk();
  const data = risk.data;
  const rows = data ? (grouping === "segment" ? data.bySegment : data.byBranch) : [];
  const maxPct = Math.max(...rows.map((r) => r.pctAtRisk), 0.0001);

  return (
    <Card className="p-6" data-tour="risk">
      <CardHeader
        title={t("today.risk.title")}
        subtitle={
          data ? (
            t("today.risk.totals", { amount: f.money(data.totalAtRisk), total: f.money(data.totalExposure), pct: f.percent(data.pctAtRisk / 100, 1) })
          ) : (
            <Skeleton className="mt-1 h-4 w-64" />
          )
        }
        className="mb-4"
        action={
          <Segmented<Grouping>
            size="sm"
            label={t("today.risk.group.label")}
            value={grouping}
            onChange={setGrouping}
            options={[
              { value: "segment", label: t("today.risk.group.segment") },
              { value: "branch", label: t("today.risk.group.branch") },
            ]}
          />
        }
      />

      {risk.isError && !data ? (
        <ErrorState compact onRetry={() => void risk.refetch()} retrying={risk.isFetching} />
      ) : !data ? (
        <div className="space-y-4" aria-hidden>
          <Skeleton className="h-28 w-full rounded-xl" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-2 flex-1 rounded-full" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-8 w-28 rounded-control" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <LiquidityLine l={data.liquidity} />
          {rows.length === 0 ? (
            <EmptyState icon={Wallet} tone="ok" title={t("today.risk.empty")} compact />
          ) : (
            <motion.ul key={grouping} variants={listStagger} initial="initial" animate="animate" className="divide-y divide-border">
              {rows.map((r, i) => (
                <Row key={r.label} row={r} grouping={grouping} maxPct={maxPct} index={i} />
              ))}
            </motion.ul>
          )}
        </>
      )}
    </Card>
  );
}
