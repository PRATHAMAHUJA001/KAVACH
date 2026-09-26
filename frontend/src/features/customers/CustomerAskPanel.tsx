import { useEffect, useRef, useState } from "react";
import { ArrowUp, MessagesSquare, RotateCcw, Square, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Textarea } from "@/shared/ui";
import { AnswerCard, useAskSession } from "@/features/ask";

/**
 * Support-console style chat pinned to the right of the customer file.
 *
 * It is the existing Ask plumbing, not a second one: `useAskSession` owns the SSE
 * stream (`api.askStream`) and `AnswerCard` renders every answer, its progress
 * steps, citations, result table and vote buttons. The only thing this adds is a
 * scope key, so the customer's thread is separate from the full-page chat.
 */
export function CustomerAskPanel({
  customerId,
  seedQuestion,
  onClose,
}: {
  customerId: string;
  /** Asked automatically the first time the panel opens for this customer. */
  seedQuestion: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { turns, busy, ask, stop, vote, clear } = useAskSession(`customer:${customerId}`);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const seeded = useRef<string | null>(null);

  // Seed once, and only into an empty thread: the thread outlives this component
  // (it lives in the ask store), so reopening the panel resumes rather than re-asks.
  useEffect(() => {
    if (seeded.current === customerId) return;
    seeded.current = customerId;
    if (turns.length === 0) ask(seedQuestion);
  }, [customerId, seedQuestion, turns.length, ask]);

  const last = turns[turns.length - 1];
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [turns.length, last?.state, last?.text]);

  const submit = (q: string) => {
    if (!q.trim() || busy) return;
    ask(q);
    setDraft("");
  };

  return (
    // min-h-0 on the column and the scroller, or the transcript pushes the drawer taller
    // than the viewport instead of scrolling inside it.
    <aside
      aria-label={t("customers.ask.title")}
      className="flex min-h-0 w-full shrink-0 flex-col border-border bg-surface-2/40 lg:w-[380px] lg:border-l"
    >
      <header className="flex items-center gap-2 border-b border-border bg-surface/95 px-4 py-3 backdrop-blur">
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand" aria-hidden>
          <MessagesSquare className="size-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-semibold text-fg">{t("customers.ask.title")}</p>
          <p className="truncate text-small text-muted">{t("customers.ask.scoped", { id: customerId })}</p>
        </div>
        <Button variant="ghost" size="icon" className="size-8" onClick={clear} disabled={busy} aria-label={t("customers.ask.reset")}>
          <RotateCcw />
        </Button>
        <Button variant="ghost" size="icon" className="size-8" onClick={onClose} aria-label={t("customers.ask.close")}>
          <X />
        </Button>
      </header>

      <div className="scrollbar-thin min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4">
        {turns.length === 0 ? (
          <p className="text-body text-muted">{t("customers.ask.empty")}</p>
        ) : (
          turns.map((turn) => <AnswerCard key={turn.id} turn={turn} onVote={(v) => vote(turn.id, v)} onRetry={() => ask(turn.question)} />)
        )}
        <div ref={endRef} />
      </div>

      <form
        className="flex items-end gap-2 border-t border-border bg-surface px-3 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit(draft);
        }}
      >
        <Textarea
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit(draft);
            }
          }}
          placeholder={t("customers.ask.placeholder")}
          aria-label={t("customers.ask.placeholder")}
          className="max-h-32 min-h-10 text-small"
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
      <p className="px-4 pb-3 text-center text-small text-muted">{t("ask.disclaimer")}</p>
    </aside>
  );
}
