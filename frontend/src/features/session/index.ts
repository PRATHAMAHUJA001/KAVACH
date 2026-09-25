import { useMemo } from "react";
import { useMe } from "@/services/api";

/**
 * Who is signed in and what "now" means. Deadlines are measured against the
 * dataset's as-of date when the backend provides it (the synthetic data is
 * frozen at 24 Sep 2026); otherwise against the wall clock.
 */
export function useSession() {
  const me = useMe();
  const asOf = me.data?.asOf ?? null;
  const now = useMemo(() => (asOf ? new Date(asOf) : new Date()), [asOf]);
  return {
    me: me.data ?? null,
    loading: me.isLoading,
    error: me.error,
    readOnly: me.data?.readOnly ?? false,
    now,
    asOf,
  };
}
