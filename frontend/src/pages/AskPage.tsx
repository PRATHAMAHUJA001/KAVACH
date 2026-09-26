import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowUp, MessagesSquare, RotateCcw, Square } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Textarea } from "@/shared/ui";
import { AnswerCard, useAskSession } from "@/features/ask";

const SUGGESTIONS = ["branches", "circular", "topRisk", "due", "explain", "whatIf"] as const;

/** DESIGN_SPEC §3.3 — "Ask anything in plain English." */
export default function AskPage() {
  const { t } = useTranslation();
  const { turns, busy, ask, stop, vote, clear } = useAskSession();
  const [draft, setDraft] = useState("");
  const [sp, setSp] = useSearchParams();
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // `/ask?q=…` (from search or another screen) asks straight away, once.
  useEffect(() => {
    const q = sp.get("q");
    if (q) {
      ask(q);
      setSp((p) => {
        const n = new URLSearchParams(p);
        n.delete("q");
        return n;
      }, { replace: true });
    }
  }, [sp, setSp, ask]);

  const last = turns[turns.length - 1];
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [turns.length, last?.state]);

  const submit = (q: string) => {
    if (!q.trim() || busy) return;
    ask(q);
    setDraft("");
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-10rem)] w-full max-w-[760px] flex-col">
      {turns.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
          <span className="inline-flex size-16 items-center justify-center rounded-full bg-brand-soft text-brand" aria-hidden>
            <MessagesSquare className="size-8" strokeWidth={1.5} />
          </span>
          <h2 className="mt-5 font-display text-display font-semibold text-fg">{t("ask.emptyTitle")}</h2>
          <p className="mt-2 text-story text-muted">{t("ask.emptySub")}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-2" data-tour="ask-suggestions">
            {SUGGESTIONS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => submit(t(`ask.suggest.${k}`))}
                className="rounded-full border border-border bg-surface px-4 py-2 text-body text-fg shadow-sm transition-colors hover:border-brand/40 hover:bg-brand-soft/50"
              >
                {t(`ask.suggest.${k}`)}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 space-y-8 pb-6">
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={clear} disabled={busy}>
              <RotateCcw />
              {t("ask.newChat")}
            </Button>
          </div>
          {turns.map((turn) => (
            <AnswerCard key={turn.id} turn={turn} onVote={(v) => vote(turn.id, v)} onRetry={() => ask(turn.question)} />
          ))}
          <div ref={endRef} />
        </div>
      )}

      <form
        className="sticky bottom-4 mt-4 flex items-end gap-2 rounded-card border border-border bg-surface p-2 shadow-overlay"
        onSubmit={(e) => {
          e.preventDefault();
          submit(draft);
        }}
      >
        <Textarea
          ref={inputRef}
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit(draft);
            }
          }}
          placeholder={t("ask.placeholder")}
          aria-label={t("ask.placeholder")}
          className="max-h-40 min-h-10 border-0 bg-transparent focus:ring-0"
        />
        {busy ? (
          <Button type="button" variant="secondary" size="icon" onClick={stop} aria-label={t("ask.stop")}>
            <Square />
          </Button>
        ) : (
          <Button type="submit" size="icon" disabled={!draft.trim()} aria-label={t("ask.send")}>
            <ArrowUp />
          </Button>
        )}
      </form>
      <p className="mt-2 text-center text-small text-muted">{t("ask.disclaimer")}</p>
    </div>
  );
}
