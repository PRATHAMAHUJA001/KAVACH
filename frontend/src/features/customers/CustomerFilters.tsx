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
import type { CustomerSort, RiskBand } from "./useCustomerParams";

const BANDS: RiskBand[] = ["high", "medium", "low", "pep", "alerted"];
const SORTS: CustomerSort[] = ["risk", "alerts", "balance", "name"];

export function CustomerFilters({
  q,
  segment,
  risk,
  sort,
  segments,
  onChange,
}: {
  q: string;
  segment: string;
  risk: RiskBand | "";
  sort: CustomerSort;
  /** Segment values the server reports for this data. */
  segments: string[];
  onChange: (patch: Partial<Record<"q" | "segment" | "risk" | "sort", string | null>>) => void;
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
      <FilterChips<RiskBand | "">
        label={t("customers.band.label")}
        value={risk}
        onChange={(v) => onChange({ risk: v || null })}
        options={[{ value: "", label: t("customers.band.all") }, ...BANDS.map((b) => ({ value: b, label: t(`customers.band.${b}`) }))]}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="search"
          icon={<Search />}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("customers.searchPlaceholder")}
          aria-label={t("customers.searchPlaceholder")}
          className="w-full sm:w-72"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" className="max-w-full sm:max-w-64" aria-label={`${t("customers.segment.label")}: ${segment || t("customers.segment.all")}`}>
              <span className="text-muted">{t("customers.segment.label")}:</span>
              <span className="truncate">{segment || t("customers.segment.all")}</span>
              <ChevronDown className="text-muted" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-96 w-64 overflow-y-auto">
            <DropdownMenuRadioGroup value={segment} onValueChange={(v) => onChange({ segment: v || null })}>
              <DropdownMenuRadioItem value="">{t("customers.segment.all")}</DropdownMenuRadioItem>
              {segments.map((s) => (
                <DropdownMenuRadioItem key={s} value={s}>
                  {s}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex-1" />
        <Segmented<CustomerSort>
          size="sm"
          label={t("customers.sort.label")}
          value={SORTS.includes(sort) ? sort : "risk"}
          onChange={(v) => onChange({ sort: v })}
          options={SORTS.map((s) => ({ value: s, label: t(`customers.sort.${s}`) }))}
        />
      </div>
    </div>
  );
}
