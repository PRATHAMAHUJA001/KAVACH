import {
  LogIn,
  Smartphone,
  UserPlus,
  Banknote,
  ArrowDownLeft,
  ArrowUpRight,
  Siren,
  IdCard,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { useFormat } from "@/shared/lib/i18n";
import { Money } from "./money";

export type TimelineEventType =
  | "login"
  | "device_change"
  | "new_beneficiary"
  | "cash_deposit"
  | "transfer_in"
  | "transfer_out"
  | "alert"
  | "kyc";

export interface TimelineEvent {
  id: string;
  at: string;
  type: TimelineEventType;
  title: string;
  detail?: string;
  amount?: number;
  suspicious?: boolean;
}

const ICONS: Record<TimelineEventType, LucideIcon> = {
  login: LogIn,
  device_change: Smartphone,
  new_beneficiary: UserPlus,
  cash_deposit: Banknote,
  transfer_in: ArrowDownLeft,
  transfer_out: ArrowUpRight,
  alert: Siren,
  kyc: IdCard,
};

/** Vertical line, dated nodes, icon per event type; suspicious events highlighted. */
export function Timeline({ events, className }: { events: TimelineEvent[]; className?: string }) {
  const { t } = useTranslation();
  const f = useFormat();
  let lastDay = "";
  return (
    <ol className={cn("relative", className)}>
      {events.map((e, i) => {
        const Icon = ICONS[e.type];
        const day = f.date(e.at);
        const showDay = day !== lastDay;
        lastDay = day;
        const isLast = i === events.length - 1;
        return (
          <li key={e.id} className="relative">
            {showDay && (
              <div className="mb-2 ml-12 mt-1 text-small font-semibold text-muted first:mt-0">{day}</div>
            )}
            <div className="relative flex gap-3 pb-4">
              {!isLast && <span className="absolute left-[17px] top-9 bottom-0 w-px bg-border" aria-hidden />}
              <span
                className={cn(
                  "relative z-10 inline-flex size-9 shrink-0 items-center justify-center rounded-full border",
                  e.suspicious
                    ? "border-danger/40 bg-danger-soft text-danger ring-4 ring-danger-soft"
                    : e.type === "alert"
                      ? "border-brand/30 bg-brand-soft text-brand"
                      : "border-border bg-surface text-muted",
                )}
                aria-hidden
              >
                <Icon className="size-4" strokeWidth={1.75} />
              </span>
              <div
                className={cn(
                  "min-w-0 flex-1 rounded-xl px-3 py-2",
                  e.suspicious && "bg-danger-soft/60 ring-1 ring-danger/25",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-body font-medium text-fg">
                      {e.title}
                      {e.suspicious && (
                        <span className="ml-2 inline-flex h-5 items-center rounded-full bg-danger px-1.5 align-middle text-[0.6875rem] font-semibold text-white dark:text-[#1a0606]">
                          {t("timeline.suspicious")}
                        </span>
                      )}
                    </p>
                    <p className="text-small text-muted">
                      {f.time(e.at)} · {t(`timeline.type.${e.type}`)}
                      {e.detail ? ` · ${e.detail}` : ""}
                    </p>
                  </div>
                  {e.amount != null && (
                    <Money
                      amount={e.amount}
                      focusable={false}
                      className={cn("shrink-0 text-body font-semibold", e.type === "transfer_in" && "text-ok")}
                    />
                  )}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
