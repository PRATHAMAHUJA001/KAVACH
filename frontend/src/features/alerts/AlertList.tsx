import { ChevronLeft, ChevronRight, SearchX } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Button, Chip, DeadlineCountdown, EmptyState, ErrorState, Money, RiskMeter, Skeleton } from "@/shared/ui";
import { cn } from "@/shared/lib/cn";
import { useFormat } from "@/shared/lib/i18n";
import { fadeUpItem, listStagger } from "@/shared/lib/motion";
import type { Alert, AlertPage } from "@/services/api";
import { usePrefetchAlert } from "@/services/api";
import { useSession } from "@/features/session";

/** Closed alerts say how they ended; open ones show the report deadline. */
export function AlertStatus({ alert, size = "sm" }: { alert: Alert; size?: "sm" | "md" }) {
  const { t } = useTranslation();
  const { now } = useSession();
  if (alert.reportFiled) return <Chip tone="ok">{t("alerts.resolution.filed")}</Chip>;
  if (alert.status === "CLOSED") {
    const r = alert.resolution;
    return (
      <Chip tone={r === "TRUE_POSITIVE" ? "danger" : "neutral"}>
        {r === "TRUE_POSITIVE" || r === "FALSE_POSITIVE" ? t(`alerts.resolution.${r}`) : t("alerts.resolution.closed")}
      </Chip>
    );
  }
  return alert.dueAt ? <DeadlineCountdown dueAt={alert.dueAt} now={now} size={size} /> : null;
}

function Row({ alert, onOpen }: { alert: Alert; onOpen: (id: string) => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const prefetch = usePrefetchAlert();
  const name = f.text(alert.customerName);
  const where = [alert.city ? f.text(alert.city) : null, alert.branch].filter(Boolean).join(" · ");
  return (
    <motion.li variants={fadeUpItem}>
      <button
        type="button"
        onClick={() => onOpen(alert.id)}
        onMouseEnter={() => prefetch(alert.id)}
        onFocus={() => prefetch(alert.id)}
        aria-label={t("alerts.open", { name })}
        className={cn(
          "group grid w-full grid-cols-[8.5rem_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-4 text-left transition-colors hover:bg-surface-2/60",
          "md:grid-cols-[8.5rem_minmax(0,1fr)_8rem_12rem_1.25rem]",
          alert.status === "CLOSED" && "opacity-80",
        )}
      >
        <RiskMeter level={alert.riskLevel} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-body font-semibold text-fg">{name}</p>
          <p className="truncate text-small text-muted">
            {t(`typology.${alert.typology}`, { defaultValue: alert.typology })}
            {where && <span className="text-muted/80"> · {where}</span>}
          </p>
        </div>
        <div className="text-right">
          {alert.amount != null ? (
            <>
              <Money amount={alert.amount} focusable={false} className="text-body font-semibold text-fg" />
              {alert.txnCount != null && <p className="text-small text-muted">{t("alerts.txns", { count: alert.txnCount })}</p>}
            </>
          ) : null}
        </div>
        <div className="col-span-2 col-start-2 md:col-span-1 md:col-start-auto md:justify-self-end">
          <AlertStatus alert={alert} />
        </div>
        <ChevronRight className="hidden size-5 text-muted transition-transform group-hover:translate-x-0.5 md:block" strokeWidth={1.75} aria-hidden />
      </button>
    </motion.li>
  );
}

export function AlertList({
  data,
  isLoading,
  isError,
  isFetching,
  onRetry,
  onOpen,
  onClearFilters,
  onPage,
}: {
  data: AlertPage | undefined;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
  onOpen: (id: string) => void;
  onClearFilters?: () => void;
  onPage: (page: number) => void;
}) {
  const { t } = useTranslation();
  const f = useFormat();

  if (isError && !data)
    return (
      <div className="p-5">
        <ErrorState compact onRetry={onRetry} retrying={isFetching} />
      </div>
    );

  if (isLoading || !data)
    return (
      <ul className="divide-y divide-border" aria-busy aria-label={t("common.loading")}>
        {Array.from({ length: 8 }, (_, i) => (
          <li key={i} className="flex items-center gap-4 px-5 py-4">
            <Skeleton className="h-2 w-24 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-72" />
            </div>
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-6 w-40 rounded-full" />
          </li>
        ))}
      </ul>
    );

  if (data.alerts.length === 0)
    return (
      <EmptyState
        icon={SearchX}
        tone="neutral"
        title={t("empty.noAlerts")}
        compact
        action={
          onClearFilters && (
            <Button variant="secondary" size="sm" onClick={onClearFilters}>
              {t("empty.clearFilters")}
            </Button>
          )
        }
      />
    );

  const from = (data.page - 1) * data.pageSize + 1;
  const to = from + data.alerts.length - 1;
  return (
    <div className={cn("transition-opacity", isFetching && "opacity-70")}>
      <motion.ul key={`${data.page}-${data.alerts[0]?.id}`} variants={listStagger} initial="initial" animate="animate" className="divide-y divide-border">
        {data.alerts.map((a) => (
          <Row key={a.id} alert={a} onOpen={onOpen} />
        ))}
      </motion.ul>
      <div className="flex items-center justify-between gap-4 border-t border-border px-5 py-3">
        <p className="text-small text-muted tnum">{t("alerts.range", { from: f.number(from), to: f.number(to), total: f.number(data.total) })}</p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="size-8" disabled={data.page <= 1} onClick={() => onPage(data.page - 1)} aria-label={t("alerts.prev")}>
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="icon" className="size-8" disabled={data.page >= data.totalPages} onClick={() => onPage(data.page + 1)} aria-label={t("alerts.next")}>
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
