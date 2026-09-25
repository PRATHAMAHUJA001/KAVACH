import { useEffect, useRef } from "react";

/**
 * Global keyboard shortcuts. Keys are either single ("/", "?", "p") or two-step
 * sequences written "g t". Ignored while typing in a field or with a modifier held.
 */
export function useHotkeys(bindings: Record<string, (e: KeyboardEvent) => void>, enabled = true) {
  const ref = useRef(bindings);
  ref.current = bindings;
  useEffect(() => {
    if (!enabled) return;
    let pending: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector("[role=dialog][data-state=open]") && e.key !== "?") return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const seq = pending ? `${pending} ${key}` : key;
      if (ref.current[seq]) {
        e.preventDefault();
        pending = null;
        ref.current[seq]!(e);
        return;
      }
      if (Object.keys(ref.current).some((k) => k.startsWith(`${key} `))) {
        pending = key;
        clearTimeout(timer);
        timer = setTimeout(() => (pending = null), 1200);
        return;
      }
      pending = null;
      const single = e.key === "?" ? "?" : key;
      if (ref.current[single]) {
        e.preventDefault();
        ref.current[single]!(e);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(timer);
    };
  }, [enabled]);
}
