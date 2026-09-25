import { CalendarX2, FileClock, GitCompareArrows, ScrollText, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, ExplainPopover, ReadinessGauge, ReadinessGaugeSkeleton } from "@/shared/ui";
import { useFormat } from "@/shared/lib/i18n";
import type { Home } from "@/services/api";

const FACTOR_ICON: Record<string, LucideIcon> = { overdue: CalendarX2, due_soon: FileClock, rules_pending: ScrollText, conflicts: GitCompareArrows };

export function ReadinessCard({ home }: { home: Home | undefined }) {
  const { t } = useTranslation();
  const f = useFormat();
  const factors = home?.readiness.factors ?? [];
  return (
    <Card className="flex h-full flex-col p-6" data-tour="readiness">
      <div className="flex items-center gap-1">
        <h2 className="text-h2 font-semibold">{t("today.readiness.title")}</h2>
        <ExplainPopover term={t("today.readiness.title")}>{t("readiness.explain")}</ExplainPopover>
      </div>
      <p className="text-body text-muted">{t("today.readiness.sub")}</p>
      <div className="flex justify-center pt-5">
        {home ? <ReadinessGauge value={home.readiness.score} reason={f.text(home.readiness.reason)} size={220} /> : <ReadinessGaugeSkeleton size={220} />}
      </div>
      {factors.length > 0 && (
        <div className="mt-auto pt-5">
          <p className="mb-2 label-caps text-muted">{t("today.readiness.pulling")}</p>
          <ul className="space-y-2">
            {factors.map((x) => {
              const Icon = FACTOR_ICON[x.key] ?? FileClock;
              return (
                <li key={x.key} className="flex items-center gap-2.5 text-body">
                  <Icon className="size-4 shrink-0 text-muted" strokeWidth={1.75} aria-hidden />
                  <span className="flex-1 text-fg">{t(`today.readiness.factor.${x.key}`, { count: x.count })}</span>
                  <span className="shrink-0 text-small font-semibold text-danger tnum">{t("today.readiness.factor.points", { points: f.number(x.points, 1) })}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}
