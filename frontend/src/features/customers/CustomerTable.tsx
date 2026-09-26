import { ChevronLeft, ChevronRight, SearchX, ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Chip, EmptyState, ErrorState, Money, RiskMeter, Skeleton, TBody, TD, TH, THead, TR, Table, Tooltip } from "@/shared/ui";
import { cn } from "@/shared/lib/cn";
import { useFormat } from "@/shared/lib/i18n";
import type { Customer, CustomerPage } from "@/services/api";
import { usePrefetchCustomer } from "@/services/api";

/** The score as a band, never a bare float. Unscored says so rather than showing 0. */
export function RiskBadge({ customer, size = "sm" }: { customer: Pick<Customer, "score" | "riskLevel">; size?: "sm" | "md" }) {
  const { t } = useTranslation();
  const f = useFormat();
  if (customer.riskLevel == null) return <span className="text-small text-muted">{t("customers.noScore")}</span>;
  return (
    <Tooltip content={t("customers.scoreTooltip", { score: f.percent(customer.score ?? 0, 1) })}>
      <span tabIndex={0} className="inline-flex cursor-help">
        <RiskMeter level={customer.riskLevel} size={size} />
      </span>
    </Tooltip>
  );
}

function Row({ customer: c, onOpen }: { customer: Customer; onOpen: (id: string) => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const prefetch = usePrefetchCustomer();
  return (
    <TR
      // The whole row is the control: clickable, in the tab order, and Enter/Space open it.
      role="button"
      tabIndex={0}
      aria-label={t("customers.open", { name: c.name })}
      onClick={() => onOpen(c.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(c.id);
        }
      }}
      onMouseEnter={() => prefetch(c.id)}
      onFocus={() => prefetch(c.id)}
      className="cursor-pointer outline-none focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40"
    >
      <TD>
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium text-fg">{c.name}</span>
          {c.isPep && (
            <Tooltip content={t("customers.pepHint")}>
              <span tabIndex={0} className="inline-flex">
                <Chip tone="warn" icon={<ShieldAlert />}>
                  {t("customers.pep")}
                </Chip>
              </span>
            </Tooltip>
          )}
        </div>
        <p className="truncate text-small text-muted">{c.id}</p>
      </TD>
      <TD className="whitespace-nowrap font-mono text-small text-muted">{c.pan ?? "—"}</TD>
      <TD className="whitespace-nowrap">{c.city ?? "—"}</TD>
      <TD>{c.segment ? <Chip>{c.segment}</Chip> : "—"}</TD>
      <TD>
        <RiskBadge customer={c} />
      </TD>
      <TD numeric>
        {c.openAlerts > 0 ? (
          <span className="font-semibold text-danger">{f.number(c.openAlerts)}</span>
        ) : (
          <span className="text-muted">0</span>
        )}
      </TD>
      <TD numeric>{f.number(c.accountCount)}</TD>
      <TD numeric>
        <Money amount={c.balance} focusable={false} />
      </TD>
    </TR>
  );
}

export function CustomerTable({
  data,
  isLoading,
  isError,
  isFetching,
  onRetry,
  onOpen,
  onPage,
  onClearFilters,
}: {
  data: CustomerPage | undefined;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
  onOpen: (id: string) => void;
  onPage: (page: number) => void;
  onClearFilters?: () => void;
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
      <div className="space-y-2 p-5" aria-busy aria-label={t("common.loading")}>
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-2 w-24 rounded-full" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    );

  if (data.customers.length === 0)
    return (
      <EmptyState
        icon={SearchX}
        tone="neutral"
        title={t("customers.empty")}
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

  const page = Math.floor(data.offset / Math.max(1, data.limit)) + 1;
  const totalPages = Math.max(1, Math.ceil(data.total / Math.max(1, data.limit)));
  const from = data.offset + 1;
  const to = data.offset + data.customers.length;

  return (
    <div className={cn("flex min-h-0 flex-col transition-opacity", isFetching && "opacity-70")}>
      {/* min-h-0 so the clamp below actually clamps instead of pushing the page taller. */}
      <div className="min-h-0">
        <Table flush scrollClassName="max-h-[60vh]">
          <THead className="sticky top-0 z-10">
            <TR>
              <TH>{t("customers.col.name")}</TH>
              <TH>{t("customers.col.pan")}</TH>
              <TH>{t("customers.col.city")}</TH>
              <TH>{t("customers.col.segment")}</TH>
              <TH>{t("customers.col.risk")}</TH>
              <TH numeric>{t("customers.col.alerts")}</TH>
              <TH numeric>{t("customers.col.accounts")}</TH>
              <TH numeric>{t("customers.col.balance")}</TH>
            </TR>
          </THead>
          <TBody>
            {data.customers.map((c) => (
              <Row key={c.id} customer={c} onOpen={onOpen} />
            ))}
          </TBody>
        </Table>
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-border px-5 py-3">
        <p className="tnum text-small text-muted">{t("customers.range", { from: f.number(from), to: f.number(to), total: f.number(data.total) })}</p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="size-8" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t("customers.prev")}>
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="icon" className="size-8" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label={t("customers.next")}>
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
