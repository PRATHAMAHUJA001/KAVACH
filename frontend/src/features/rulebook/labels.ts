import type { TFunction } from "i18next";
import type { Rule } from "@/services/api";
import { shortCircular } from "@/shared/ui";
import { humanizeCode } from "@/shared/lib/format";

/** "Large cash transaction reporting · 2024/01 ¶1" instead of CASH_REPORTING_KAVACH_2024_01_1. */
export function ruleTitle(r: Pick<Rule, "typology" | "citation" | "version">, t: TFunction) {
  const pattern = t(`typology.${r.typology}`, { defaultValue: humanizeCode(r.typology) });
  const cite = r.citation ? ` · ${shortCircular(r.citation.circularNo)} ¶${r.citation.paraNo}` : "";
  return `${pattern}${cite}${r.version > 1 ? ` · v${r.version}` : ""}`;
}

export const STATUS_TONE = { APPROVED: "ok", PENDING_APPROVAL: "warn", REJECTED: "danger", SUPERSEDED: "neutral" } as const;
