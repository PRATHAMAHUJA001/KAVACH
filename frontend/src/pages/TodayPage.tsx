import { useTranslation } from "react-i18next";
import { ErrorState } from "@/shared/ui";
import { useFormat } from "@/shared/lib/i18n";
import { useHome } from "@/services/api";
import { useSession } from "@/features/session";
import { AttentionList, BriefCard, KpiRow, ReadinessCard, TrendCard } from "@/features/today";

function greetingKey(d: Date) {
  const h = d.getHours();
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}

/** DESIGN_SPEC §3.1 — "Is the bank safe today, and what do I do first?" */
export default function TodayPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const { now } = useSession();
  const home = useHome();

  if (home.isError && !home.data)
    return <ErrorState onRetry={() => void home.refetch()} retrying={home.isFetching} />;

  const data = home.data;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-display text-h1 font-semibold text-fg">
            {t(`today.greeting.${greetingKey(new Date())}`)} <span className="text-muted">{t("today.picture")}</span>
          </p>
          <p className="mt-0.5 text-body text-muted">{f.date(now)}</p>
        </div>
        <div id="today-actions" />
      </div>

      {/* Below 1536px the KPIs sit 2×2 beside the gauge and the attention list goes full
          width; from 1536px it's the spec layout with the gauge spanning both rows. */}
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-4 2xl:col-span-3 2xl:row-span-2">
          <ReadinessCard home={data} />
        </div>
        <div className="col-span-12 lg:col-span-8 2xl:col-span-9">
          <KpiRow home={data} />
        </div>
        <div className="col-span-12 2xl:col-span-9">
          <AttentionList home={data} />
        </div>
        <div className="col-span-12 xl:col-span-7 2xl:col-span-8">
          <TrendCard home={data} />
        </div>
        <div className="col-span-12 xl:col-span-5 2xl:col-span-4">
          <BriefCard home={data} />
        </div>
      </div>
    </div>
  );
}
