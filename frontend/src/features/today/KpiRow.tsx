import { BellRing, FileClock, IndianRupee, Network } from "lucide-react";
import { useTranslation } from "react-i18next";
import { KpiTile, KpiTileSkeleton } from "@/shared/ui";
import { useFormat } from "@/shared/lib/i18n";
import type { Home } from "@/services/api";

function delta(now: number, prev: number): number | null {
  if (!prev) return null;
  const d = ((now - prev) / prev) * 100;
  return Math.abs(d) < 0.5 ? 0 : d;
}

export function KpiRow({ home }: { home: Home | undefined }) {
  const { t } = useTranslation();
  const f = useFormat();
  if (!home) {
    return (
      <div className="grid grid-cols-2 gap-6 2xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <KpiTileSkeleton key={i} />
        ))}
      </div>
    );
  }
  const k = home.kpis;
  if (!k) return null;
  const dNew = delta(k.newAlerts, k.newAlertsPrev);
  const dMoney = delta(k.moneyAtRisk, k.moneyAtRiskPrev);
  const dRings = delta(k.activeRings, k.activeRingsPrev);
  return (
    <div className="grid h-full auto-rows-fr grid-cols-2 gap-6 2xl:grid-cols-4" data-tour="kpis">
      <KpiTile
        label={t("today.kpi.newAlerts")}
        value={k.newAlerts}
        icon={<BellRing />}
        sentence={k.seriousNewAlerts > 0 ? t("today.kpi.newAlertsSentence", { count: k.seriousNewAlerts }) : t("today.kpi.newAlertsNone")}
        trend={dNew == null ? undefined : { deltaPct: dNew, meaning: dNew > 0 ? "bad" : dNew < 0 ? "good" : "neutral" }}
        to="/alerts?view=new"
      />
      <KpiTile
        label={t("today.kpi.moneyAtRisk")}
        value={k.moneyAtRisk}
        format="money"
        icon={<IndianRupee />}
        tone="danger"
        sentence={t("today.kpi.moneyAtRiskSentence")}
        trend={dMoney == null ? undefined : { deltaPct: dMoney, meaning: dMoney > 0 ? "bad" : dMoney < 0 ? "good" : "neutral" }}
        to="/alerts?sort=amount"
      />
      <KpiTile
        label={t("today.kpi.due")}
        value={k.reportsDue48h}
        icon={<FileClock />}
        tone="warn"
        sentence={
          k.reportsOverdue > 0
            ? t("today.kpi.dueOverdue", { count: k.reportsOverdue })
            : k.reportsDue48h > 0
              ? t("today.kpi.dueSentence", { count: k.reportsDue48h })
              : t("today.kpi.dueNone")
        }
        to="/alerts?view=due"
      />
      <KpiTile
        label={t("today.kpi.rings")}
        value={k.activeRings}
        icon={<Network />}
        tone="info"
        sentence={t("today.kpi.ringsSentence", { amount: f.money(k.ringVolume30d) })}
        trend={dRings == null ? undefined : { deltaPct: dRings, meaning: dRings > 0 ? "bad" : dRings < 0 ? "good" : "neutral" }}
        to="/rings"
      />
    </div>
  );
}
