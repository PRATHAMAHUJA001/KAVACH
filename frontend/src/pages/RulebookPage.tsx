import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui";
import { useConflicts, useJob, useRules } from "@/services/api";
import { useSession } from "@/features/session";
import { ConflictsTab, HealthTab, RuleReview, UploadCard, VersionsTab, type ReviewFilter } from "@/features/rulebook";

const TABS = ["review", "versions", "conflicts", "health"] as const;
type Tab = (typeof TABS)[number];

/** DESIGN_SPEC §3.5 — "From regulation to working checks in minutes." */
export default function RulebookPage() {
  const { t } = useTranslation();
  const { readOnly } = useSession();
  const [sp, setSp] = useSearchParams();
  const rules = useRules();
  const conflicts = useConflicts();
  const jobId = sp.get("job");
  const job = useJob(jobId);
  const uploadIds = job.data?.status === "COMPLETED" && job.data.ruleIds.length ? job.data.ruleIds : null;

  const tab: Tab = TABS.includes(sp.get("tab") as Tab) ? (sp.get("tab") as Tab) : "review";
  const rawFilter = sp.get("filter") as ReviewFilter | null;
  const filter: ReviewFilter = rawFilter === "upload" && !uploadIds ? "PENDING_APPROVAL" : rawFilter ?? "PENDING_APPROVAL";
  const ruleId = sp.get("rule");
  const selected = rules.data?.find((r) => r.id === ruleId) ?? null;

  const set = (patch: Record<string, string | null>) =>
    setSp((p) => {
      const n = new URLSearchParams(p);
      for (const [k, v] of Object.entries(patch)) v == null ? n.delete(k) : n.set(k, v);
      return n;
    }, { replace: true });

  const pending = rules.data?.filter((r) => r.status === "PENDING_APPROVAL").length;
  const openConflicts = conflicts.data?.filter((c) => c.status === "OPEN").length;

  return (
    <div className="space-y-6">
      <UploadCard
        jobId={jobId}
        readOnly={readOnly}
        onJob={(id) => set({ job: id, filter: null })}
        onReview={(ids) => set({ tab: "review", filter: "upload", rule: ids[0] ?? null })}
      />
      <Tabs value={tab} onValueChange={(v) => set({ tab: v === "review" ? null : v })}>
        <TabsList>
          <TabsTrigger value="review">
            {t("rulebook.tab.review")}
            {pending ? <span className="ml-1.5 rounded-full bg-warn-soft px-1.5 text-[0.6875rem] font-semibold text-warn tnum">{pending}</span> : null}
          </TabsTrigger>
          <TabsTrigger value="versions">{t("rulebook.tab.versions")}</TabsTrigger>
          <TabsTrigger value="conflicts">
            {t("rulebook.tab.conflicts")}
            {openConflicts ? <span className="ml-1.5 rounded-full bg-danger-soft px-1.5 text-[0.6875rem] font-semibold text-danger tnum">{openConflicts}</span> : null}
          </TabsTrigger>
          <TabsTrigger value="health">{t("rulebook.tab.health")}</TabsTrigger>
        </TabsList>
        <TabsContent value="review" className="mt-4">
          <RuleReview
            rules={rules.data}
            isLoading={rules.isLoading}
            isError={rules.isError}
            onRetry={() => void rules.refetch()}
            filter={filter}
            onFilter={(f) => set({ filter: f === "PENDING_APPROVAL" ? null : f, rule: null })}
            selectedId={ruleId}
            onSelect={(id) => set({ rule: id })}
            onVersions={(id) => set({ tab: "versions", rule: id })}
            uploadIds={uploadIds}
          />
        </TabsContent>
        <TabsContent value="versions" className="mt-4">
          <VersionsTab rule={selected ?? rules.data?.find((r) => r.version > 1) ?? rules.data?.[0] ?? null} />
        </TabsContent>
        <TabsContent value="conflicts" className="mt-4">
          <ConflictsTab onOpenRule={(id) => set({ tab: null, filter: "all", rule: id })} />
        </TabsContent>
        <TabsContent value="health" className="mt-4">
          <HealthTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
