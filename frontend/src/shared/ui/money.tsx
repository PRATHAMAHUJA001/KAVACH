import { useTranslation } from "react-i18next";
import { useFormat } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/cn";
import { Tooltip } from "./tooltip";

/** ₹ in lakh/crore; hover (or focus) shows the exact amount. */
export function Money({
  amount,
  exact = false,
  focusable = true,
  className,
}: {
  amount: number;
  exact?: boolean;
  /** Set false inside dense lists so every amount isn't a tab stop. */
  focusable?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const exactText = f.moneyExact(amount);
  const shown = exact ? exactText : f.money(amount);
  if (exact || shown === exactText) return <span className={cn("tnum whitespace-nowrap", className)}>{shown}</span>;
  return (
    <Tooltip content={`${t("common.exactAmount")}: ${exactText}`}>
      <span
        tabIndex={focusable ? 0 : undefined}
        className={cn(
          "tnum cursor-help whitespace-nowrap decoration-dotted decoration-muted/50 underline-offset-4 hover:underline",
          className,
        )}
      >
        {shown}
        <span className="sr-only"> ({exactText})</span>
      </span>
    </Tooltip>
  );
}
