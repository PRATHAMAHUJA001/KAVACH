import { useEffect, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  FilterChips,
  Input,
  Segmented,
} from "@/shared/ui";
import type { AlertSort, AlertView } from "./useAlertParams";

/** Patterns the checks can raise, in the order an analyst meets them most. */
export const TYPOLOGIES = [
  "CASH_REPORTING",
  "STRUCTURING",
  "RAPID_PASSTHROUGH",
  "MULE_RING",
  "ROUND_TRIPPING",
  "DORMANT_REACTIVATION",
  "HIGH_RISK_SWIFT",
  "PEP_UNUSUAL_CASH",
  "INCOME_MISMATCH",
  "ACCOUNT_TAKEOVER",
  "WIRE_TRANSFER",
  "KYC_CDD",
  "GENERAL_AML",
] as const;

export function AlertFilters({
  view,
  sort,
  typology,
  q,
  counts,
  onChange,
}: {
  view: AlertView;
  sort: AlertSort;
  typology: string;
  q: string;
  /** Deadline counts from the Today KPIs, when known. */
  counts: { overdue?: number; due48h?: number };
  onChange: (patch: Partial<Record<"view" | "sort" | "typology" | "q", string | null>>) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);
  useEffect(() => {
    if (text === q) return;
    const id = setTimeout(() => onChange({ q: text.trim() || null }), 300);
    return () => clearTimeout(id);
  }, [text, q, onChange]);

  return (
    <div className="space-y-3">
      <FilterChips<AlertView>
        label={t("alerts.view.label")}
        value={view}
        onChange={(v) => onChange({ view: v })}
        options={[
          { value: "open", label: t("alerts.view.open") },
          { value: "overdue", label: t("alerts.view.overdue"), count: counts.overdue },
          { value: "48h", label: t("alerts.view.48h"), count: counts.due48h },
          { value: "all", label: t("alerts.view.all") },
        ]}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="search"
          icon={<Search />}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("alerts.searchPlaceholder")}
          aria-label={t("alerts.searchPlaceholder")}
          className="w-full sm:w-72"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" className="max-w-full sm:max-w-80" aria-label={`${t("alerts.typology.label")}: ${typology ? t(`typology.${typology}`) : t("alerts.typology.all")}`}>
              <span className="text-muted">{t("alerts.typology.label")}:</span>
              <span className="truncate">{typology ? t(`typology.${typology}`) : t("alerts.typology.all")}</span>
              <ChevronDown className="text-muted" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-96 w-80 overflow-y-auto">
            <DropdownMenuRadioGroup value={typology} onValueChange={(v) => onChange({ typology: v || null })}>
              <DropdownMenuRadioItem value="">{t("alerts.typology.all")}</DropdownMenuRadioItem>
              {TYPOLOGIES.map((ty) => (
                <DropdownMenuRadioItem key={ty} value={ty}>
                  {t(`typology.${ty}`)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex-1" />
        <Segmented<AlertSort>
          size="sm"
          label={t("alerts.sort.label")}
          value={sort}
          onChange={(v) => onChange({ sort: v })}
          options={[
            { value: "priority", label: t("alerts.sort.priority") },
            { value: "amount", label: t("alerts.sort.amount") },
            { value: "newest", label: t("alerts.sort.newest") },
          ]}
        />
      </div>
    </div>
  );
}
