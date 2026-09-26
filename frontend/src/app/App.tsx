import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { QueryClientProvider } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ThemeProvider, useTheme } from "@/shared/lib/theme";
import { PresentationProvider } from "@/shared/lib/presentation";
import { Toaster } from "@/shared/ui/toaster";
import { TooltipProvider } from "@/shared/ui/tooltip";
import { createQueryClient } from "@/services/api/queries";
import { AppShell } from "./shell/AppShell";
import { ColdStartGate } from "./shell/ColdStartGate";
import { ROUTES, routeFor } from "./routes";

const StyleguidePage = lazy(() => import("@/pages/StyleguidePage"));
const NotFoundPage = lazy(() => import("@/pages/NotFoundPage"));
// Public pages: no sidebar/topbar chrome, and no health gate — the landing page is
// static copy, so a visitor should never wait on /healthz to read it.
const LandingPage = lazy(() => import("@/pages/LandingPage"));
const LoginPage = lazy(() => import("@/pages/LoginPage"));

const queryClient = createQueryClient();

function ThemedToaster() {
  const { theme } = useTheme();
  return <Toaster theme={theme} />;
}

/** Keeps the browser tab title in step with the screen. */
function DocumentTitle() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  useEffect(() => {
    const r = routeFor(pathname);
    document.title = r ? `${t(`page.${r.key}.title`)} · KAVACH` : "KAVACH";
  }, [pathname, t]);
  return null;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <PresentationProvider>
          <MotionConfig reducedMotion="user">
            <TooltipProvider delayDuration={250}>
              <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <DocumentTitle />
                <Routes>
                  <Route
                    path="/"
                    element={
                      <Suspense fallback={null}>
                        <LandingPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/login"
                    element={
                      <Suspense fallback={null}>
                        <LoginPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/styleguide"
                    element={
                      <Suspense fallback={null}>
                        <StyleguidePage />
                      </Suspense>
                    }
                  />
                  <Route
                    element={
                      <ColdStartGate>
                        <AppShell />
                      </ColdStartGate>
                    }
                  >
                    {ROUTES.map((r) => (
                      <Route key={r.key} path={r.path} element={<r.element />} />
                    ))}
                    <Route path="*" element={<NotFoundPage />} />
                  </Route>
                </Routes>
              </BrowserRouter>
              <ThemedToaster />
            </TooltipProvider>
          </MotionConfig>
        </PresentationProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
