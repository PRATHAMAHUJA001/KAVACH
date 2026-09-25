import { Compass } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, Card, EmptyState } from "@/shared/ui";

export default function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <Card className="p-6">
      <EmptyState
        icon={Compass}
        title={t("page.notFound.subtitle")}
        action={
          <Button asChild>
            <Link to="/today">{t("page.notFound.action")}</Link>
          </Button>
        }
      />
    </Card>
  );
}
