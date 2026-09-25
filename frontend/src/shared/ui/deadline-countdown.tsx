import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFormat } from "@/shared/lib/i18n";
import { StatusPill } from "./status-pill";

/** "Report due in 2 days" / "Report overdue by 5 hours", ticking every minute. */
export function DeadlineCountdown({
  dueAt,
  now: nowProp,
  kind = "report",
  size = "md",
}: {
  dueAt: string;
  /** Pin "now" (demo data has a fixed as-of date). */
  now?: Date;
  kind?: "report" | "plain";
  size?: "sm" | "md";
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (nowProp) return;
    const id = setInterval(() => setTick((x) => x + 1), 60_000);
    return () => clearInterval(id);
  }, [nowProp]);
  void tick;
  const info = f.deadline(dueAt, nowProp ?? new Date());
  const overdue = info.msRemaining < 0;
  const key = kind === "report" ? (overdue ? "deadline.reportOverdue" : "deadline.reportDueIn") : overdue ? "deadline.overdueBy" : "deadline.dueIn";
  return <StatusPill status={info.status} size={size} label={t(key, { span: info.span })} />;
}
