import { History } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, Chip, EmptyState, ErrorState, Skeleton } from "@/shared/ui";
import { useFormat } from "@/shared/lib/i18n";
import type { Rule } from "@/services/api";
import { useRuleVersions } from "@/services/api";
import { STATUS_TONE, ruleTitle } from "./labels";

export function VersionsTab({ rule }: { rule: Rule | null }) {
  const { t } = useTranslation();
  const f = useFormat();
  const q = useRuleVersions(rule?.id ?? null);
  if (!rule) return <EmptyState icon={History} tone="neutral" title={t("rulebook.review.pick")} compact />;
  return (
    <Card className="p-6">
      <h2 className="text-h2 font-semibold text-fg">{ruleTitle(rule, t)}</h2>
      <p className="mb-5 text-body text-muted">{t("rulebook.versions.sub")}</p>
      {q.isError ? (
        <ErrorState compact onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <Skeleton className="h-32" />
      ) : q.data.length === 0 ? (
        <EmptyState icon={History} tone="neutral" title={t("rulebook.versions.none")} compact />
      ) : (
        <ol className="relative space-y-6 border-l border-border pl-6">
          {[...q.data].reverse().map((v) => (
            <li key={`${v.version}-${v.createdAt}`} className="relative">
              <span className="absolute -left-[31px] top-0.5 inline-flex size-4 items-center justify-center rounded-full border-2 border-brand bg-surface" aria-hidden />
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-fg">{t("rulebook.versions.version", { n: v.version })}</span>
                <Chip tone={STATUS_TONE[v.status as keyof typeof STATUS_TONE] ?? "neutral"}>{t(`rulebook.status.${v.status}`, { defaultValue: v.status })}</Chip>
                <span className="text-small text-muted">{f.date(v.createdAt)}</span>
              </div>
              <p className="mt-1 text-body text-fg">{f.text(v.change)}</p>
              {v.approvedBy && <p className="text-small text-muted">{t("rulebook.review.approvedBy", { who: v.approvedBy })}</p>}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
