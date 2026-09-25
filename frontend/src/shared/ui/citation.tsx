import * as React from "react";
import { ScrollText, FlaskConical } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "./sheet";
import { Skeleton } from "./skeleton";
import { Tooltip } from "./tooltip";
import { Chip } from "./chip";

/** "KAVACH/2024/07" → "2024/07" */
export function shortCircular(circularNo: string): string {
  return circularNo.replace(/^KAVACH\//i, "");
}

export interface CitationRef {
  circularNo: string;
  paraNo: string | number;
}

/** 📜 Circular 2024/07 · ¶4 — click opens the paragraph. */
export const CitationChip = React.forwardRef<
  HTMLButtonElement,
  CitationRef & { onOpen?: () => void; className?: string }
>(({ circularNo, paraNo, onOpen, className }, ref) => {
  const { t } = useTranslation();
  const short = shortCircular(circularNo);
  return (
    <button
      ref={ref}
      type="button"
      onClick={onOpen}
      aria-label={t("citation.open", { circular: short, para: paraNo })}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full bg-info-soft px-2.5 text-small font-medium text-info",
        "transition-[filter,box-shadow] duration-200 hover:brightness-95 hover:ring-1 hover:ring-info/30 dark:hover:brightness-125",
        className,
      )}
    >
      <ScrollText className="size-3.5" strokeWidth={2} aria-hidden />
      <span>
        {t("citation.circular")} {short}
      </span>
      <span aria-hidden className="opacity-60">
        ·
      </span>
      <span>{t("citation.para", { para: paraNo })}</span>
    </button>
  );
});
CitationChip.displayName = "CitationChip";

function highlightText(text: string, highlight?: string): React.ReactNode {
  if (!highlight) return text;
  const idx = text.toLowerCase().indexOf(highlight.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-[4px] bg-warn-soft px-0.5 text-fg ring-1 ring-warn/30 dark:bg-warn/25 [box-decoration-break:clone]">
        {text.slice(idx, idx + highlight.length)}
      </mark>
      {text.slice(idx + highlight.length)}
    </>
  );
}

export interface CitationParagraph extends CitationRef {
  text: string;
  issueDate?: string;
  /** Neighbouring paragraphs for context, shown muted. */
  before?: { paraNo: string | number; text: string };
  after?: { paraNo: string | number; text: string };
}

/** Right drawer: the paragraph, the exact matching sentence highlighted, and a "Synthetic circular" label. */
export function CitationDrawer({
  open,
  onOpenChange,
  citation,
  paragraph,
  highlight,
  loading,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  citation: CitationRef | null;
  paragraph?: CitationParagraph | null;
  highlight?: string;
  loading?: boolean;
  error?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const short = citation ? shortCircular(citation.circularNo) : "";
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent width={520}>
        <div className="border-b border-border px-6 pb-5 pt-6 pr-16">
          <div className="flex items-center gap-2 text-info">
            <ScrollText className="size-5" strokeWidth={1.75} aria-hidden />
            <span className="label-caps">{t("citation.circular")}</span>
          </div>
          <SheetTitle className="mt-2 font-display text-h1 font-semibold">
            {citation ? t("citation.drawerTitle", { circular: short, para: citation.paraNo }) : ""}
          </SheetTitle>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Tooltip content={t("citation.syntheticHint")}>
              <span tabIndex={0} className="inline-flex">
                <Chip tone="warn" icon={<FlaskConical />}>
                  {t("citation.synthetic")}
                </Chip>
              </span>
            </Tooltip>
            {paragraph?.issueDate && (
              <span className="text-small text-muted">{t("citation.issued", { date: paragraph.issueDate })}</span>
            )}
          </div>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-6 py-6">
          <SheetDescription className="sr-only">{t("citation.matched")}</SheetDescription>
          {loading ? (
            <div className="space-y-3" aria-busy>
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-11/12" />
              <Skeleton className="h-5 w-4/5" />
              <Skeleton className="h-5 w-2/3" />
            </div>
          ) : error ? (
            error
          ) : paragraph ? (
            <div className="space-y-5">
              {paragraph.before && (
                <p className="text-body text-muted">
                  <span className="mr-2 font-semibold">¶{paragraph.before.paraNo}</span>
                  {paragraph.before.text}
                </p>
              )}
              <div className="rounded-xl border-l-4 border-info bg-info-soft/50 py-4 pl-5 pr-4">
                <p className="text-story text-fg">
                  <span className="mr-2 font-semibold text-info">¶{paragraph.paraNo}</span>
                  {highlightText(paragraph.text, highlight)}
                </p>
              </div>
              {highlight && <p className="text-small text-muted">{t("citation.matched")}</p>}
              {paragraph.after && (
                <p className="text-body text-muted">
                  <span className="mr-2 font-semibold">¶{paragraph.after.paraNo}</span>
                  {paragraph.after.text}
                </p>
              )}
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
