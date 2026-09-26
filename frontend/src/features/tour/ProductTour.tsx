import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Joyride, { type Step, type TooltipRenderProps } from "react-joyride";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, toast } from "@/shared/ui";
import { api } from "@/services/api";
import type { TourResetDTO } from "@/services/api/dto";
import { stopTour, useTourRunning } from "./tourStore";

interface TourStep {
  key: string;
  /** `ids` is null when AI.RESET_TOUR_DATA didn't run: fall back to the plain screen. */
  route: (ids: TourResetDTO | null) => string;
  target: string;
}

/** The whole product, screen by screen, on the seeded records where there are any
    (AI.RESET_TOUR_DATA). A step whose target never shows up is skipped, not fatal. */
const STEPS: TourStep[] = [
  { key: "readiness", route: () => "/today", target: '[data-tour="readiness"]' },
  { key: "kpis", route: () => "/today", target: '[data-tour="kpis"]' },
  { key: "attention", route: () => "/today", target: '[data-tour="attention"]' },
  { key: "brief", route: () => "/today", target: '[data-tour="brief"]' },
  { key: "alertList", route: () => "/alerts", target: '[data-tour="alert-list"]' },
  { key: "case", route: (ids) => (ids ? `/alerts?case=${encodeURIComponent(ids.alert_id)}` : "/alerts"), target: '[data-tour="case-why"]' },
  // The suggestion chips only exist on an empty conversation, so fall back to the composer.
  { key: "ask", route: () => "/ask", target: '[data-tour="ask-suggestions"], [data-tour="ask-composer"]' },
  { key: "ring", route: (ids) => (ids ? `/rings?ring=${encodeURIComponent(ids.ring_id)}` : "/rings"), target: '[data-tour="ring-graph"]' },
  { key: "rule", route: (ids) => (ids ? `/rulebook?filter=all&rule=${encodeURIComponent(ids.rule_id)}` : "/rulebook?filter=all"), target: '[data-tour="rule-review"]' },
  { key: "upload", route: () => "/rulebook", target: '[data-tour="upload"]' },
  { key: "ruleHealth", route: () => "/rulebook?tab=health", target: '[data-tour="rule-health"]' },
  { key: "timeMachine", route: (ids) => (ids ? `/time-machine?rule=${encodeURIComponent(ids.rule_id)}` : "/time-machine"), target: '[data-tour="tm-slider"]' },
];

/** How long one step gets to appear, and how many may miss in a row before we give up. */
const WAIT_MS = 6000;
const MAX_MISSES = 3;

function waitFor(selector: string, ms = WAIT_MS): Promise<boolean> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = () => {
      if (document.querySelector(selector)) return resolve(true);
      if (performance.now() - t0 > ms) return resolve(false);
      setTimeout(tick, 100);
    };
    tick();
  });
}

function Tooltip({ index, size, step, backProps, primaryProps, skipProps, tooltipProps, isLastStep }: TooltipRenderProps) {
  const { t } = useTranslation();
  return (
    <div {...tooltipProps} className="w-[min(380px,90vw)] rounded-card border border-border bg-surface p-5 shadow-overlay">
      <div className="mb-2 flex items-center justify-between gap-3">
        {/* Position in the planned tour, so the total never moves under the reader. */}
        <span className="label-caps text-brand">{t("tour.stepOf", { n: index + 1, total: size })}</span>
        <button {...skipProps} title={undefined} aria-label={t("tour.close")} className="-mr-2 inline-flex size-8 items-center justify-center rounded-control text-muted hover:bg-surface-2 hover:text-fg">
          <X className="size-4" />
        </button>
      </div>
      <p className="font-display text-h2 font-semibold text-fg">{step.title}</p>
      <p className="mt-1.5 text-body text-muted">{step.content}</p>
      <div className="mt-4 flex items-center justify-between gap-2">
        {index > 0 ? (
          <Button {...backProps} aria-label={t("common.back")} title={undefined} variant="ghost" size="sm">
            <ArrowLeft />
            {t("common.back")}
          </Button>
        ) : (
          <span />
        )}
        <Button {...primaryProps} aria-label={isLastStep ? t("common.done") : t("common.next")} title={undefined} size="sm">
          {isLastStep ? t("common.done") : t("common.next")}
          {!isLastStep && <ArrowRight />}
        </Button>
      </div>
    </div>
  );
}

/** DESIGN_SPEC §4.2: dimmed background, numbered steps, Next/Back and the → key. */
export function ProductTour() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const running = useTourRunning();
  const [ids, setIds] = useState<TourResetDTO | null>(null);
  const [ready, setReady] = useState(false);
  const [index, setIndex] = useState(0);
  const [show, setShow] = useState(false);
  const busy = useRef(false);
  // useNavigate's identity changes with every location change; keep it out of effect deps.
  const nav = useRef(navigate);
  nav.current = navigate;
  const tr = useRef(t);
  tr.current = t;

  /** Walk from `from` in direction `dir` until a step's target is on screen. A screen that
      never shows up (a deep link that didn't resolve, a card with no data) is skipped, so one
      gap can't end the tour; only running out of steps — or MAX_MISSES in a row — does. */
  const go = useCallback(
    async (from: number, dir: 1 | -1, tourIds: TourResetDTO | null) => {
      if (busy.current) return;
      busy.current = true;
      let misses = 0;
      for (let i = from; i >= 0 && i < STEPS.length && misses < MAX_MISSES; i += dir) {
        const s = STEPS[i]!;
        setShow(false);
        nav.current(s.route(tourIds));
        if (await waitFor(s.target)) {
          busy.current = false;
          setIndex(i);
          setShow(true);
          return;
        }
        misses += 1;
      }
      busy.current = false;
      setShow(false);
      // Out of steps is just the end; too many misses in a row means we lost the product.
      if (misses >= MAX_MISSES) toast.error(tr.current("tour.lost"));
      stopTour();
    },
    [],
  );

  useEffect(() => {
    if (!running) {
      setShow(false);
      return;
    }
    let cancelled = false;
    // Put the seeded records back so the deep-linked steps land on known data. If that
    // fails we still tour what is on screen — those steps just skip themselves.
    api
      .resetTour()
      .catch(() => null)
      .then((r) => {
        if (cancelled) return;
        setIds(r);
        setReady(true);
        void go(0, 1, r);
      });
    return () => {
      cancelled = true;
    };
  }, [running, go]);

  useEffect(() => {
    if (!show || !ready) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName));
      if (typing) return;
      if (e.key === "ArrowRight") void go(index + 1, 1, ids);
      else if (e.key === "ArrowLeft" && index > 0) void go(index - 1, -1, ids);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show, ready, ids, index, go]);

  if (!running || !ready) return null;
  const steps: Step[] = STEPS.map((s) => ({
    target: s.target,
    title: t(`tour.steps.${s.key}.title`),
    content: t(`tour.steps.${s.key}.body`),
    disableBeacon: true,
    placement: "auto",
  }));
  return (
    <Joyride
      steps={steps}
      stepIndex={index}
      run={show}
      continuous
      showSkipButton
      disableScrolling={false}
      scrollOffset={120}
      spotlightPadding={8}
      tooltipComponent={Tooltip}
      styles={{ options: { zIndex: 200, overlayColor: "rgba(8, 11, 24, 0.55)", arrowColor: "var(--surface)" } }}
      callback={(d) => {
        if (d.action === "close" || d.action === "skip" || d.status === "finished" || d.status === "skipped") {
          if (d.type === "step:after" && d.action === "next" && d.index === STEPS.length - 1) {
            setShow(false);
            stopTour();
          } else if (d.action === "close" || d.action === "skip") {
            setShow(false);
            stopTour();
          }
          return;
        }
        if (d.type === "step:after") void go(d.action === "prev" ? d.index - 1 : d.index + 1, d.action === "prev" ? -1 : 1, ids);
      }}
    />
  );
}
