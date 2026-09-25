import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * Presentation mode (DESIGN_SPEC §4.1): 115% type, technical expanders hidden
 * (anything with `.tech-only`), and a soft cursor spotlight for the projector.
 */
interface Ctx {
  presenting: boolean;
  toggle: () => void;
  set: (v: boolean) => void;
}
const PresentationCtx = createContext<Ctx | null>(null);
const KEY = "kavach.presenting";

export function PresentationProvider({ children }: { children: React.ReactNode }) {
  const [presenting, setPresenting] = useState(() => {
    try {
      return sessionStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    document.documentElement.classList.toggle("presenting", presenting);
    try {
      sessionStorage.setItem(KEY, presenting ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [presenting]);
  const toggle = useCallback(() => setPresenting((p) => !p), []);
  const value = useMemo(() => ({ presenting, toggle, set: setPresenting }), [presenting, toggle]);
  return <PresentationCtx.Provider value={value}>{children}</PresentationCtx.Provider>;
}

export function usePresentation(): Ctx {
  const v = useContext(PresentationCtx);
  if (!v) throw new Error("usePresentation must be used inside PresentationProvider");
  return v;
}

/** A soft halo that follows the pointer while presenting. */
export function CursorSpotlight() {
  const { presenting } = usePresentation();
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!presenting) return;
    const move = (e: PointerEvent) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, [presenting]);
  if (!presenting || !pos) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-[100] size-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/15 ring-2 ring-brand/40 transition-transform duration-75"
      style={{ left: pos.x, top: pos.y }}
    />
  );
}
