import { useEffect, useRef, useState } from "react";
import { CheckCircle2, FileUp, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Card, Stepper } from "@/shared/ui";
import { cn } from "@/shared/lib/cn";
import { ApiError, useJob, useRefreshRules, useUploadCircular } from "@/services/api";

const STEPS = ["reading", "obligations", "checks", "review"] as const;

/** DESIGN_SPEC §3.5: big dropzone → stepper → the new rules land in the review list. */
export function UploadCard({
  jobId,
  onJob,
  onReview,
  readOnly,
}: {
  jobId: string | null;
  onJob: (id: string | null) => void;
  onReview: (ruleIds: string[]) => void;
  readOnly: boolean;
}) {
  const { t } = useTranslation();
  const upload = useUploadCircular();
  const job = useJob(jobId);
  const refresh = useRefreshRules();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const done = job.data?.status === "COMPLETED";
  const failed = job.data?.status === "FAILED";

  useEffect(() => {
    if (done) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const send = (file: File | undefined) => {
    setLocalError(null);
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") return setLocalError(t("rulebook.upload.notPdf"));
    if (file.size > 10 * 1024 * 1024) return setLocalError(t("rulebook.upload.tooBig"));
    upload.mutate(file, {
      onSuccess: (r) => onJob(r.job_id),
      onError: (e) => setLocalError(e instanceof ApiError && e.kind !== "server" && e.kind !== "network" ? e.message : t("rulebook.upload.failed")),
    });
  };

  if (jobId && (job.data || job.isLoading)) {
    const step = job.data?.step ?? 0;
    return (
      <Card className="space-y-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-h2 font-semibold text-fg">{t("rulebook.upload.working")}</h2>
            <p className="text-body text-muted">{job.data?.message ?? t("common.loading")}</p>
          </div>
          {(done || failed) && (
            <Button variant="ghost" size="sm" onClick={() => onJob(null)}>
              {t("rulebook.upload.another")}
            </Button>
          )}
        </div>
        <Stepper steps={STEPS.map((k) => ({ key: k, label: t(`rulebook.upload.step.${k}`) }))} current={done ? STEPS.length : step} error={failed} />
        {done && job.data && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-ok-soft px-4 py-3 text-ok">
            <CheckCircle2 className="size-5" aria-hidden />
            <p className="flex-1 font-medium">
              {t("rulebook.upload.ready", { count: job.data.ruleIds.length, circular: job.data.circularNo ?? "" })}
            </p>
            {job.data.ruleIds.length > 0 && (
              <Button size="sm" onClick={() => onReview(job.data!.ruleIds)}>
                {t("rulebook.upload.review")}
              </Button>
            )}
          </div>
        )}
        {failed && (
          <p role="alert" className="flex items-center gap-2 rounded-xl bg-danger-soft px-4 py-3 font-medium text-danger">
            <XCircle className="size-5" aria-hidden />
            {job.data?.message}
          </p>
        )}
      </Card>
    );
  }

  return (
    <Card className="p-2" data-tour="upload">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          if (!readOnly) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!readOnly) send(e.dataTransfer.files[0]);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
          readOnly ? "cursor-not-allowed border-border opacity-70" : "cursor-pointer",
          over ? "border-brand bg-brand-soft/60" : "border-border hover:border-brand/50 hover:bg-surface-2/60",
        )}
      >
        <span className="inline-flex size-14 items-center justify-center rounded-full bg-brand-soft text-brand" aria-hidden>
          <FileUp className="size-7" strokeWidth={1.5} />
        </span>
        <span className="font-display text-h2 font-semibold text-fg">{t("rulebook.upload.title")}</span>
        <span className="max-w-lg text-body text-muted">{readOnly ? t("rulebook.readOnly") : t("rulebook.upload.hint")}</span>
        <input
          ref={input}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          disabled={readOnly || upload.isPending}
          onChange={(e) => {
            send(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <span className={cn("mt-1 inline-flex h-10 items-center rounded-control bg-brand px-4 text-body font-medium text-brand-fg", (readOnly || upload.isPending) && "opacity-60")}>
          {upload.isPending ? t("rulebook.upload.sending") : t("rulebook.upload.browse")}
        </span>
        {localError && (
          <span role="alert" className="text-body font-medium text-danger">
            {localError}
          </span>
        )}
      </label>
    </Card>
  );
}
