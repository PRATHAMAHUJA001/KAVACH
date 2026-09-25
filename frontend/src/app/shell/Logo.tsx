import { ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";

export function Logo({ collapsed, className }: { collapsed?: boolean; className?: string }) {
  const { t } = useTranslation();
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-fg shadow-sm" aria-hidden>
        <ShieldCheck className="size-5" strokeWidth={2} />
      </span>
      {!collapsed && (
        <span className="min-w-0 leading-tight">
          <span className="block font-display text-[1.0625rem] font-bold tracking-tight text-fg">KAVACH</span>
          <span className="block truncate text-small text-muted">{t("shell.tagline")}</span>
        </span>
      )}
    </div>
  );
}
