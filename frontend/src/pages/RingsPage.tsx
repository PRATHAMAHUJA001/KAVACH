import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Network } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardHeader, EmptyState, ErrorState, Money, Segmented, Skeleton } from "@/shared/ui";
import { useFormat } from "@/shared/lib/i18n";
import { useRing, useRings } from "@/services/api";
import { RingCards, RingGraph, RingTables, speedText, type LinkFilter } from "@/features/rings";

/** DESIGN_SPEC §3.4 — "Who is working together?" */
export default function RingsPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const [sp, setSp] = useSearchParams();
  const rings = useRings();
  const selected = sp.get("ring") ?? rings.data?.[0]?.id ?? null;
  const detail = useRing(selected);
  const [show, setShow] = useState<LinkFilter>("money");
  const select = (id: string) => setSp((p) => { const n = new URLSearchParams(p); n.set("ring", id); return n; }, { replace: true });
  useEffect(() => {
    if (!sp.get("ring") && rings.data?.[0]) select(rings.data[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rings.data]);

  if (rings.isError && !rings.data) return <ErrorState onRetry={() => void rings.refetch()} retrying={rings.isFetching} />;
  if (rings.data && rings.data.length === 0)
    return (
      <Card className="p-6">
        <EmptyState icon={Network} tone="ok" title={t("rings.empty")} />
      </Card>
    );

  const ring = detail.data?.ring ?? rings.data?.find((r) => r.id === selected);
  // A round-trip loop has no collector and no exit, so name the accounts in the order
  // the money travels instead of leaving the reader to guess a hierarchy that isn't there.
  const nameOf = new Map((detail.data?.graph.nodes ?? []).map((n) => [n.id, f.text(n.label)]));
  const loopPath =
    ring?.kind === "round_trip" && ring.loopPath?.length ? ring.loopPath.map((id) => nameOf.get(id) ?? id).join(" → ") : null;
  return (
    <div className="space-y-6">
      <RingCards rings={rings.data} selected={selected} onSelect={select} />
      <Card className="p-5" data-tour="ring-graph">
        <CardHeader
          title={ring ? f.text(ring.name) : <Skeleton className="h-6 w-32" />}
          subtitle={
            ring ? (
              <>
                {t(`rings.kindHint.${ring.kind}`)} · {t("rings.summary", { count: ring.memberCount })}{" "}
                <Money amount={ring.volume} focusable={false} className="font-medium text-fg" />
                {ring.speedHours != null && <> · {speedText(ring.speedHours, t)}</>}
              </>
            ) : undefined
          }
          className="mb-4"
          action={
            <Segmented<LinkFilter>
              size="sm"
              label={t("rings.show.label")}
              value={show}
              onChange={setShow}
              options={[
                { value: "money", label: t("rings.show.money") },
                { value: "shared", label: t("rings.show.shared") },
                { value: "both", label: t("rings.show.both") },
              ]}
            />
          }
        />
        {detail.isError && !detail.data ? (
          <ErrorState compact onRetry={() => void detail.refetch()} retrying={detail.isFetching} />
        ) : detail.data && detail.data.ring.id === selected ? (
          <RingGraph key={selected} graph={detail.data.graph} show={show} />
        ) : (
          <Skeleton className="h-[520px] rounded-xl" />
        )}
        {loopPath && (
          <p className="mt-3 text-small text-fg">
            <span className="font-medium">{t("rings.loopPathLabel")}:</span> {loopPath}
          </p>
        )}
        <p className="mt-3 text-small text-muted">{t("rings.graphHint")}</p>
      </Card>
      {detail.data && detail.data.ring.id === selected && <RingTables detail={detail.data} />}
    </div>
  );
}
