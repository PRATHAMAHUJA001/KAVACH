import { Eye, FlaskConical } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFormat } from "@/shared/lib/i18n";
import { useSession } from "@/features/session";

export function ReviewerBanner() {
  const { t } = useTranslation();
  return (
    <div role="status" className="border-b border-info/20 bg-info-soft">
      <p className="mx-auto flex max-w-[1400px] items-center gap-2 px-8 py-2 text-body font-medium text-info">
        <Eye className="size-4 shrink-0" strokeWidth={2} aria-hidden />
        {t("shell.readOnly")}
      </p>
    </div>
  );
}

export function Footer() {
  const { t } = useTranslation();
  const f = useFormat();
  const { asOf } = useSession();
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-1 px-8 py-4 text-small text-muted">
        <span className="inline-flex items-center gap-1.5 font-medium text-warn">
          <FlaskConical className="size-3.5" strokeWidth={2} aria-hidden />
          {t("shell.footer")}
        </span>
        {asOf && <span>{t("shell.asOf", { date: f.date(asOf) })}</span>}
        <span className="ml-auto">KAVACH 1.0</span>
      </div>
    </footer>
  );
}
