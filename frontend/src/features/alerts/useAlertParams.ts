import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { AlertListParams } from "@/services/api/dto";

export type AlertView = "open" | "overdue" | "48h" | "all";
export type AlertSort = NonNullable<AlertListParams["sort"]>;

export const PAGE_SIZE = 25;
const VIEWS: AlertView[] = ["open", "overdue", "48h", "all"];
const SORTS: AlertSort[] = ["priority", "amount", "newest"];

/**
 * The list's filters and the open case live in the URL, so Today's links
 * (`?view=new`, `?view=due`, `?sort=amount`, `?case=…`) and Back work.
 */
export function useAlertParams(overdueCount = 0) {
  const [sp, setSp] = useSearchParams();

  const rawView = sp.get("view");
  // Today's links: "new" = newest first, "due" = the most urgent deadline band.
  const view: AlertView = VIEWS.includes(rawView as AlertView) ? (rawView as AlertView) : rawView === "due" ? (overdueCount > 0 ? "overdue" : "48h") : "open";
  const rawSort = sp.get("sort");
  const sort: AlertSort = SORTS.includes(rawSort as AlertSort) ? (rawSort as AlertSort) : rawView === "new" ? "newest" : "priority";
  const typology = sp.get("typology") ?? "";
  const q = sp.get("q") ?? "";
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const caseId = sp.get("case");

  const params: AlertListParams = useMemo(
    () => ({
      due: view === "all" ? undefined : view,
      sort,
      typology: typology || undefined,
      q: q.trim() || undefined,
      page,
      page_size: PAGE_SIZE,
    }),
    [view, sort, typology, q, page],
  );

  /** Filter changes replace history and go back to page 1. */
  const update = useCallback(
    (patch: Partial<Record<"view" | "sort" | "typology" | "q" | "page", string | null>>) =>
      setSp(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (!("page" in patch)) next.delete("page");
          for (const [k, v] of Object.entries(patch)) {
            if (v == null || v === "") next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true },
      ),
    [setSp],
  );

  /** Opening a case pushes history, so Back closes the drawer. */
  const openCase = useCallback(
    (id: string) =>
      setSp((prev) => {
        const next = new URLSearchParams(prev);
        next.set("case", id);
        return next;
      }),
    [setSp],
  );
  const closeCase = useCallback(
    () =>
      setSp(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("case");
          return next;
        },
        { replace: true },
      ),
    [setSp],
  );

  return { view, sort, typology, q, page, caseId, params, update, openCase, closeCase };
}
