import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { CustomerListParams, CustomerSortDTO, RiskBandDTO } from "@/services/api/dto";

export type CustomerSort = CustomerSortDTO;
export type RiskBand = RiskBandDTO;

export const PAGE_SIZE = 25;
const SORTS: CustomerSort[] = ["risk", "alerts", "balance", "name", "city", "segment", "id"];
const BANDS: RiskBand[] = ["high", "medium", "low", "pep", "alerted"];

/**
 * The list's filters and the open customer live in the URL, so links into a
 * customer (`?customer=CUST000123`), sharing a filtered view and Back all work.
 */
export function useCustomerParams() {
  const [sp, setSp] = useSearchParams();

  const rawSort = sp.get("sort");
  const sort: CustomerSort = SORTS.includes(rawSort as CustomerSort) ? (rawSort as CustomerSort) : "risk";
  const rawRisk = sp.get("risk");
  const risk: RiskBand | "" = BANDS.includes(rawRisk as RiskBand) ? (rawRisk as RiskBand) : "";
  const segment = sp.get("segment") ?? "";
  const q = sp.get("q") ?? "";
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const customerId = sp.get("customer");

  const params: CustomerListParams = useMemo(
    () => ({
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      q: q.trim() || undefined,
      segment: segment || undefined,
      risk: risk || undefined,
      sort,
    }),
    [page, q, segment, risk, sort],
  );

  /** Filter changes replace history and go back to page 1. */
  const update = useCallback(
    (patch: Partial<Record<"q" | "segment" | "risk" | "sort" | "page", string | null>>) =>
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

  /** Opening a customer pushes history, so Back closes the drawer. */
  const openCustomer = useCallback(
    (id: string) =>
      setSp((prev) => {
        const next = new URLSearchParams(prev);
        next.set("customer", id);
        return next;
      }),
    [setSp],
  );
  const closeCustomer = useCallback(
    () =>
      setSp(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("customer");
          return next;
        },
        { replace: true },
      ),
    [setSp],
  );

  const filtered = !!q || !!segment || !!risk || sort !== "risk";

  return { q, segment, risk, sort, page, customerId, params, filtered, update, openCustomer, closeCustomer };
}
