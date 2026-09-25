import { ShieldCheck, Sparkles, Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

/** VERIFIED ✓ (ok-soft) / AI-GENERATED (info-soft), with an ⓘ explaining what each means. */
export function TrustBadge({ kind, className }: { kind: "verified" | "ai"; className?: string }) {
  const { t } = useTranslation();
  const verified = kind === "verified";
  const Icon = verified ? ShieldCheck : Sparkles;
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "inline-flex h-6 items-center gap-1.5 rounded-full pl-2 pr-1.5 label-caps transition-[filter] hover:brightness-95 dark:hover:brightness-125",
          verified ? "bg-ok-soft text-ok" : "bg-info-soft text-info",
          className,
        )}
        aria-label={`${verified ? t("badge.verified") : t("badge.ai")} — ${t("common.learnMore")}`}
      >
        <Icon className="size-3.5" strokeWidth={2.25} aria-hidden />
        {verified ? `${t("badge.verified")} ✓` : t("badge.ai")}
        <Info className="size-3.5 opacity-70" strokeWidth={2} aria-hidden />
      </PopoverTrigger>
      <PopoverContent className="w-72" side="top">
        <p className="flex items-center gap-2 font-semibold text-fg">
          <Icon className={cn("size-4", verified ? "text-ok" : "text-info")} strokeWidth={2} aria-hidden />
          {verified ? t("badge.verified") : t("badge.ai")}
        </p>
        <p className="mt-1.5 text-body text-muted">{verified ? t("badge.verifiedHint") : t("badge.aiHint")}</p>
      </PopoverContent>
    </Popover>
  );
}
