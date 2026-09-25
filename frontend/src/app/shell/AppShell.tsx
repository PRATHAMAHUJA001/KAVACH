import { Suspense, useState } from "react";
import { useLocation, useNavigate, useOutlet } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { pageVariants } from "@/shared/lib/motion";
import { useHotkeys } from "@/shared/lib/useHotkeys";
import { usePresentation, CursorSpotlight } from "@/shared/lib/presentation";
import { useSession } from "@/features/session";
import { routeFor, ROUTES } from "../routes";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { SearchPalette } from "./SearchPalette";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { Footer, ReviewerBanner } from "./Chrome";
import { ErrorBoundary } from "./ErrorBoundary";
import { PageSkeleton } from "./PageSkeleton";

function useStoredFlag(key: string, initial: boolean): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(() => {
    try {
      const s = localStorage.getItem(key);
      return s == null ? initial : s === "1";
    } catch {
      return initial;
    }
  });
  return [
    v,
    (next) => {
      setV(next);
      try {
        localStorage.setItem(key, next ? "1" : "0");
      } catch {
        /* ignore */
      }
    },
  ];
}

export function AppShell() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const outlet = useOutlet();
  const { toggle: togglePresenting } = usePresentation();
  const { readOnly } = useSession();
  const [collapsed, setCollapsed] = useStoredFlag("kavach.sidebarCollapsed", false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const route = routeFor(location.pathname);
  const title = route ? t(`page.${route.key}.title`) : t("page.notFound.title");
  const subtitle = route ? t(`page.${route.key}.subtitle`) : t("page.notFound.subtitle");

  useHotkeys({
    ...Object.fromEntries(ROUTES.map((r) => [`g ${r.hotkey}`, () => navigate(r.path)])),
    "/": () => setSearchOpen(true),
    "?": () => setHelpOpen((o) => !o),
    p: () => togglePresenting(),
  });

  return (
    <div className="flex min-h-screen">
      <a
        href="#main"
        className="sr-only z-[90] rounded-control bg-brand px-4 py-2 text-brand-fg focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        {t("shell.skip")}
      </a>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar title={title} subtitle={subtitle} onSearch={() => setSearchOpen(true)} />
        {readOnly && <ReviewerBanner />}
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1400px] flex-1 px-8 py-6 outline-none">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={location.pathname} variants={pageVariants} initial="initial" animate="animate" exit="exit">
              <ErrorBoundary>
                <Suspense fallback={<PageSkeleton />}>{outlet}</Suspense>
              </ErrorBoundary>
            </motion.div>
          </AnimatePresence>
        </main>
        <Footer />
      </div>
      <SearchPalette open={searchOpen} onOpenChange={setSearchOpen} />
      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
      <CursorSpotlight />
    </div>
  );
}
