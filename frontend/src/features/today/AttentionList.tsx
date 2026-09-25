import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Button, Card, CardHeader, EmptyState, Skeleton, StatusPill } from "@/shared/ui";
import { useFormat } from "@/shared/lib/i18n";
import { fadeUpItem, listStagger } from "@/shared/lib/motion";
import type { AttentionItem, Home } from "@/services/api";
import { usePrefetchAlert } from "@/services/api";
import { useSession } from "@/features/session";

function useRow(item: AttentionItem) {
  const { t } = useTranslation();
  const f = useFormat();
  const { now } = useSession();
  const pattern = item.typology ? t(`typology.${item.typology}`) : "";
  const name = f.text(item.name);
  const whose = f.lang === "en" ? (name.endsWith("s") ? `${name}'` : `${name}'s`) : name;
  switch (item.kind) {
    case "report_overdue":
    case "report_due": {
      const info = item.dueAt ? f.deadline(item.dueAt, now) : null;
      return {
        pill: (
          <StatusPill
            status={item.status}
            size="sm"
            label={info ? t(info.msRemaining < 0 ? "deadline.overdueBy" : "deadline.dueIn", { span: info.span }) : undefined}
          />
        ),
        text: t(`today.attention.${item.kind}`, { whose, amount: item.amount != null ? f.money(item.amount) : "", pattern, span: info?.span ?? "" }),
        action: t("today.attention.action.open_case"),
        to: `/alerts?case=${encodeURIComponent(item.entityId)}`,
        alertId: item.entityId,
      };
    }
    case "ring_new":
      return {
        pill: <StatusPill status="attention" size="sm" label={t("today.attention.pill.ring_new")} />,
        text: t("today.attention.ring_new", { name, count: item.count ?? 0, amount: item.amount != null ? f.money(item.amount) : "" }),
        action: t("today.attention.action.see_ring"),
        to: `/rings?ring=${encodeURIComponent(item.entityId)}`,
      };
    case "rule_pending":
      return {
        pill: <StatusPill status="attention" size="sm" label={t("today.attention.pill.rule_pending")} />,
        text: t("today.attention.rule_pending", { count: item.count ?? 0 }),
        action: t("today.attention.action.review_rules"),
        to: "/rulebook",
      };
    case "conflict_open":
    default:
      return {
        pill: <StatusPill status="attention" size="sm" label={t("today.attention.pill.conflict_open")} />,
        text: t("today.attention.conflict_open", { count: item.count ?? 0 }),
        action: t("today.attention.action.see_conflicts"),
        to: "/rulebook?tab=conflicts",
      };
  }
}

function Row({ item }: { item: AttentionItem }) {
  const r = useRow(item);
  const prefetch = usePrefetchAlert();
  return (
    <motion.li variants={fadeUpItem} className="flex items-center gap-4 py-3.5 first:pt-0 last:pb-0">
      <div className="w-44 shrink-0">{r.pill}</div>
      <p className="min-w-0 flex-1 text-body text-fg">{r.text}</p>
      <Button asChild variant="secondary" size="sm" className="shrink-0">
        <Link to={r.to} onMouseEnter={() => r.alertId && prefetch(r.alertId)} onFocus={() => r.alertId && prefetch(r.alertId)}>
          {r.action}
          <ArrowRight />
        </Link>
      </Button>
    </motion.li>
  );
}

export function AttentionList({ home }: { home: Home | undefined }) {
  const { t } = useTranslation();
  const items = home?.attention ?? [];
  return (
    <Card className="p-6" data-tour="attention">
      <CardHeader
        title={t("today.attention.title")}
        subtitle={home ? (items.length ? t("today.attention.subtitle", { count: items.length }) : undefined) : <Skeleton className="mt-1 h-4 w-48" />}
        className="mb-4"
      />
      {!home ? (
        <div className="space-y-4" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-6 w-36 rounded-full" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-8 w-28 rounded-control" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={CheckCircle2} tone="ok" title={t("today.attention.empty")} compact />
      ) : (
        <motion.ul variants={listStagger} initial="initial" animate="animate" className="divide-y divide-border">
          {items.map((i) => (
            <Row key={i.id} item={i} />
          ))}
        </motion.ul>
      )}
    </Card>
  );
}
