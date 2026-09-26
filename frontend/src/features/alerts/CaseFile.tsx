import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Check, Copy, Download, FileText, FileX2, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Button,
  CaseDrawer,
  CaseSection,
  CitationChip,
  CitationDrawer,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  EmptyState,
  ErrorState,
  EvidenceSeal,
  Expander,
  MiniNetworkGraph,
  Money,
  ReasonBars,
  Segmented,
  Skeleton,
  SpeedBadge,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Timeline,
  Tooltip,
  TrustBadge,
  toast,
  type SealState,
} from "@/shared/ui";
import { useFormat } from "@/shared/lib/i18n";
import type { AlertDetail, Lang, Verification } from "@/services/api";
import {
  ApiError,
  USE_MOCKS,
  api,
  useAlert,
  useCreateEvidence,
  useEvidence,
  useFeedback,
  useIsCreatingEvidence,
  useIsVerifying,
  useParagraph,
  useSTRDraft,
  useVerification,
  useVerifyEvidence,
} from "@/services/api";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/features/session";
import { AlertStatus } from "./AlertList";

/** DESIGN_SPEC §3.2 — "Why is this suspicious, and can I prove it?" */
export function CaseFile({ alertId, onClose }: { alertId: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const q = useAlert(alertId);
  const d = q.data;
  const notFound = q.error instanceof ApiError && q.error.kind === "notFound";

  return (
    <CaseDrawer
      open={!!alertId}
      onOpenChange={(o) => !o && onClose()}
      loading={!d && !q.isError}
      eyebrow={d ? t(`typology.${d.alert.typology}`, { defaultValue: d.alert.typology }) : undefined}
      title={d ? f.text(d.alert.customerName) : t("case.loading")}
      description={d ? t("page.alerts.subtitle") : undefined}
      riskLevel={d?.alert.riskLevel}
      deadline={d ? <AlertStatus alert={d.alert} size="md" /> : undefined}
      primaryAction={d && alertId ? <DownloadButton alertId={alertId} /> : undefined}
      footer={d && alertId ? <Actions detail={d} /> : undefined}
    >
      {q.isError && !d ? (
        notFound ? (
          <EmptyState icon={FileX2} tone="neutral" title={t("case.notFound")} compact />
        ) : (
          <ErrorState compact onRetry={() => void q.refetch()} retrying={q.isFetching} />
        )
      ) : !d ? (
        <CaseSkeleton />
      ) : (
        <CaseBody detail={d} />
      )}
    </CaseDrawer>
  );
}

function CaseSkeleton() {
  return (
    <div className="space-y-8" aria-busy>
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}

function CaseBody({ detail: d }: { detail: AlertDetail }) {
  const { t } = useTranslation();
  const f = useFormat();
  const navigate = useNavigate();
  const [storyLang, setStoryLang] = useState<Lang>(f.lang);
  const [citeOpen, setCiteOpen] = useState(false);
  useEffect(() => setStoryLang(f.lang), [f.lang, d.alert.id]);

  const a = d.alert;
  const name = f.text(a.customerName);
  const pattern = t(`typology.${a.typology}`, { defaultValue: a.typology, lng: storyLang });
  const fallback =
    a.amount != null && a.txnCount
      ? t("case.storyFallbackAmount", { name, pattern, count: a.txnCount, amount: f.money(a.amount), lng: storyLang })
      : t("case.storyFallback", { name, pattern, lng: storyLang });
  const story = d.story ? (storyLang === "hi" ? d.story.hi : d.story.en) : fallback;
  const para = useParagraph(citeOpen ? d.citation?.circularNo ?? null : null, citeOpen ? d.citation?.paraNo ?? null : null);

  return (
    <div className="divide-y divide-border">
      <p className="pb-5 text-small text-muted">
        {[a.accountId, a.branch, a.city ? f.text(a.city) : null, a.pan ? `PAN ${a.pan}` : null].filter(Boolean).join(" · ")}
      </p>

      <CaseSection
        id="case-story"
        title={t("case.story")}
        className="pt-5"
        aside={
          <Segmented<Lang>
            size="sm"
            label={t("case.storyLang")}
            value={storyLang}
            onChange={setStoryLang}
            options={[
              { value: "en", label: "EN" },
              { value: "hi", label: "हिन्दी", lang: "hi" },
            ]}
          />
        }
      >
        <p className="text-story text-fg" lang={storyLang}>
          {story}
        </p>
        {d.story && (
          <div className="mt-3">
            <TrustBadge kind="ai" />
          </div>
        )}
      </CaseSection>

      <CaseSection id="case-why" title={t("reason.title")}>
        <div data-tour="case-why">
        {d.reasons.length > 0 ? (
          <ReasonBars reasons={d.reasons.map((r) => ({ text: f.text(r.text), weight: r.weight }))} />
        ) : (
          <p className="text-body text-muted">{t("case.noReasons")}</p>
        )}
        {d.citation && (
          <div className="mt-4">
            <CitationChip circularNo={d.citation.circularNo} paraNo={d.citation.paraNo} onOpen={() => setCiteOpen(true)} />
          </div>
        )}
        </div>
        <CitationDrawer
          open={citeOpen}
          onOpenChange={setCiteOpen}
          citation={d.citation}
          highlight={d.citation?.highlight}
          loading={para.isLoading}
          error={para.isError ? <ErrorState compact onRetry={() => void para.refetch()} /> : undefined}
          paragraph={
            para.data
              ? {
                  circularNo: para.data.circularNo,
                  paraNo: para.data.paraNo,
                  text: para.data.text,
                  issueDate: para.data.issueDate ? f.date(para.data.issueDate) : undefined,
                  before: para.data.before ?? undefined,
                  after: para.data.after ?? undefined,
                }
              : null
          }
        />
      </CaseSection>

      <CaseSection id="case-timeline" title={t("timeline.title")}>
        {d.timeline.length > 0 ? (
          <Timeline events={d.timeline.map((e) => ({ id: e.id, at: e.at, type: e.type, title: f.text(e.title), detail: e.detail, amount: e.amount, suspicious: e.suspicious }))} />
        ) : (
          <p className="text-body text-muted">{t("case.noTimeline")}</p>
        )}
        {d.transactions.length > 0 && (
          <Expander className="mt-4" icon={<FileText />} title={t("case.transactions")} meta={t("alerts.txns", { count: d.transactions.length })}>
            <div className="-mx-4 -my-4 max-h-80 overflow-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>{t("case.txn.when")}</TH>
                    <TH>{t("case.txn.channel")}</TH>
                    <TH>{t("case.txn.direction")}</TH>
                    <TH>{t("case.txn.counterparty")}</TH>
                    <TH numeric>{t("case.txn.amount")}</TH>
                  </TR>
                </THead>
                <TBody>
                  {d.transactions.map((x) => (
                    <TR key={x.id}>
                      <TD className="whitespace-nowrap">{f.dateTime(x.at)}</TD>
                      <TD>{x.channel}</TD>
                      <TD>{x.direction === "CREDIT" ? t("case.txn.in") : t("case.txn.out")}</TD>
                      <TD className="max-w-40 truncate" title={x.counterparty}>
                        {x.counterparty || "—"}
                      </TD>
                      <TD numeric>
                        <Money amount={x.amount} focusable={false} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </Expander>
        )}
      </CaseSection>

      <CaseSection id="case-connected" title={t("case.connected")}>
        {d.connections ? (
          <MiniNetworkGraph
            nodes={d.connections.nodes.map((n) => ({ id: n.id, label: f.text(n.label), riskLevel: n.riskLevel, kind: n.kind }))}
            edges={d.connections.edges}
            onOpen={a.ringId ? () => navigate(`/rings?ring=${encodeURIComponent(a.ringId!)}`) : undefined}
            openLabel={t("graph.open")}
          />
        ) : (
          <p className="text-body text-muted">{t("case.noConnections")}</p>
        )}
      </CaseSection>

      <EvidenceSection alertId={a.id} />
    </div>
  );
}

/* ───────────── Evidence: shared state between the header button, the footer and the body ───────────── */

function sealFor(v: Verification | undefined, pending: boolean): SealState {
  if (pending) return "checking";
  if (!v) return "unchecked";
  return v.status === "MATCH" ? "verified" : v.status === "TAMPERED" ? "changed" : "unchecked";
}

function EvidenceSection({ alertId }: { alertId: string }) {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const evidence = useEvidence(alertId);
  const verification = useVerification(alertId);
  const verifying = useIsVerifying(alertId);
  const e = evidence.data as ((NonNullable<typeof evidence.data>) & { clientMs?: number }) | null | undefined;
  const seal = sealFor(verification.data, verifying);
  if (!e && seal === "unchecked") return null;
  // The badge only ever shows a measured time: the server's if it reports one, else our round trip.
  const ms = e?.generationMs ?? e?.clientMs ?? null;
  const since = verification.data?.createdAt ?? e?.createdAt;
  return (
    <CaseSection id="case-evidence" title={t("case.evidence")} aside={ms != null ? <SpeedBadge seconds={ms / 1000} /> : undefined}>
      <EvidenceSeal state={seal} since={since ? f.dateTime(since) : undefined} fingerprint={verification.data?.computedHash ?? e?.sha256 ?? undefined} />
      {USE_MOCKS && e && (
        <Button
          variant="link"
          size="sm"
          className="tech-only mt-2 text-small text-muted"
          onClick={() => void api.tamperEvidence(alertId).then(() => qc.removeQueries({ queryKey: ["verification", alertId] }))}
        >
          Demo: simulate someone editing the file
        </Button>
      )}
    </CaseSection>
  );
}

function DownloadButton({ alertId }: { alertId: string }) {
  const { t } = useTranslation();
  const created = useCreateEvidence(alertId);
  return (
    <Button
      size="sm"
      loading={created.isPending}
      onClick={() =>
        created.mutate(undefined, {
          onSuccess: (e) => {
            if (e.url) void api.downloadFile(e.url, `evidence_${alertId}.html`);
          },
          onError: () => toast.error(t("case.toast.evidenceFailed")),
        })
      }
    >
      {!created.isPending && <Download />}
      {t("case.action.download")}
    </Button>
  );
}

function Actions({ detail: d }: { detail: AlertDetail }) {
  const { t } = useTranslation();
  const { readOnly } = useSession();
  const id = d.alert.id;
  const feedback = useFeedback(id);
  const evidence = useEvidence(id);
  const creating = useIsCreatingEvidence(id);
  const verify = useVerifyEvidence(id);
  const [draftOpen, setDraftOpen] = useState(false);
  const verdict = d.alert.status === "CLOSED" ? d.alert.resolution : null;

  const send = (v: "FRAUD" | "NOT_FRAUD") =>
    feedback.mutate(
      { rating: v === "FRAUD" ? 5 : 1, verdict: v },
      {
        onSuccess: () => toast.success(t(v === "FRAUD" ? "case.toast.fraud" : "case.toast.notFraud")),
        onError: () => toast.error(t("case.toast.failed")),
      },
    );

  const guard = (node: React.ReactElement) =>
    readOnly ? (
      <Tooltip content={t("case.action.readOnly")}>
        <span tabIndex={0} className="inline-flex">
          {node}
        </span>
      </Tooltip>
    ) : (
      node
    );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {guard(
        <Button
          variant="danger-soft"
          size="sm"
          disabled={readOnly || feedback.isPending}
          aria-pressed={verdict === "TRUE_POSITIVE"}
          onClick={() => send("FRAUD")}
        >
          {verdict === "TRUE_POSITIVE" ? <Check /> : <AlertTriangle />}
          {t("case.action.fraud")}
        </Button>,
      )}
      {guard(
        <Button variant="ghost" size="sm" disabled={readOnly || feedback.isPending} aria-pressed={verdict === "FALSE_POSITIVE"} onClick={() => send("NOT_FRAUD")}>
          {verdict === "FALSE_POSITIVE" && <Check />}
          {t("case.action.notFraud")}
        </Button>,
      )}
      <div className="flex-1" />
      <Button
        variant="secondary"
        size="sm"
        loading={verify.isPending}
        disabled={creating}
        onClick={() => {
          if (!evidence.data) return void toast(t("case.toast.verifyFirst"));
          verify.mutate(undefined, { onError: () => toast.error(t("case.toast.failed")) });
        }}
      >
        {!verify.isPending && <ShieldCheck />}
        {t("case.action.verify")}
      </Button>
      {guard(
        <Button variant="secondary" size="sm" disabled={readOnly} onClick={() => setDraftOpen(true)}>
          <FileText />
          {t("case.action.draft")}
        </Button>,
      )}
      <DraftDialog alertId={draftOpen ? id : null} onClose={() => setDraftOpen(false)} />
    </div>
  );
}

function DraftDialog({ alertId, onClose }: { alertId: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const draft = useSTRDraft(alertId);
  return (
    <Dialog open={!!alertId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[min(720px,calc(100vw-32px))]">
        <DialogTitle className="pr-10 font-display text-h1 font-semibold">{t("case.draft.title")}</DialogTitle>
        <DialogDescription className="mt-1 text-body text-muted">{t("case.draft.hint")}</DialogDescription>
        <div className="mt-3">
          <TrustBadge kind="ai" />
        </div>
        <div className="mt-4">
          {draft.isLoading ? (
            <div className="space-y-2" aria-busy>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-4" style={{ width: `${90 - i * 8}%` }} />
              ))}
            </div>
          ) : draft.isError ? (
            <ErrorState compact message={t("case.draft.failed")} onRetry={() => void draft.refetch()} retrying={draft.isFetching} />
          ) : draft.data ? (
            <>
              <pre className="scrollbar-thin max-h-[55vh] overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-surface-2 p-4 font-sans text-body text-fg">
                {draft.data.str_draft}
              </pre>
              <div className="mt-4 flex justify-end">
                <Button
                  variant="secondary"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(draft.data.str_draft)
                      .then(() => toast.success(t("case.toast.copied")))
                      .catch(() => toast.error(t("case.toast.failed")))
                  }
                >
                  <Copy />
                  {t("case.draft.copy")}
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
