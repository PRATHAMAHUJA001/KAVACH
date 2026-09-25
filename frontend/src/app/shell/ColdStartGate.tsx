import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { RotateCw, ServerCrash, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui";
import { api } from "@/services/api";
import { Logo } from "./Logo";

const QUIET_MS = 1200; // healthy answers faster than this never show the screen
const GIVE_UP_MS = 60_000;
const EXPECTED_MS = 20_000;

type Phase = "checking" | "waking" | "ready" | "failed";

/**
 * DESIGN_SPEC §4.6: when the Snowpark Container Services app is suspended the first
 * request can take ~20 s. Show a calm "waking up" screen with progress, never an error.
 */
export function ColdStartGate({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>("checking");
  const [elapsed, setElapsed] = useState(0);
  const started = useRef(0);

  const run = useCallback(() => {
    let cancelled = false;
    started.current = performance.now();
    setElapsed(0);
    setPhase("checking");
    const quiet = setTimeout(() => !cancelled && setPhase((p) => (p === "checking" ? "waking" : p)), QUIET_MS);
    const tick = setInterval(() => setElapsed(performance.now() - started.current), 250);
    const attempt = async () => {
      while (!cancelled) {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 5000);
        try {
          const h = await api.getHealth(ctrl.signal);
          clearTimeout(to);
          if (h.status === "healthy" || h.status === "ok") {
            if (!cancelled) setPhase("ready");
            return;
          }
        } catch {
          clearTimeout(to);
        }
        if (performance.now() - started.current > GIVE_UP_MS) {
          if (!cancelled) setPhase("failed");
          return;
        }
        setPhase((p) => (p === "checking" ? "waking" : p));
        await new Promise((r) => setTimeout(r, 1500));
      }
    };
    void attempt().finally(() => {
      clearTimeout(quiet);
      clearInterval(tick);
    });
    return () => {
      cancelled = true;
      clearTimeout(quiet);
      clearInterval(tick);
    };
  }, []);

  useEffect(() => run(), [run]);

  if (phase === "ready") return <>{children}</>;
  if (phase === "checking") return null;

  const pct = Math.min(95, (elapsed / EXPECTED_MS) * 100);
  return (
    <main className="flex min-h-screen items-center justify-center bg-app px-4">
      <div className="w-full max-w-md text-center">
        <Logo className="justify-center" />
        {phase === "waking" ? (
          <div role="status" aria-live="polite" className="mt-10 rounded-card border border-border bg-surface p-8 shadow-card">
            <div className="relative mx-auto size-16" aria-hidden>
              <motion.span
                className="absolute inset-0 rounded-full bg-brand/20"
                animate={{ scale: [1, 1.35], opacity: [0.7, 0] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
              />
              <span className="relative inline-flex size-16 items-center justify-center rounded-full bg-brand-soft text-brand">
                <ShieldCheck className="size-8" strokeWidth={1.75} />
              </span>
            </div>
            <h1 className="mt-6 font-display text-h1 font-semibold">{t("shell.waking")}</h1>
            <p className="mt-2 text-body text-muted">{t("shell.wakingBody")}</p>
            <div className="mt-6 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={t("shell.waking")}>
              <div className="h-full rounded-full bg-brand transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 text-small text-muted tnum">{t("shell.wakingElapsed", { seconds: Math.round(elapsed / 1000) })}</p>
          </div>
        ) : (
          <div role="alert" className="mt-10 rounded-card border border-border bg-surface p-8 shadow-card">
            <span className="mx-auto inline-flex size-14 items-center justify-center rounded-full bg-danger-soft text-danger" aria-hidden>
              <ServerCrash className="size-7" strokeWidth={1.75} />
            </span>
            <h1 className="mt-5 font-display text-h1 font-semibold">{t("shell.wakeFailed")}</h1>
            <p className="mt-2 text-body text-muted">{t("shell.wakeFailedBody")}</p>
            <Button className="mt-6" onClick={() => run()}>
              <RotateCw />
              {t("common.retry")}
            </Button>
          </div>
        )}
        <p className="mt-6 text-small text-muted">{t("shell.footer")}</p>
      </div>
    </main>
  );
}
