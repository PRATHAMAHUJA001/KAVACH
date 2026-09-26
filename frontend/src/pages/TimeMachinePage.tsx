import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, History, Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Card,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
  Skeleton,
  Slider,
} from "@/shared/ui";
import { humanizeCode } from "@/shared/lib/format";
import { useFormat } from "@/shared/lib/i18n";
import { useReplay, useTunables } from "@/services/api";
import { ReplayResult, formatParam } from "@/features/time-machine";

const DAYS = 90;

/** DESIGN_SPEC §3.6 — "What if we changed the rule?" */
export default function TimeMachinePage() {
  const { t } = useTranslation();
  const f = useFormat();
  const [sp, setSp] = useSearchParams();
  const tunables = useTunables();
  const replay = useReplay();
  const asked = sp.get("rule");
  const rule = useMemo(() => tunables.data?.find((r) => r.ruleId === asked) ?? tunables.data?.[0] ?? null, [tunables.data, asked]);
  const [value, setValue] = useState<number | null>(null);
  useEffect(() => {
    setValue(rule?.param.value ?? null);
    replay.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rule?.ruleId]);

  if (tunables.isError && !tunables.data) return <ErrorState onRetry={() => void tunables.refetch()} retrying={tunables.isFetching} />;
  if (tunables.data && tunables.data.length === 0) return <Card className="p-6"><EmptyState icon={History} tone="neutral" title={t("tm.none")} /></Card>;

  const label = (r: NonNullable<typeof rule>) => `${t(`typology.${r.typology}`, { defaultValue: humanizeCode(r.typology) })} · ${r.ruleName}`;
  const notTunable = asked && tunables.data && !tunables.data.some((r) => r.ruleId === asked);
  const p = rule?.param;
  const v = value ?? p?.value ?? 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Card className="space-y-6 p-6" data-tour="tm-slider">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-body font-medium text-muted">{t("tm.pick")}</span>
          {rule ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" className="max-w-full">
                  <span className="truncate">{label(rule)}</span>
                  <ChevronDown className="text-muted" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-96 w-[28rem] max-w-[90vw] overflow-y-auto">
                <DropdownMenuRadioGroup value={rule.ruleId} onValueChange={(id) => setSp({ rule: id }, { replace: true })}>
                  {tunables.data!.map((r) => (
                    <DropdownMenuRadioItem key={r.ruleId} value={r.ruleId}>
                      {label(r)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Skeleton className="h-10 w-80" />
          )}
        </div>
        {notTunable && <p className="rounded-xl bg-warn-soft px-4 py-3 text-body text-fg">{t("tm.notTunable")}</p>}
        {rule && p ? (
          <>
            <div>
              <p className="text-body text-muted">{f.text(p.label)}</p>
              <p className="font-display text-display font-semibold text-fg tnum" aria-live="polite">
                {formatParam(p, v, f)}
              </p>
            </div>
            <div className="px-1 pb-6">
              <Slider
                min={p.min}
                max={p.max}
                step={p.step}
                value={[v]}
                onValueChange={([x]) => setValue(x ?? p.value)}
                marker={p.value}
                markerLabel={t("tm.current", { value: formatParam(p, p.value, f) })}
                thumbLabel={f.text(p.label)}
              />
              <div className="mt-8 flex justify-between text-small text-muted tnum">
                <span>{formatParam(p, p.min, f)}</span>
                <span>{formatParam(p, p.max, f)}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={() => replay.mutate({ ruleId: rule.ruleId, value: v, days: DAYS })} loading={replay.isPending}>
                {!replay.isPending && <Play />}
                {t("tm.replay", { days: DAYS })}
              </Button>
              {v !== p.value && (
                <Button variant="ghost" onClick={() => setValue(p.value)}>
                  {t("tm.reset")}
                </Button>
              )}
              {replay.isPending && <span className="text-body text-muted">{t("tm.running", { days: DAYS })}</span>}
            </div>
          </>
        ) : (
          !tunables.data && <Skeleton className="h-40" />
        )}
      </Card>
      {replay.isError && <ErrorState compact message={t("tm.failed")} onRetry={() => rule && replay.mutate({ ruleId: rule.ruleId, value: v, days: DAYS })} />}
      {replay.data && p && replay.data.ruleId === rule?.ruleId && <ReplayResult replay={replay.data} param={p} />}
    </div>
  );
}
