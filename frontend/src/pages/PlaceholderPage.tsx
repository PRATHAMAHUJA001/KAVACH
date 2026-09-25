import { Hammer } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, EmptyState } from "@/shared/ui";

/** Stand-in until each screen's build step lands. */
export default function PlaceholderPage({ pageKey }: { pageKey: string }) {
  const { t } = useTranslation();
  return (
    <Card className="p-6" data-page={pageKey}>
      <EmptyState icon={Hammer} tone="neutral" title={t("page.building")} />
    </Card>
  );
}
