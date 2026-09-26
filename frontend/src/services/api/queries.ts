/**
 * TanStack Query hooks — the only way features read or write server data.
 * Previous data is kept while refetching so screens never flash empty.
 */
import { keepPreviousData, QueryClient, useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "./client";
import { ApiError } from "./client";
import type { AlertListParams, CustomerListParams, FeedbackRequestDTO } from "./dto";
import type { AlertDetail } from "./models";

export const qk = {
  me: ["me"] as const,
  home: ["home"] as const,
  risk: ["risk"] as const,
  alerts: (p: AlertListParams) => ["alerts", p] as const,
  alert: (id: string) => ["alert", id] as const,
  customers: (p: CustomerListParams) => ["customers", p] as const,
  customer: (id: string) => ["customer", id] as const,
  evidence: (id: string) => ["evidence", id] as const,
  paragraph: (c: string, p: string) => ["paragraph", c, p] as const,
  search: (q: string) => ["search", q] as const,
  rings: ["rings"] as const,
  ring: (id: string) => ["ring", id] as const,
  rules: (status?: string) => ["rules", status ?? "all"] as const,
  rule: (id: string) => ["rule", id] as const,
  ruleVersions: (id: string) => ["ruleVersions", id] as const,
  conflicts: ["conflicts"] as const,
  ruleHealth: ["ruleHealth"] as const,
  job: (id: string) => ["job", id] as const,
  tunables: ["tunables"] as const,
  whyNot: (id: string) => ["whyNot", id] as const,
  strDraft: (id: string) => ["strDraft", id] as const,
  verification: (id: string) => ["verification", id] as const,
  ruleEval: ["ruleEval"] as const,
};

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        placeholderData: keepPreviousData,
        retry: (count, err) => (err instanceof ApiError ? err.retryable && count < 2 : count < 1),
      },
      mutations: { retry: false },
    },
  });
}

export const useMe = () => useQuery({ queryKey: qk.me, queryFn: api.getMe, staleTime: Infinity });
export const useHome = () => useQuery({ queryKey: qk.home, queryFn: api.getHome });
export const useRisk = () => useQuery({ queryKey: qk.risk, queryFn: api.getRisk });
export const useAlerts = (p: AlertListParams) => useQuery({ queryKey: qk.alerts(p), queryFn: () => api.listAlerts(p) });
export const useAlert = (id: string | null) =>
  useQuery({ queryKey: qk.alert(id ?? ""), queryFn: () => api.getAlert(id!), enabled: !!id, placeholderData: undefined });
export const useCustomers = (p: CustomerListParams) => useQuery({ queryKey: qk.customers(p), queryFn: () => api.listCustomers(p) });
export const useCustomer = (id: string | null) =>
  useQuery({ queryKey: qk.customer(id ?? ""), queryFn: () => api.getCustomer(id!), enabled: !!id, placeholderData: undefined });
export const useEvidence = (id: string | null) =>
  useQuery({ queryKey: qk.evidence(id ?? ""), queryFn: () => api.getEvidence(id!), enabled: !!id, placeholderData: undefined });
export const useParagraph = (c: string | null, p: string | null) =>
  useQuery({ queryKey: qk.paragraph(c ?? "", p ?? ""), queryFn: () => api.getParagraph(c!, p!), enabled: !!c && !!p, staleTime: Infinity, placeholderData: undefined });
export const useSearch = (q: string) =>
  useQuery({ queryKey: qk.search(q), queryFn: () => api.search(q), enabled: q.trim().length >= 2, staleTime: 60_000 });
export const useRings = () => useQuery({ queryKey: qk.rings, queryFn: api.listRings });
export const useRing = (id: string | null) => useQuery({ queryKey: qk.ring(id ?? ""), queryFn: () => api.getRing(id!), enabled: !!id });
export const useRules = (status?: string) => useQuery({ queryKey: qk.rules(status), queryFn: () => api.listRules(status) });
export const useRuleVersions = (id: string | null) =>
  useQuery({ queryKey: qk.ruleVersions(id ?? ""), queryFn: () => api.getRuleVersions(id!), enabled: !!id });
export const useConflicts = () => useQuery({ queryKey: qk.conflicts, queryFn: api.listConflicts });
export const useRuleHealth = () => useQuery({ queryKey: qk.ruleHealth, queryFn: api.getRuleHealth });
export const useTunables = () => useQuery({ queryKey: qk.tunables, queryFn: api.listTunables, staleTime: Infinity });
export const useJob = (id: string | null) =>
  useQuery({
    queryKey: qk.job(id ?? ""),
    queryFn: () => api.getJob(id!),
    enabled: !!id,
    placeholderData: undefined,
    refetchInterval: (q) => (q.state.data?.status === "COMPLETED" || q.state.data?.status === "FAILED" ? false : 500),
  });

/** Hover prefetch for the case file (DESIGN_SPEC §4 "instant feel"). */
export function usePrefetchAlert() {
  const qc = useQueryClient();
  return (id: string) => void qc.prefetchQuery({ queryKey: qk.alert(id), queryFn: () => api.getAlert(id), staleTime: 30_000 });
}

/** Same hover prefetch for the customer file. */
export function usePrefetchCustomer() {
  const qc = useQueryClient();
  return (id: string) => void qc.prefetchQuery({ queryKey: qk.customer(id), queryFn: () => api.getCustomer(id), staleTime: 30_000 });
}

/** Optimistic: the case file shows the verdict at once and rolls back if the server refuses. */
export function useFeedback(alertId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: FeedbackRequestDTO) => api.sendFeedback(alertId, body),
    onMutate: async (body) => {
      if (!body.verdict) return { previous: undefined };
      await qc.cancelQueries({ queryKey: qk.alert(alertId) });
      const previous = qc.getQueryData<AlertDetail>(qk.alert(alertId));
      if (previous)
        qc.setQueryData<AlertDetail>(qk.alert(alertId), {
          ...previous,
          alert: { ...previous.alert, status: "CLOSED", resolution: body.verdict === "FRAUD" ? "TRUE_POSITIVE" : "FALSE_POSITIVE" },
        });
      return { previous };
    },
    onError: (_err, _body, ctx) => {
      if (ctx?.previous) qc.setQueryData(qk.alert(alertId), ctx.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["alerts"] });
      void qc.invalidateQueries({ queryKey: qk.alert(alertId) });
      void qc.invalidateQueries({ queryKey: qk.home });
    },
  });
}

export function useCreateEvidence(alertId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ["createEvidence", alertId],
    mutationFn: () => api.createEvidence(alertId),
    onSuccess: (e) => {
      qc.setQueryData(qk.evidence(alertId), e);
      // A new pack hasn't been checked yet.
      qc.removeQueries({ queryKey: qk.verification(alertId) });
    },
  });
}

/** Verifies the stored pack; the result is cached so every part of the case file sees the same seal. */
export function useVerifyEvidence(alertId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ["verify", alertId],
    mutationFn: () => api.verifyEvidence(alertId),
    onSuccess: (v) => qc.setQueryData(qk.verification(alertId), v),
  });
}
export const useVerification = (alertId: string) =>
  useQuery({ queryKey: qk.verification(alertId), queryFn: () => api.verifyEvidence(alertId), enabled: false, placeholderData: undefined, staleTime: Infinity });
export const useIsVerifying = (alertId: string) => useIsMutating({ mutationKey: ["verify", alertId] }) > 0;
export const useIsCreatingEvidence = (alertId: string) => useIsMutating({ mutationKey: ["createEvidence", alertId] }) > 0;

/** The draft doesn't change within a session, so it's fetched once when asked for. */
export const useSTRDraft = (id: string | null) =>
  useQuery({ queryKey: qk.strDraft(id ?? ""), queryFn: () => api.getStrDraft(id!), enabled: !!id, staleTime: Infinity, placeholderData: undefined, retry: false });

/** "Why wasn't this flagged?" — a lookup on submit, not a query on mount. */
export function useWhyNot() {
  return useMutation({ mutationFn: (txnId: string) => api.whyNot(txnId.trim().toUpperCase()) });
}

export function useRuleDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; user: string; decision: "approve" } | { id: string; user: string; decision: "reject"; reason: string }) =>
      v.decision === "approve" ? api.approveRule(v.id, v.user) : api.rejectRule(v.id, v.user, v.reason),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["rules"] });
      void qc.invalidateQueries({ queryKey: qk.ruleHealth });
      void qc.invalidateQueries({ queryKey: qk.home });
    },
  });
}

export const useRuleEval = () => useQuery({ queryKey: qk.ruleEval, queryFn: api.getEval, staleTime: 5 * 60_000 });

/** Starts a circular upload; the job is then polled with useJob until it completes. */
export function useUploadCircular() {
  return useMutation({ mutationFn: (file: File) => api.uploadCircular(file) });
}

/** Once an upload finishes, the new rules, conflicts and health need a fresh read. */
export function useRefreshRules() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["rules"] });
    void qc.invalidateQueries({ queryKey: qk.conflicts });
    void qc.invalidateQueries({ queryKey: qk.ruleHealth });
    void qc.invalidateQueries({ queryKey: qk.home });
  };
}

export function useReplay() {
  return useMutation({ mutationFn: (v: { ruleId: string; value: number; days?: number }) => api.replay(v.ruleId, v.value, v.days) });
}
