import { ShieldCheck, ShieldAlert, ShieldQuestion, Loader2, Timer } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";

export type SealState = "verified" | "changed" | "unchecked" | "checking";

/** Green "✓ Untouched since 12 Sep, 14:32" seal, or a red "Changed" warning. */
export function EvidenceSeal({
  state,
  since,
  fingerprint,
  className,
}: {
  state: SealState;
  /** Already formatted, e.g. "12 Sep, 14:32". */
  since?: string;
  fingerprint?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const cfg = {
    verified: { Icon: ShieldCheck, cls: "border-ok/30 bg-ok-soft text-ok", title: `✓ ${t("evidence.untouched", { when: since ?? "" })}`, hint: t("evidence.untouchedHint") },
    changed: { Icon: ShieldAlert, cls: "border-danger/30 bg-danger-soft text-danger", title: t("evidence.changed"), hint: t("evidence.changedHint") },
    unchecked: { Icon: ShieldQuestion, cls: "border-border bg-surface-2 text-muted", title: t("evidence.notChecked"), hint: undefined },
    checking: { Icon: Loader2, cls: "border-border bg-surface-2 text-muted", title: t("evidence.checking"), hint: undefined },
  }[state];
  const { Icon } = cfg;
  return (
    <div
      role={state === "changed" ? "alert" : "status"}
      className={cn("flex items-start gap-3 rounded-xl border px-4 py-3", cfg.cls, className)}
    >
      <Icon className={cn("mt-0.5 size-6 shrink-0", state === "checking" && "animate-spin")} strokeWidth={1.75} aria-hidden />
      <div className="min-w-0">
        <p className="font-semibold">{cfg.title}</p>
        {cfg.hint && <p className="mt-0.5 text-small text-fg/75">{cfg.hint}</p>}
        {fingerprint && state !== "checking" && (
          <p className="mt-1 truncate font-mono text-[0.75rem] text-fg/60" title={fingerprint}>
            SHA-256 {fingerprint.slice(0, 16)}…
          </p>
        )}
      </div>
    </div>
  );
}

/** "Generated in 3.2 s" — only ever fed a real measured time. */
export function SpeedBadge({ seconds, className }: { seconds: number; className?: string }) {
  const { t } = useTranslation();
  return (
    <span className={cn("inline-flex h-6 items-center gap-1 rounded-full bg-brand-soft px-2 text-small font-medium text-brand tnum", className)}>
      <Timer className="size-3.5" strokeWidth={2} aria-hidden />
      {t("evidence.generatedIn", { seconds: seconds.toFixed(1) })}
    </span>
  );
}
