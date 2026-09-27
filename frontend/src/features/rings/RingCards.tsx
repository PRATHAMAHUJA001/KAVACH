import { RotateCcw, Timer, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Chip, Money, Skeleton, type Tone } from "@/shared/ui";
import { cn } from "@/shared/lib/cn";
import { useFormat } from "@/shared/lib/i18n";
import type { Ring } from "@/services/api";

const CONF_TONE: Record<string, Tone> = { HIGH: "danger", MEDIUM: "warn", LOW: "neutral" };

export function speedText(hours: number, t: (k: string, o?: Record<string, unknown>) => string) {
  return hours < 1 ? t("rings.speedMinutes", { count: Math.max(1, Math.round(hours * 60)) }) : t("rings.speedHours", { count: Math.round(hours) });
}

export function RingCards({ rings, selected, onSelect }: { rings: Ring[] | undefined; selected: string | null; onSelect: (id: string) => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  if (!rings)
    return (
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4" aria-busy>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-36 rounded-card" />
        ))}
      </div>
    );
  return (
    <div role="listbox" aria-label={t("rings.listLabel")} className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      {rings.map((r) => {
        const active = r.id === selected;
        return (
          <button
            key={r.id}
            type="button"
            role="option"
            aria-selected={active}
            onClick={() => onSelect(r.id)}
            className={cn(
              "flex flex-col gap-3 rounded-card border bg-surface p-4 text-left shadow-sm transition-[border-color,box-shadow]",
              active ? "border-brand ring-4 ring-brand/15" : "border-border hover:border-border-strong",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-small font-medium uppercase tracking-wide text-muted">{t(`rings.kind.${r.kind}`)}</p>
                <p className="truncate font-semibold text-fg">{f.text(r.name)}</p>
                {r.city && <p className="truncate text-small text-muted">{f.text(r.city)}</p>}
              </div>
              {r.confidence && <Chip tone={CONF_TONE[r.confidence] ?? "neutral"}>{t(`rings.confidence.${r.confidence}`)}</Chip>}
            </div>
            <Money amount={r.volume} focusable={false} className="font-display text-h1 font-semibold text-fg" />
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-small text-muted">
              <span className="inline-flex items-center gap-1">
                <Users className="size-3.5" aria-hidden />
                {t("rings.members", { count: r.memberCount })}
              </span>
              {r.kind === "round_trip" && r.hops != null && (
                <span className="inline-flex items-center gap-1">
                  <RotateCcw className="size-3.5" aria-hidden />
                  {t("rings.loopSummary", { count: r.hops })}
                </span>
              )}
              {r.speedHours != null && (
                <span className="inline-flex items-center gap-1">
                  <Timer className="size-3.5" aria-hidden />
                  {speedText(r.speedHours, t)}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
