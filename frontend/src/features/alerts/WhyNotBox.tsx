import { useState } from "react";
import { ArrowRight, SearchCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Card, Chip, ErrorState, Input, Skeleton, type Tone } from "@/shared/ui";
import { ApiError, useWhyNot } from "@/services/api";

const RESULT_TONE: Record<string, Tone> = { near_miss: "warn", passed: "ok", not_applicable: "neutral" };

/** DESIGN_SPEC §3.2: "Why wasn't this flagged?" — which checks looked at a transaction, and why none fired. */
export function WhyNotBox({ onOpenAlert }: { onOpenAlert: (id: string) => void }) {
  const { t } = useTranslation();
  const [txn, setTxn] = useState("");
  const m = useWhyNot();
  const submitted = m.variables ?? "";

  return (
    <Card className="p-5">
      <form
        className="flex flex-wrap items-center gap-x-4 gap-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (txn.trim()) m.mutate(txn);
        }}
      >
        <div className="min-w-0 flex-1 basis-72">
          <h2 className="text-h2 font-semibold text-fg">{t("alerts.whyNot.title")}</h2>
          <p className="text-small text-muted">{t("alerts.whyNot.hint")}</p>
        </div>
        <Input
          value={txn}
          onChange={(e) => setTxn(e.target.value)}
          placeholder={t("alerts.whyNot.placeholder")}
          aria-label={t("alerts.whyNot.placeholder")}
          icon={<SearchCheck />}
          className="w-full sm:w-72"
          spellCheck={false}
        />
        <Button type="submit" variant="secondary" loading={m.isPending} disabled={!txn.trim()}>
          {t("alerts.whyNot.submit")}
        </Button>
      </form>

      {m.isPending && (
        <div className="mt-4 space-y-2" aria-busy>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      )}
      {m.isError &&
        (m.error instanceof ApiError && m.error.kind === "notFound" ? (
          <p role="status" className="mt-4 text-body text-muted">
            {t("alerts.whyNot.notFound", { id: submitted.trim().toUpperCase() })}
          </p>
        ) : (
          <ErrorState compact className="mt-4" onRetry={() => m.mutate(submitted)} />
        ))}
      {m.data && !m.isPending && (
        <div className="mt-4 space-y-4 border-t border-border pt-4" role="status">
          {m.data.flaggedAlertId ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-body font-medium text-fg">{t("alerts.whyNot.flagged")}</p>
              <Button size="sm" onClick={() => onOpenAlert(m.data.flaggedAlertId!)}>
                {t("alerts.whyNot.openCase")}
                <ArrowRight />
              </Button>
            </div>
          ) : (
            <p className="text-story text-fg">{m.data.explanation}</p>
          )}
          {m.data.rules.length > 0 && (
            <div>
              <p className="mb-2 label-caps text-muted">{t("alerts.whyNot.checks")}</p>
              <ul className="space-y-2">
                {m.data.rules.map((r) => (
                  <li key={r.id + r.name} className="flex flex-wrap items-start gap-x-3 gap-y-1">
                    <Chip tone={RESULT_TONE[r.result] ?? "neutral"}>{t(`alerts.whyNot.result.${r.result}`, { defaultValue: r.result })}</Chip>
                    <div className="min-w-0 flex-1">
                      <p className="text-body font-medium text-fg">{r.name}</p>
                      {r.reason && <p className="text-small text-muted">{r.reason}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {m.data.recommendation && <p className="rounded-xl bg-brand-soft/60 px-4 py-3 text-body text-fg">{m.data.recommendation}</p>}
        </div>
      )}
    </Card>
  );
}
