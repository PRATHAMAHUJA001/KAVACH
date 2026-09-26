import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardHeader, Money, RiskMeter, Table, TBody, TD, TH, THead, TR } from "@/shared/ui";
import { useFormat } from "@/shared/lib/i18n";
import type { RingDetail } from "@/services/api";

export function RingTables({ detail }: { detail: RingDetail }) {
  const { t } = useTranslation();
  const f = useFormat();
  const nameOf = new Map(detail.graph.nodes.map((n) => [n.id, f.text(n.label)]));
  const members = [...detail.graph.nodes].sort((a, b) => (b.moneyIn ?? 0) - (a.moneyIn ?? 0));
  return (
    <div className="grid grid-cols-12 gap-6">
      <Card className="col-span-12 overflow-hidden p-0 xl:col-span-7">
        <CardHeader title={t("rings.membersTitle")} className="p-5 pb-3" />
        <Table>
          <THead>
            <TR>
              <TH>{t("rings.col.name")}</TH>
              <TH>{t("rings.col.role")}</TH>
              <TH numeric>{t("rings.col.in")}</TH>
              <TH numeric>{t("rings.col.out")}</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {members.map((m) => (
              <TR key={m.id}>
                <TD>
                  <p className="font-medium text-fg">{f.text(m.label)}</p>
                  <div className="mt-0.5 flex items-center gap-2 text-small text-muted">
                    <RiskMeter level={m.riskLevel} size="sm" showLabel={false} />
                    {[m.id, m.city].filter(Boolean).join(" · ")}
                  </div>
                </TD>
                <TD className="whitespace-nowrap">{m.role ? t(`rings.roleShort.${m.role}`) : "—"}</TD>
                <TD numeric>{m.moneyIn != null ? <Money amount={m.moneyIn} focusable={false} /> : "—"}</TD>
                <TD numeric>{m.moneyOut != null ? <Money amount={m.moneyOut} focusable={false} /> : "—"}</TD>
                <TD className="text-right">
                  {m.alertId && (
                    <Link to={`/alerts?case=${encodeURIComponent(m.alertId)}`} className="inline-flex items-center gap-1 whitespace-nowrap text-small font-medium text-brand hover:underline">
                      {t("rings.openCase")}
                      <ArrowRight className="size-3.5" />
                    </Link>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      <Card className="col-span-12 overflow-hidden p-0 xl:col-span-5">
        <CardHeader title={t("rings.transfersTitle")} subtitle={t("rings.transfersSub")} className="p-5 pb-3" />
        <div className="max-h-[28rem] overflow-auto">
          <Table>
            <THead>
              <TR>
                <TH>{t("rings.col.when")}</TH>
                <TH>{t("rings.col.fromTo")}</TH>
                <TH numeric>{t("case.txn.amount")}</TH>
              </TR>
            </THead>
            <TBody>
              {detail.transactions
                .filter((x) => x.direction === "DEBIT")
                .slice(0, 40)
                .map((x) => (
                  <TR key={x.id}>
                    <TD className="whitespace-nowrap text-small">{f.dateTime(x.at)}</TD>
                    <TD className="text-small">
                      {nameOf.get(x.accountId) ?? x.accountId} → {nameOf.get(x.counterparty) ?? x.counterparty}
                    </TD>
                    <TD numeric>
                      <Money amount={x.amount} focusable={false} />
                    </TD>
                  </TR>
                ))}
            </TBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
