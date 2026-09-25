import { useEffect, useRef, useState } from "react";
import { DUR, prefersReducedMotion } from "./motion";

/**
 * Counts from 0 to `target` once, on first render with a real value (600ms, ease-out).
 * Later value changes jump straight to the new number so refetches never re-animate.
 */
export function useCountUp(target: number | null | undefined, durationMs = DUR.countUp * 1000): number {
  const [value, setValue] = useState(0);
  const animated = useRef(false);

  useEffect(() => {
    if (target == null || Number.isNaN(target)) return;
    if (animated.current || prefersReducedMotion()) {
      setValue(target);
      animated.current = true;
      return;
    }
    animated.current = true;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return value;
}
