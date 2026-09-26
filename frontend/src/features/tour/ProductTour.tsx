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
  route: (ids: TourResetDTO) => string;
  target: string;
}

/** Six steps across the product, always on the same seeded records (AI.RESET_TOUR_DATA). */
const STEPS: TourStep[] = [
  { key: "readiness", route: () => "/today", target: '[data-tour="readiness"]' },
  { key: "attention", route: () => "/today", target: '[data-tour="attention"]' },
  { key: "case", route: (ids) => `/alerts?case=${encodeURIComponent(ids.alert_id)}`, target: '[data-tour="case-why"]' },
  { key: "ring", route: (ids) => `/rings?ring=${encodeURIComponent(ids.ring_id)}`, target: '[data-tour="ring-graph"]' },
  { key: "rule", route: (ids) => `/rulebook?filter=all&rule=${encodeURIComponent(ids.rule_id)}`, target: '[data-tour="rule-review"]' },
  { key: "timeMachine", route: (ids) => `/time-machine?rule=${encodeURIComponent(ids.rule_id)}`, target: '[data-tour="tm-slider"]' },
];

function waitFor(selector: string, ms = 8000): Promise<boolean> {
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
  const [index, setIndex] = useState(0);
  const [show, setShow] = useState(false);
  const busy = useRef(false);
  // useNavigate's identity changes with every location change; keep it out of effect deps.
  const nav = useRef(navigate);
  nav.current = navigate;
  const tr = useRef(t);
  tr.current = t;

  const go = useCallback(
    async (i: number, tourIds: TourResetDTO) => {
      if (busy.current) return;
      const s = STEPS[i];
      if (!s) {
        setShow(false);
        stopTour();
        return;
      }
      busy.current = true;
      setShow(false);
      nav.current(s.route(tourIds));
      const ok = await waitFor(s.target);
      busy.current = false;
      if (!ok) {
        toast.error(tr.current("tour.lost"));
        stopTour();
        return;
      }
      setIndex(i);
      setShow(true);
    },
    [],
  );

  useEffect(() => {
    if (!running) {
      setShow(false);
      return;
    }
    let cancelled = false;
    // Always start from the same seeded records, so the tour can't hit an empty screen.
    api
      .resetTour()
      .then((r) => {
        if (cancelled) return;
        setIds(r);
        void go(0, r);
      })
      .catch(() => {
        toast.error(tr.current("tour.resetFailed"));
        stopTour();
      });
    return () => {
      cancelled = true;
    };
  }, [running, go]);

  useEffect(() => {
    if (!show || !ids) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName));
      if (typing) return;
      if (e.key === "ArrowRight") void go(index + 1, ids);
      else if (e.key === "ArrowLeft" && index > 0) void go(index - 1, ids);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show, ids, index, go]);

  if (!running || !ids) return null;
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
        if (d.type === "step:after") void go(d.action === "prev" ? d.index - 1 : d.index + 1, ids);
      }}
    />
  );
}
