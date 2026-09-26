import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BarList, Card, CardHeader, Chip, ErrorState, KpiTile, Skeleton, Table, TBody, TD, TH, THead, TR, type Tone } from "@/shared/ui";
import { useFormat } from "@/shared/lib/i18n";
import { humanizeCode } from "@/shared/lib/format";
import { useRuleEval, useRuleHealth } from "@/services/api";

const VERDICT_TONE: Record<string, Tone> = { healthy: "ok", noisy: "warn", quiet: "neutral" };

export function HealthTab() {
  const { t } = useTranslation();
  const f = useFormat();
  const q = useRuleHealth();
  const ev = useRuleEval();
  if (q.isError && !q.data) return <ErrorState onRetry={() => void q.refetch()} />;
  const h = q.data;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4" data-tour="rule-health">
        {h ? (
          <>
            <KpiTile label={t("rulebook.health.active")} value={h.active} sentence={t("rulebook.health.activeSentence", { count: h.total })} />
            <KpiTile label={t("rulebook.health.pending")} value={h.pending} tone="warn" sentence={t("rulebook.health.pendingSentence")} />
            <KpiTile label={t("rulebook.health.rejected")} value={h.rejected} sentence={t("rulebook.health.rejectedSentence")} />
            <KpiTile label={t("rulebook.health.precision")} value={h.avgPrecision} format="percent" tone="info" sentence={t("rulebook.health.precisionSentence")} />
          </>
        ) : (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-36 rounded-card" />)
        )}
      </div>

      {ev.data && ev.data.coverage.length > 0 && (
        <Card className="p-6">
          <CardHeader
            title={t("rulebook.health.evalTitle")}
            subtitle={(() => {
              const caught = ev.data.coverage.reduce((s, c) => s + c.caught_by_rules, 0);
              const total = ev.data.coverage.reduce((s, c) => s + c.fraud_cases, 0);
              return t("rulebook.health.evalSub", { caught, total, recall: total ? Math.round((caught / total) * 100) : 0, precision: Math.round(ev.data.precision * 100) });
            })()}
            className="mb-4"
          />
          <BarList
            caption={t("rulebook.health.evalTitle")}
            rows={ev.data.coverage.map((c) => ({ label: `${t(`typology.${c.typology}`, { defaultValue: humanizeCode(c.typology) })} (${c.caught_by_rules}/${c.fraud_cases})`, value: c.fraud_cases ? Math.round((c.caught_by_rules / c.fraud_cases) * 100) : 0 }))}
          />
          <p className="mt-3 text-small text-muted">{t("rulebook.health.evalNote")}</p>
        </Card>
      )}

      <Card className="overflow-hidden p-0">
        <CardHeader title={t("rulebook.health.tableTitle")} subtitle={t("rulebook.health.tableSub")} className="p-5 pb-3" />
        {!h ? (
          <Skeleton className="m-5 h-48" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{t("rulebook.health.col.rule")}</TH>
                <TH numeric>{t("rulebook.health.col.alerts")}</TH>
                <TH numeric>{t("rulebook.health.col.confirmed")}</TH>
                <TH numeric>{t("rulebook.health.col.precision")}</TH>
                <TH>{t("rulebook.health.col.verdict")}</TH>
              </TR>
            </THead>
            <TBody>
              {h.rows.map((r) => (
                <TR key={r.ruleId}>
                  <TD>
                    <p className="font-medium text-fg">{t(`typology.${r.typology}`, { defaultValue: humanizeCode(r.typology) })}</p>
                    <p className="text-small text-muted">{r.ruleName}</p>
                  </TD>
                  <TD numeric>{f.number(r.alerts30d)}</TD>
                  <TD numeric>{f.number(r.confirmed30d)}</TD>
                  <TD numeric>{r.alerts30d ? `${Math.round(r.precision * 100)}%` : "—"}</TD>
                  <TD className="max-w-md">
                    <Chip tone={VERDICT_TONE[r.verdict] ?? "neutral"}>{t(`rulebook.health.verdict.${r.verdict}`)}</Chip>
                    {r.fix && (
                      <p className="mt-1 text-small text-muted">
                        {f.text(r.fix)}{" "}
                        {r.verdict === "noisy" && (
                          <Link to={`/time-machine?rule=${encodeURIComponent(r.ruleId)}`} className="font-medium text-brand hover:underline">
                            {t("rulebook.health.tryIt")}
                          </Link>
                        )}
                      </p>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
