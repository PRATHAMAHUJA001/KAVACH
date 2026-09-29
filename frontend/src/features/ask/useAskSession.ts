import { useCallback, useSyncExternalStore } from "react";
import { api, ApiError } from "@/services/api";
import type { AskAnswer } from "@/services/api";

export interface Turn {
  id: string;
  question: string;
  state: "streaming" | "done" | "error";
  /** Latest progress line from the agent ("Querying the data"). */
  status: string;
  /** Tool types used so far, for the progress steps. */
  tools: string[];
  text: string;
  answer: AskAnswer | null;
  error: string | null;
  vote: "up" | "down" | null;
}

/**
 * Module-level so the conversation survives leaving the page and coming back.
 * Keyed by scope: the Ask page is one conversation ("main"), and a chat pinned to
 * a customer is its own, so opening a customer doesn't push a question into the
 * history of the full-page chat. Same store, same streaming path either way.
 */
const MAIN = "main";
const threads = new Map<string, Turn[]>();
const listeners = new Set<() => void>();
/** Live streams, so stopping one conversation never aborts another. */
const controllers = new Map<string, Map<string, AbortController>>();
/** Stable identity: useSyncExternalStore must not see a fresh array every read. */
const EMPTY: Turn[] = [];

const read = (scope: string): Turn[] => threads.get(scope) ?? EMPTY;
const inflight = (scope: string) => {
  let m = controllers.get(scope);
  if (!m) controllers.set(scope, (m = new Map()));
  return m;
};
const write = (scope: string, next: Turn[]) => {
  threads.set(scope, next);
  listeners.forEach((l) => l());
};
const patch = (scope: string, id: string, p: Partial<Turn> | ((t: Turn) => Partial<Turn>)) =>
  write(
    scope,
    read(scope).map((t) => (t.id === id ? { ...t, ...(typeof p === "function" ? p(t) : p) } : t)),
  );

async function run(scope: string, question: string) {
  const id = `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  write(scope, [...read(scope), { id, question, state: "streaming", status: "", tools: [], text: "", answer: null, error: null, vote: null }]);
  const ctrl = new AbortController();
  inflight(scope).set(id, ctrl);
  try {
    const answer = await api.askStream(
      question,
      (e) => {
        if (e.type === "status") patch(scope, id, { status: e.message });
        // Text streamed before a tool call is the agent narrating its next step
        // ("no rows came back, let me try..."), not the answer. Clear it when a
        // tool starts so the running commentary does not sit in the answer body
        // while it works — the reasoning arrives whole in the final event and is
        // shown behind a disclosure instead.
        else if (e.type === "tool")
          patch(scope, id, (t) => ({
            tools: t.tools.includes(e.toolType) ? t.tools : [...t.tools, e.toolType],
            text: "",
          }));
        else if (e.type === "delta") patch(scope, id, (t) => ({ text: t.text + e.text }));
      },
      ctrl.signal,
    );
    patch(scope, id, { state: "done", answer, text: answer.answer || read(scope).find((t) => t.id === id)?.text || "" });
  } catch (e) {
    if ((e as Error).name === "AbortError") patch(scope, id, (t) => ({ state: t.text ? "done" : "error", error: t.text ? null : "stopped" }));
    else patch(scope, id, { state: "error", error: e instanceof ApiError ? e.kind : "server" });
  } finally {
    inflight(scope).delete(id);
  }
}

/**
 * One conversation with the agent. `scope` picks which: omit it for the Ask page,
 * or pass something stable (`customer:CUST000123`) for a chat pinned to one subject.
 */
export function useAskSession(scope: string = MAIN) {
  const list = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => read(scope),
  );
  const ask = useCallback(
    (q: string) => {
      if (q.trim() && !read(scope).some((t) => t.state === "streaming")) void run(scope, q.trim());
    },
    [scope],
  );
  const stop = useCallback(() => inflight(scope).forEach((c) => c.abort()), [scope]);
  const vote = useCallback((id: string, v: "up" | "down") => patch(scope, id, (t) => ({ vote: t.vote === v ? null : v })), [scope]);
  const clear = useCallback(() => {
    inflight(scope).forEach((c) => c.abort());
    write(scope, EMPTY);
  }, [scope]);
  return { turns: list, busy: list.some((t) => t.state === "streaming"), ask, stop, vote, clear };
}
