import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Code2, FlaskConical, History, ScrollText, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Card,
  Chip,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  EmptyState,
  ErrorState,
  Expander,
  FilterChips,
  Skeleton,
  Textarea,
  Tooltip,
  shortCircular,
  toast,
} from "@/shared/ui";
import { cn } from "@/shared/lib/cn";
import { useFormat } from "@/shared/lib/i18n";
import type { Rule } from "@/services/api";
import { useParagraph, useRuleDecision } from "@/services/api";
import { useSession } from "@/features/session";
import { STATUS_TONE, ruleTitle } from "./labels";

export type ReviewFilter = "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "all" | "upload";

function highlightIn(text: string, h: string | null | undefined) {
  if (!h) return text;
  const i = text.toLowerCase().indexOf(h.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-[4px] bg-warn-soft px-0.5 text-fg ring-1 ring-warn/30 dark:bg-warn/25 [box-decoration-break:clone]">{text.slice(i, i + h.length)}</mark>
      {text.slice(i + h.length)}
    </>
  );
}

function SourcePanel({ rule }: { rule: Rule }) {
  const { t } = useTranslation();
  const f = useFormat();
  const para = useParagraph(rule.citation?.circularNo ?? null, rule.citation?.paraNo ?? null);
  const text = para.data?.text ?? rule.sourceQuote ?? "";
  return (
    <section aria-labelledby="src-h" className="space-y-3">
      <div className="flex items-center gap-2 text-info">
        <ScrollText className="size-5" strokeWidth={1.75} aria-hidden />
        <h3 id="src-h" className="label-caps">
          {t("rulebook.review.source")}
        </h3>
      </div>
      {rule.citation && (
        <p className="font-display text-h2 font-semibold text-fg">
          {t("citation.drawerTitle", { circular: shortCircular(rule.citation.circularNo), para: rule.citation.paraNo })}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="warn" icon={<FlaskConical />}>
          {t("citation.synthetic")}
        </Chip>
        {para.data?.issueDate && <span className="text-small text-muted">{t("citation.issued", { date: f.date(para.data.issueDate) })}</span>}
      </div>
      {para.isLoading && !text ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      ) : text ? (
        <div className="rounded-xl border-l-4 border-info bg-info-soft/50 py-4 pl-5 pr-4">
          <p className="text-story text-fg">{highlightIn(text, rule.highlight)}</p>
        </div>
      ) : (
        <p className="text-body text-muted">{t("rulebook.review.noSource")}</p>
      )}
      {rule.highlight && text && <p className="text-small text-muted">{t("citation.matched")}</p>}
    </section>
  );
}

function RulePanel({ rule }: { rule: Rule }) {
  const { t } = useTranslation();
  const f = useFormat();
  const { me, readOnly } = useSession();
  const decide = useRuleDecision();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const user = me?.email || me?.name || "analyst";
  const pending = rule.status === "PENDING_APPROVAL";

  const approve = () =>
    decide.mutate(
      { id: rule.id, user, decision: "approve" },
      { onSuccess: () => toast.success(t("rulebook.toast.approved")), onError: () => toast.error(t("case.toast.failed")) },
    );
  const reject = () =>
    decide.mutate(
      { id: rule.id, user, decision: "reject", reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success(t("rulebook.toast.rejected"));
          setRejecting(false);
          setReason("");
        },
        onError: () => toast.error(t("case.toast.failed")),
      },
    );
  const guard = (node: React.ReactElement) =>
    readOnly ? (
      <Tooltip content={t("rulebook.readOnly")}>
        <span tabIndex={0} className="inline-flex">
          {node}
        </span>
      </Tooltip>
    ) : (
      node
    );

  return (
    <section aria-labelledby="rule-h" className="space-y-4" data-tour="rule-review">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="rule-h" className="label-caps text-muted">
          {t("rulebook.review.check")}
        </h3>
        <Chip tone={STATUS_TONE[rule.status as keyof typeof STATUS_TONE] ?? "neutral"}>{t(`rulebook.status.${rule.status}`, { defaultValue: rule.status })}</Chip>
        {rule.severity && <Chip tone="neutral">{t(`rulebook.severity.${rule.severity}`, { defaultValue: rule.severity })}</Chip>}
      </div>
      <p className="font-display text-h1 font-semibold leading-snug text-fg">{rule.plain ? f.text(rule.plain) : ruleTitle(rule, t)}</p>
      {rule.params.length > 0 && (
        <dl className="flex flex-wrap gap-2">
          {rule.params.map((p) => (
            <div key={p.key} className="rounded-lg border border-border px-3 py-1.5">
              <dt className="text-small text-muted">{f.text(p.label)}</dt>
              <dd className="font-semibold text-fg tnum">{p.unit === "inr" ? f.money(p.value) : f.number(p.value)}</dd>
            </div>
          ))}
        </dl>
      )}
      {rule.approvedBy && rule.status === "APPROVED" && <p className="text-small text-muted">{t("rulebook.review.approvedBy", { who: rule.approvedBy })}</p>}
      {rule.rejectionReason && rule.status === "REJECTED" && (
        <p className="rounded-xl bg-danger-soft/60 px-4 py-3 text-body text-fg">
          <span className="font-semibold">{t("rulebook.review.rejectedBecause")}</span> {rule.rejectionReason}
        </p>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        {guard(
          <Button variant="ok-soft" onClick={approve} disabled={readOnly || decide.isPending || rule.status === "APPROVED"} loading={decide.isPending && decide.variables?.decision === "approve"}>
            <Check />
            {t("rulebook.action.approve")}
          </Button>,
        )}
        <Button asChild variant="secondary">
          <Link to={`/time-machine?rule=${encodeURIComponent(rule.id)}`}>{t("rulebook.action.edit")}</Link>
        </Button>
        {guard(
          <Button variant="danger-soft" onClick={() => setRejecting(true)} disabled={readOnly || decide.isPending || rule.status === "REJECTED"}>
            <X />
            {t("rulebook.action.reject")}
          </Button>,
        )}
      </div>
      {pending && <p className="text-small text-muted">{t("rulebook.review.editHint")}</p>}
      <Expander className="tech-only" icon={<Code2 />} title={t("rulebook.review.engineers")}>
        <p className="mb-2 font-mono text-small text-muted">{rule.name}</p>
        <pre className="scrollbar-thin max-h-72 overflow-auto whitespace-pre font-mono text-[0.8125rem] leading-relaxed text-fg">{rule.sql.trim()}</pre>
      </Expander>

      <Dialog open={rejecting} onOpenChange={setRejecting}>
        <DialogContent>
          <DialogTitle className="pr-10 font-display text-h1 font-semibold">{t("rulebook.reject.title")}</DialogTitle>
          <DialogDescription className="mt-1 text-body text-muted">{t("rulebook.reject.hint")}</DialogDescription>
          <Textarea className="mt-4" rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("rulebook.reject.placeholder")} aria-label={t("rulebook.reject.title")} />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRejecting(false)}>
              {t("rulebook.reject.cancel")}
            </Button>
            <Button variant="danger" onClick={reject} disabled={!reason.trim()} loading={decide.isPending}>
              {t("rulebook.action.reject")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function RuleReview({
  rules,
  isLoading,
  isError,
  onRetry,
  filter,
  onFilter,
  selectedId,
  onSelect,
  onVersions,
  uploadIds,
}: {
  rules: Rule[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  filter: ReviewFilter;
  onFilter: (f: ReviewFilter) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onVersions: (id: string) => void;
  uploadIds: string[] | null;
}) {
  const { t } = useTranslation();
  if (isError && !rules) return <ErrorState onRetry={onRetry} />;
  const all = rules ?? [];
  const count = (s: string) => all.filter((r) => r.status === s).length;
  const shown = filter === "upload" && uploadIds ? all.filter((r) => uploadIds.includes(r.id)) : filter === "all" || filter === "upload" ? all : all.filter((r) => r.status === filter);
  const sel = shown.find((r) => r.id === selectedId) ?? shown[0] ?? null;

  return (
    <div className="grid grid-cols-12 gap-6">
      <Card className="col-span-12 overflow-hidden p-0 xl:col-span-4">
        <div className="border-b border-border p-4">
          <FilterChips<ReviewFilter>
            label={t("rulebook.filter.label")}
            value={filter}
            onChange={onFilter}
            options={[
              ...(uploadIds ? [{ value: "upload" as const, label: t("rulebook.filter.upload"), count: uploadIds.length }] : []),
              { value: "PENDING_APPROVAL", label: t("rulebook.filter.pending"), count: count("PENDING_APPROVAL") },
              { value: "APPROVED", label: t("rulebook.filter.approved"), count: count("APPROVED") },
              { value: "REJECTED", label: t("rulebook.filter.rejected"), count: count("REJECTED") },
              { value: "all", label: t("rulebook.filter.all") },
            ]}
          />
        </div>
        {isLoading && !rules ? (
          <div className="space-y-3 p-4" aria-busy>
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <EmptyState icon={Check} tone="ok" title={t("rulebook.review.empty")} compact />
        ) : (
          <ul role="listbox" aria-label={t("rulebook.review.listLabel")} className="max-h-[36rem] divide-y divide-border overflow-y-auto">
            {shown.map((r) => {
              const active = r.id === sel?.id;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => onSelect(r.id)}
                    className={cn("flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors", active ? "bg-brand-soft/60" : "hover:bg-surface-2/60")}
                  >
                    <span className="text-body font-medium text-fg">{ruleTitle(r, t)}</span>
                    <span className="flex items-center gap-2">
                      <Chip tone={STATUS_TONE[r.status as keyof typeof STATUS_TONE] ?? "neutral"} className="h-5 text-[0.6875rem]">
                        {t(`rulebook.status.${r.status}`, { defaultValue: r.status })}
                      </Chip>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Card className="col-span-12 p-6 xl:col-span-8">
        {sel ? (
          <>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
              <h2 className="text-h2 font-semibold text-fg">{ruleTitle(sel, t)}</h2>
              <Button variant="ghost" size="sm" onClick={() => onVersions(sel.id)}>
                <History />
                {t("rulebook.review.history")}
              </Button>
            </div>
            <div className="grid gap-8 lg:grid-cols-2">
              <SourcePanel rule={sel} />
              <RulePanel key={sel.id} rule={sel} />
            </div>
          </>
        ) : isLoading ? (
          <Skeleton className="h-80" />
        ) : (
          <EmptyState icon={ScrollText} tone="neutral" title={t("rulebook.review.pick")} compact />
        )}
      </Card>
    </div>
  );
}
