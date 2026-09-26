import { useTranslation } from "react-i18next";
import { Card } from "@/shared/ui";
import { useAlerts, useHome } from "@/services/api";
import { AlertFilters, AlertList, CaseFile, WhyNotBox, useAlertParams } from "@/features/alerts";

/** DESIGN_SPEC §3.2 — "Why is this suspicious, and can I prove it?" */
export default function AlertsPage() {
  const { t } = useTranslation();
  const home = useHome();
  const kpis = home.data?.kpis;
  const p = useAlertParams(kpis?.reportsOverdue ?? 0);
  const alerts = useAlerts(p.params);
  const filtered = p.view !== "open" || !!p.typology || !!p.q;

  return (
    <div className="space-y-6">
      <WhyNotBox onOpenAlert={p.openCase} />
      <Card className="overflow-hidden p-0" data-tour="alert-list">
        <div className="space-y-3 border-b border-border p-5">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-h2 font-semibold text-fg">{t("page.alerts.title")}</h2>
            {alerts.data && <p className="text-small text-muted tnum">{t("alerts.count", { count: alerts.data.total })}</p>}
          </div>
          <AlertFilters
            view={p.view}
            sort={p.sort}
            typology={p.typology}
            q={p.q}
            counts={{ overdue: kpis?.reportsOverdue, due48h: kpis?.reportsDue48h }}
            onChange={p.update}
          />
        </div>
        <AlertList
          data={alerts.data}
          isLoading={alerts.isLoading}
          isError={alerts.isError}
          isFetching={alerts.isFetching}
          onRetry={() => void alerts.refetch()}
          onOpen={p.openCase}
          onPage={(page) => p.update({ page: String(page) })}
          onClearFilters={filtered ? () => p.update({ view: null, typology: null, q: null, sort: null }) : undefined}
        />
      </Card>
      <CaseFile alertId={p.caseId} onClose={p.closeCase} />
    </div>
  );
}
