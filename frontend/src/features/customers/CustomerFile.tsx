import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, MessagesSquare, ShieldAlert, UserX } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Button,
  CaseDrawer,
  CaseSection,
  Chip,
  EmptyState,
  ErrorState,
  Money,
  ReasonBars,
  Skeleton,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  Tooltip,
} from "@/shared/ui";
import { useFormat } from "@/shared/lib/i18n";
import type { CustomerDetail } from "@/services/api";
import { ApiError, useCustomer } from "@/services/api";
import { CustomerAskPanel } from "./CustomerAskPanel";
import { RiskBadge } from "./CustomerTable";

/** The customer file: who they are, what they hold, why they score, what fired. */
export function CustomerFile({ customerId, onClose }: { customerId: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const q = useCustomer(customerId);
  const d = q.data;
  const notFound = q.error instanceof ApiError && q.error.kind === "notFound";
  const [askOpen, setAskOpen] = useState(false);

  // A different customer starts with the chat closed.
  useEffect(() => setAskOpen(false), [customerId]);

  const name = d?.customer.name ?? "";
  return (
    <CaseDrawer
      open={!!customerId}
      onOpenChange={(o) => !o && onClose()}
      loading={!d && !q.isError}
      eyebrow={d ? [d.customer.segment, d.customer.city].filter(Boolean).join(" · ") || undefined : undefined}
      title={d ? name : t("customers.file.loading")}
      description={d ? t("page.customers.subtitle") : undefined}
      riskLevel={d?.customer.riskLevel ?? undefined}
      deadline={d?.customer.isPep ? <Chip tone="warn" icon={<ShieldAlert />}>{t("customers.pep")}</Chip> : undefined}
      primaryAction={
        d && !askOpen ? (
          <Button size="sm" onClick={() => setAskOpen(true)}>
            <MessagesSquare />
            {t("customers.ask.open")}
          </Button>
        ) : undefined
      }
      side={
        d && customerId && askOpen ? (
          <CustomerAskPanel customerId={customerId} seedQuestion={t("customers.ask.seed", { name })} onClose={() => setAskOpen(false)} />
        ) : undefined
      }
    >
      {q.isError && !d ? (
        notFound ? (
          <EmptyState icon={UserX} tone="neutral" title={t("customers.file.notFound")} compact />
        ) : (
          <ErrorState compact onRetry={() => void q.refetch()} retrying={q.isFetching} />
        )
      ) : !d ? (
        <FileSkeleton />
      ) : (
        <FileBody detail={d} />
      )}
    </CaseDrawer>
  );
}

function FileSkeleton() {
  return (
    <div className="space-y-8" aria-busy>
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}

/** SHAP contributions as the same reason bars the case file uses, biggest pull first. */
function Drivers({ detail: d }: { detail: CustomerDetail }) {
  const { t } = useTranslation();
  const max = Math.max(...d.drivers.map((x) => Math.abs(x.shap)), 0.0001);
  return (
    <ReasonBars
      reasons={d.drivers.map((x) => ({
        text: t(`customers.driver.${x.feature}`, { defaultValue: x.feature.replaceAll("_", " ").toLowerCase() }),
        weight: Math.abs(x.shap) / max,
      }))}
    />
  );
}

function FileBody({ detail: d }: { detail: CustomerDetail }) {
  const { t } = useTranslation();
  const f = useFormat();
  const navigate = useNavigate();
  const c = d.customer;

  const facts: Array<[string, React.ReactNode]> = [
    [t("customers.field.id"), c.id],
    [t("customers.field.pan"), c.pan ?? "—"],
    [t("customers.field.kyc"), c.kycStatus ? t(`customers.kyc.${c.kycStatus}`, { defaultValue: c.kycStatus }) : "—"],
    [t("customers.field.kycUpdated"), d.kycUpdatedAt ? f.date(d.kycUpdatedAt) : "—"],
    [t("customers.field.occupation"), d.occupation ?? "—"],
    [t("customers.field.income"), d.declaredIncome != null ? <Money amount={d.declaredIncome} focusable={false} /> : "—"],
    [t("customers.field.where"), [c.city, d.state, d.region].filter(Boolean).join(" · ") || "—"],
    [t("customers.field.channel"), d.onboardingChannel ?? "—"],
    [t("customers.field.category"), c.riskCategory ? t(`customers.category.${c.riskCategory}`, { defaultValue: c.riskCategory }) : "—"],
    [t("customers.field.dob"), d.dob ? f.date(d.dob) : "—"],
  ];

  return (
    <div className="divide-y divide-border">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 pb-5">
        {facts.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="label-caps text-muted">{label}</dt>
            <dd className="truncate text-body text-fg">{value}</dd>
          </div>
        ))}
      </dl>

      <CaseSection id="cust-accounts" title={t("customers.file.accounts")} className="pt-5">
        {d.accounts.length === 0 ? (
          <p className="text-body text-muted">{t("customers.file.noAccounts")}</p>
        ) : (
          <Table scrollClassName="max-h-72">
            <THead>
              <TR>
                <TH>{t("customers.acct.id")}</TH>
                <TH>{t("customers.acct.type")}</TH>
                <TH>{t("customers.acct.status")}</TH>
                <TH>{t("customers.col.risk")}</TH>
                <TH numeric>{t("customers.acct.balance")}</TH>
              </TR>
            </THead>
            <TBody>
              {d.accounts.map((a) => (
                <TR key={a.id}>
                  <TD className="whitespace-nowrap font-mono text-small">{a.id}</TD>
                  <TD className="whitespace-nowrap">{a.type ?? "—"}</TD>
                  <TD className="whitespace-nowrap">
                    <span className="flex items-center gap-2">
                      {a.status ?? "—"}
                      {a.openAlerts > 0 && (
                        <Tooltip content={t("customers.acct.openAlerts", { count: a.openAlerts })}>
                          <span tabIndex={0} className="inline-flex">
                            <Chip tone="danger" icon={<Bell />}>
                              {a.openAlerts}
                            </Chip>
                          </span>
                        </Tooltip>
                      )}
                    </span>
                  </TD>
                  <TD>
                    <RiskBadge customer={a} />
                  </TD>
                  <TD numeric>
                    <Money amount={a.balance} focusable={false} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CaseSection>

      <CaseSection
        id="cust-drivers"
        title={t("customers.file.drivers")}
        aside={d.driverAccountId ? <span className="text-small text-muted">{d.driverAccountId}</span> : undefined}
      >
        {d.drivers.length > 0 ? (
          <>
            <Drivers detail={d} />
            {d.driverScoredAt && <p className="mt-3 text-small text-muted">{t("customers.file.scoredAt", { when: f.dateTime(d.driverScoredAt) })}</p>}
          </>
        ) : (
          <p className="text-body text-muted">{t("customers.file.noDrivers")}</p>
        )}
      </CaseSection>

      <CaseSection id="cust-alerts" title={t("customers.file.alerts")}>
        {d.alerts.length === 0 ? (
          <p className="text-body text-muted">{t("customers.file.noAlerts")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {d.alerts.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/alerts?case=${encodeURIComponent(a.id)}`)}
                  aria-label={t("customers.file.openAlert", { id: a.id })}
                  className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-surface-2/60"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-medium text-fg">{t(`typology.${a.typology}`, { defaultValue: a.typology })}</p>
                    <p className="truncate text-small text-muted">
                      {f.dateTime(a.createdAt)}
                      {a.accountId && <span className="text-muted/80"> · {a.accountId}</span>}
                    </p>
                  </div>
                  <Chip tone={a.status === "CLOSED" ? "neutral" : "danger"}>
                    {t(`customers.alertStatus.${a.status}`, { defaultValue: a.status })}
                  </Chip>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CaseSection>
    </div>
  );
}
