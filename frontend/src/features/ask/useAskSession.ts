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

/** Module-level so the conversation survives leaving the page and coming back. */
let turns: Turn[] = [];
const listeners = new Set<() => void>();
const controllers = new Map<string, AbortController>();
const emit = () => listeners.forEach((l) => l());
const patch = (id: string, p: Partial<Turn> | ((t: Turn) => Partial<Turn>)) => {
  turns = turns.map((t) => (t.id === id ? { ...t, ...(typeof p === "function" ? p(t) : p) } : t));
  emit();
};

async function run(question: string) {
  const id = `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  turns = [...turns, { id, question, state: "streaming", status: "", tools: [], text: "", answer: null, error: null, vote: null }];
  emit();
  const ctrl = new AbortController();
  controllers.set(id, ctrl);
  try {
    const answer = await api.askStream(
      question,
      (e) => {
        if (e.type === "status") patch(id, { status: e.message });
        else if (e.type === "tool") patch(id, (t) => ({ tools: t.tools.includes(e.toolType) ? t.tools : [...t.tools, e.toolType] }));
        else if (e.type === "delta") patch(id, (t) => ({ text: t.text + e.text }));
      },
      ctrl.signal,
    );
    patch(id, { state: "done", answer, text: answer.answer || turns.find((t) => t.id === id)?.text || "" });
  } catch (e) {
    if ((e as Error).name === "AbortError") patch(id, (t) => ({ state: t.text ? "done" : "error", error: t.text ? null : "stopped" }));
    else patch(id, { state: "error", error: e instanceof ApiError ? e.kind : "server" });
  } finally {
    controllers.delete(id);
  }
}

export function useAskSession() {
  const list = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => turns,
  );
  const ask = useCallback((q: string) => {
    if (q.trim() && !turns.some((t) => t.state === "streaming")) void run(q.trim());
  }, []);
  const stop = useCallback(() => controllers.forEach((c) => c.abort()), []);
  const vote = useCallback((id: string, v: "up" | "down") => patch(id, (t) => ({ vote: t.vote === v ? null : v })), []);
  const clear = useCallback(() => {
    controllers.forEach((c) => c.abort());
    turns = [];
    emit();
  }, []);
  return { turns: list, busy: list.some((t) => t.state === "streaming"), ask, stop, vote, clear };
}
