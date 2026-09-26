import { useSyncExternalStore } from "react";

let running = false;
const subs = new Set<() => void>();
const set = (v: boolean) => {
  running = v;
  subs.forEach((s) => s());
};

export const startTour = () => set(true);
export const stopTour = () => set(false);
export const useTourRunning = () =>
  useSyncExternalStore(
    (s) => {
      subs.add(s);
      return () => subs.delete(s);
    },
    () => running,
  );
