import { Component, type ErrorInfo, type ReactNode } from "react";
import { Bug, Home, RotateCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Card } from "@/shared/ui";

function Fallback() {
  const { t } = useTranslation();
  return (
    <Card role="alert" className="mx-auto max-w-lg p-8 text-center">
      <span className="mx-auto inline-flex size-14 items-center justify-center rounded-full bg-danger-soft text-danger" aria-hidden>
        <Bug className="size-7" strokeWidth={1.75} />
      </span>
      <h2 className="mt-5 text-h2 font-semibold">{t("shell.crash")}</h2>
      <p className="mt-2 text-body text-muted">{t("shell.crashBody")}</p>
      <div className="mt-6 flex justify-center gap-2">
        <Button variant="secondary" onClick={() => window.location.assign("/today")}>
          <Home />
          {t("shell.home")}
        </Button>
        <Button onClick={() => window.location.reload()}>
          <RotateCw />
          {t("shell.reload")}
        </Button>
      </div>
    </Card>
  );
}

/** Contains a crash to the current screen; the shell (nav, search) keeps working. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Screen crashed", error, info.componentStack);
  }
  render() {
    return this.state.failed ? <Fallback /> : this.props.children;
  }
}
