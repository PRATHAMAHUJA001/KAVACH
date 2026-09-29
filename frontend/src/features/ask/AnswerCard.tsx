import { useState } from "react";
import { Brain, Check, Code2, Loader2, Sheet as SheetIcon, ThumbsDown, ThumbsUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Card, CitationChip, CitationDrawer, ErrorState, Expander, RichText, Skeleton, TrustBadge, type CitationRef } from "@/shared/ui";
import { cn } from "@/shared/lib/cn";
import { useFormat } from "@/shared/lib/i18n";
import { useParagraph } from "@/services/api";
import { ResultData } from "./ResultData";
import type { Turn } from "./useAskSession";

const STEP_OF: Record<string, string> = {
  cortex_analyst_text_to_sql: "data",
  system_execute_sql: "data",
  cortex_search: "circulars",
  generic: "check",
};

function Progress({ turn }: { turn: Turn }) {
  const { t } = useTranslation();
  const steps = [...new Set(turn.tools.map((x) => STEP_OF[x] ?? "check"))];
  return (
    <div className="space-y-2" role="status" aria-live="polite">
      {steps.map((s, i) => (
        <p key={s} className="flex items-center gap-2 text-small text-muted">
          {i < steps.length - 1 || turn.text ? <Check className="size-4 text-ok" /> : <Loader2 className="size-4 animate-spin" />}
          {t(`ask.step.${s}`)}
        </p>
      ))}
      {!turn.text && (
        <p className="flex items-center gap-2 text-small text-muted">
          <Loader2 className="size-4 animate-spin" />
          {steps.length ? t("ask.step.writing") : t("ask.step.thinking")}
        </p>
      )}
    </div>
  );
}

export function AnswerCard({ turn, onVote, onRetry }: { turn: Turn; onVote: (v: "up" | "down") => void; onRetry: () => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const [cite, setCite] = useState<CitationRef | null>(null);
  const para = useParagraph(cite?.circularNo ?? null, cite ? String(cite.paraNo) : null);
  const a = turn.answer;
  const cites = a ? [...new Map(a.citations.filter((c) => c.circularNo && c.paraNo).map((c) => [`${c.circularNo}-${c.paraNo}`, c])).values()] : [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-body text-brand-fg">{turn.question}</p>
      </div>
      <Card className="space-y-4 p-6">
        {turn.state === "error" ? (
          <ErrorState compact message={t(turn.error === "stopped" ? "ask.stopped" : "ask.failed")} onRetry={onRetry} />
        ) : (
          <>
            {turn.state === "streaming" && <Progress turn={turn} />}
            {turn.text ? (
              <RichText text={turn.text} className={cn("text-story text-fg", turn.state === "streaming" && "after:ml-0.5 after:animate-pulse after:content-['▍']")} />
            ) : turn.state === "streaming" ? (
              <div className="space-y-2" aria-hidden>
                <Skeleton className="h-5 w-11/12" />
                <Skeleton className="h-5 w-3/4" />
              </div>
            ) : null}
            {a && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <TrustBadge kind={a.verified ? "verified" : "ai"} />
                  {cites.map((c) => (
                    <CitationChip key={`${c.circularNo}-${c.paraNo}`} circularNo={c.circularNo!} paraNo={c.paraNo!} onOpen={() => setCite({ circularNo: c.circularNo!, paraNo: c.paraNo! })} />
                  ))}
                </div>
                {a.warnings.filter(Boolean).length > 0 && <p className="text-small text-warn">{a.warnings.filter(Boolean).join(" ")}</p>}
                {a.reasoning && (
                  <Expander icon={<Brain />} title={t("ask.showReasoning")}>
                    <RichText text={a.reasoning} className="text-small text-muted" />
                  </Expander>
                )}
                {a.resultSet && a.resultSet.rows.length > 0 && (
                  <Expander icon={<SheetIcon />} title={t("ask.showData")} meta={t("ask.rows", { count: a.resultSet.rows.length })}>
                    <ResultData rs={a.resultSet} />
                  </Expander>
                )}
                {a.sql && (
                  <Expander className="tech-only" icon={<Code2 />} title={t("ask.showSql")}>
                    <pre className="scrollbar-thin overflow-x-auto whitespace-pre font-mono text-[0.8125rem] leading-relaxed text-fg">{a.sql}</pre>
                  </Expander>
                )}
                <div className="flex items-center gap-1 pt-1">
                  <span className="mr-2 text-small text-muted">{turn.vote ? t("ask.thanks") : t("ask.helpful")}</span>
                  <Button variant="ghost" size="icon" className={cn("size-8", turn.vote === "up" && "bg-ok-soft text-ok")} aria-pressed={turn.vote === "up"} aria-label={t("ask.voteUp")} onClick={() => onVote("up")}>
                    <ThumbsUp />
                  </Button>
                  <Button variant="ghost" size="icon" className={cn("size-8", turn.vote === "down" && "bg-danger-soft text-danger")} aria-pressed={turn.vote === "down"} aria-label={t("ask.voteDown")} onClick={() => onVote("down")}>
                    <ThumbsDown />
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </Card>
      <CitationDrawer
        open={!!cite}
        onOpenChange={(o) => !o && setCite(null)}
        citation={cite}
        loading={para.isLoading}
        error={para.isError ? <ErrorState compact onRetry={() => void para.refetch()} /> : undefined}
        paragraph={
          para.data
            ? { circularNo: para.data.circularNo, paraNo: para.data.paraNo, text: para.data.text, issueDate: para.data.issueDate ? f.date(para.data.issueDate) : undefined, before: para.data.before ?? undefined, after: para.data.after ?? undefined }
            : null
        }
      />
    </div>
  );
}
