import { NotebookText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardHeader, Skeleton } from "@/shared/ui";
import { useFormat } from "@/shared/lib/i18n";
import type { Home } from "@/services/api";

export function BriefCard({ home }: { home: Home | undefined }) {
  const { t } = useTranslation();
  const f = useFormat();
  if (home && !home.brief) return null;
  return (
    <Card className="flex h-full flex-col p-6">
      <CardHeader
        title={t("today.brief.title")}
        action={
          <span className="inline-flex size-9 items-center justify-center rounded-xl bg-brand-soft text-brand" aria-hidden>
            <NotebookText className="size-[18px]" strokeWidth={1.75} />
          </span>
        }
        className="mb-4"
      />
      {home?.brief ? (
        <>
          <p className="flex-1 text-story text-fg">{f.text(home.brief.text)}</p>
          <p className="mt-4 text-small text-muted">{t("today.brief.source", { when: f.dateTime(home.brief.generatedAt) })}</p>
        </>
      ) : (
        <div className="space-y-2.5" aria-hidden>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      )}
    </Card>
  );
}
