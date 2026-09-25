/**
 * TanStack Query hooks — the only way features read or write server data.
 * Previous data is kept while refetching so screens never flash empty.
 */
import { keepPreviousData, QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "./client";
import { ApiError } from "./client";
import type { AlertListParams, FeedbackRequestDTO } from "./dto";

export const qk = {
  me: ["me"] as const,
  home: ["home"] as const,
  alerts: (p: AlertListParams) => ["alerts", p] as const,
  alert: (id: string) => ["alert", id] as const,
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
export const useAlerts = (p: AlertListParams) => useQuery({ queryKey: qk.alerts(p), queryFn: () => api.listAlerts(p) });
export const useAlert = (id: string | null) =>
  useQuery({ queryKey: qk.alert(id ?? ""), queryFn: () => api.getAlert(id!), enabled: !!id, placeholderData: undefined });
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

export function useFeedback(alertId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: FeedbackRequestDTO) => api.sendFeedback(alertId, body),
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
    mutationFn: () => api.createEvidence(alertId),
    onSuccess: (e) => qc.setQueryData(qk.evidence(alertId), e),
  });
}

export function useVerifyEvidence(alertId: string) {
  return useMutation({ mutationFn: () => api.verifyEvidence(alertId) });
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

export function useReplay() {
  return useMutation({ mutationFn: (v: { ruleId: string; value: number; days?: number }) => api.replay(v.ruleId, v.value, v.days) });
}
