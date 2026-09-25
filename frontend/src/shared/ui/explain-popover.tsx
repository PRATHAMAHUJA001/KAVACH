import { Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

/** ⓘ next to any technical term → a 1–2 sentence plain explanation. */
export function ExplainPopover({
  term,
  children,
  className,
}: {
  term: string;
  /** The plain explanation. */
  children: React.ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "inline-flex size-6 shrink-0 items-center justify-center rounded-full align-middle text-muted transition-colors hover:bg-surface-2 hover:text-brand",
          className,
        )}
        aria-label={`${term} — ${t("common.learnMore")}`}
      >
        <Info className="size-4" strokeWidth={1.75} />
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <p className="font-semibold text-fg">{term}</p>
        <div className="mt-1 text-body text-muted">{children}</div>
      </PopoverContent>
    </Popover>
  );
}
