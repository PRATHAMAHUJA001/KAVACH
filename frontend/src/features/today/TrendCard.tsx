import { useTranslation } from "react-i18next";
import { Card, CardHeader, SERIES, Skeleton, TrendChart } from "@/shared/ui";
import type { Home } from "@/services/api";

export function TrendCard({ home }: { home: Home | undefined }) {
  const { t } = useTranslation();
  if (!home) {
    return (
      <Card className="p-6">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="mt-2 h-4 w-80" />
        <Skeleton className="mt-6 h-[240px] w-full rounded-xl" />
      </Card>
    );
  }
  const hasFraud = home.trend.some((p) => p.fraud != null);
  const data = home.trend.map((p) => ({ date: p.date, alerts: p.alerts, fraud: p.fraud ?? 0 }));
  const sum = (a: typeof data) => a.reduce((s, p) => s + p.alerts, 0);
  const last = sum(data.slice(-7));
  const prev = sum(data.slice(-14, -7));
  const fraud = data.slice(-7).reduce((s, p) => s + p.fraud, 0);
  const pct = prev ? Math.round(((last - prev) / prev) * 100) : 0;
  const insight = !prev || Math.abs(pct) < 3 ? t("today.trend.insightFlat", { fraud }) : pct > 0 ? t("today.trend.insightUp", { pct, fraud }) : t("today.trend.insightDown", { pct: Math.abs(pct), fraud });
  return (
    <Card className="p-6">
      <CardHeader title={t("today.trend.title")} subtitle={`${t("today.trend.subtitle")} · ${insight}`} className="mb-4" />
      <TrendChart
        data={data}
        xKey="date"
        height={240}
        caption={t("today.trend.caption")}
        series={[
          { key: "alerts", label: t("today.trend.alerts"), color: SERIES.alerts },
          ...(hasFraud ? [{ key: "fraud" as const, label: t("today.trend.fraud"), color: SERIES.fraud }] : []),
        ]}
      />
    </Card>
  );
}
