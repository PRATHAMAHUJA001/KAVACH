import { FlaskConical } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "./tooltip";

/** Visible only in mock mode. */
export function DemoDataChip() {
  const { t } = useTranslation();
  return (
    <Tooltip content={t("common.demoDataHint")}>
      <span
        tabIndex={0}
        className="inline-flex h-7 items-center gap-1.5 rounded-full border border-dashed border-warn/50 bg-warn-soft px-2.5 text-small font-semibold text-warn"
      >
        <FlaskConical className="size-3.5" strokeWidth={2} aria-hidden />
        {t("common.demoData")}
      </span>
    </Tooltip>
  );
}
