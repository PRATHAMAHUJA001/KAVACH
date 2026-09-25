import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { ThemeProvider, useTheme } from "@/shared/lib/theme";
import { Toaster } from "@/shared/ui/toaster";
import { TooltipProvider } from "@/shared/ui/tooltip";

const StyleguidePage = lazy(() => import("@/pages/StyleguidePage"));

function ThemedToaster() {
  const { theme } = useTheme();
  return <Toaster theme={theme} />;
}

export function App() {
  return (
    <ThemeProvider>
      <MotionConfig reducedMotion="user">
        <TooltipProvider delayDuration={250}>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Suspense fallback={null}>
              <Routes>
                <Route path="/styleguide" element={<StyleguidePage />} />
                <Route path="*" element={<Navigate to="/styleguide" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
          <ThemedToaster />
        </TooltipProvider>
      </MotionConfig>
    </ThemeProvider>
  );
}
