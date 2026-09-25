import type { Transition, Variants } from "framer-motion";

/** DESIGN_SPEC §1 Motion: 180–240ms, ease-out. */
export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];
export const DUR = { fast: 0.18, base: 0.22, slow: 0.24, drawer: 0.28, countUp: 0.6, gauge: 0.9 } as const;

export const baseTransition: Transition = { duration: DUR.base, ease: EASE_OUT };

/** Page change: 8px fade-up. */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: DUR.slow, ease: EASE_OUT } },
  exit: { opacity: 0, y: -4, transition: { duration: DUR.fast, ease: EASE_OUT } },
};

export const listStagger: Variants = {
  animate: { transition: { staggerChildren: 0.04 } },
};

export const fadeUpItem: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: DUR.base, ease: EASE_OUT } },
};

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
