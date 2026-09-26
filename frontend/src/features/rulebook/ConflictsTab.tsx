import { CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Card, Chip, EmptyState, ErrorState, Skeleton, shortCircular } from "@/shared/ui";
import { cn } from "@/shared/lib/cn";
import { humanizeCode } from "@/shared/lib/format";
import type { Conflict, ConflictSide } from "@/services/api";
import { useConflicts } from "@/services/api";

function Side({ s, tone, onOpen }: { s: ConflictSide; tone: "danger" | "warn"; onOpen: (id: string) => void }) {
  const { t } = useTranslation();
  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border-l-4 p-4", tone === "danger" ? "border-danger bg-danger-soft/40" : "border-warn bg-warn-soft/40")}>
      {s.citation && <p className="label-caps text-muted">{t("citation.drawerTitle", { circular: shortCircular(s.citation.circularNo), para: s.citation.paraNo })}</p>}
      <p className="text-body text-fg">{s.clauseText || t("rulebook.review.noSource")}</p>
      <p className="text-small text-muted">
        <span className="font-semibold text-fg">{t("rulebook.conflicts.checks")}</span> {s.plain}
      </p>
      <Button variant="link" size="sm" className="self-start" onClick={() => onOpen(s.ruleId)}>
        {t("rulebook.conflicts.open")}
      </Button>
    </div>
  );
}

export function ConflictsTab({ onOpenRule }: { onOpenRule: (id: string) => void }) {
  const { t } = useTranslation();
  const q = useConflicts();
  if (q.isError && !q.data) return <ErrorState onRetry={() => void q.refetch()} />;
  if (!q.data) return <Skeleton className="h-64 rounded-card" />;
  if (q.data.length === 0) return <Card className="p-6"><EmptyState icon={CheckCircle2} tone="ok" title={t("rulebook.conflicts.none")} /></Card>;
  const sorted = [...q.data].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "contradiction" ? -1 : 1));
  return (
    <div className="space-y-4">
      {sorted.map((c: Conflict) => {
        const tone = c.kind === "contradiction" ? "danger" : "warn";
        return (
          <Card key={c.id} className="space-y-4 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone={tone}>{t(`rulebook.conflicts.kind.${c.kind}`)}</Chip>
              <span className="font-semibold text-fg">{t(`typology.${c.typology}`, { defaultValue: humanizeCode(c.typology) })}</span>
              {c.status !== "OPEN" && <Chip tone="neutral">{c.status}</Chip>}
            </div>
            <p className="text-body text-muted">{t(`rulebook.conflicts.explain.${c.kind}`)}</p>
            <div className="grid gap-4 lg:grid-cols-2">
              <Side s={c.a} tone={tone} onOpen={onOpenRule} />
              <Side s={c.b} tone={tone} onOpen={onOpenRule} />
            </div>
          </Card>
        );
      })}
    </div>
  );
}
