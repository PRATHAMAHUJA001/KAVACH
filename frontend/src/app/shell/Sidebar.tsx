import { NavLink } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { Kbd, Tooltip } from "@/shared/ui";
import { useHome } from "@/services/api";
import { ROUTES } from "../routes";
import { Logo } from "./Logo";

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const home = useHome();
  const actNow = home.data?.kpis ? home.data.kpis.reportsOverdue + home.data.kpis.reportsDue48h : 0;

  return (
    <aside
      className={cn(
        "sticky top-0 z-40 flex h-screen shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200 ease-out",
        collapsed ? "w-[72px]" : "w-[248px]",
      )}
    >
      <div className={cn("flex h-16 items-center border-b border-border", collapsed ? "justify-center px-0" : "px-5")}>
        <Logo collapsed={collapsed} />
      </div>
      <nav aria-label={t("nav.label")} className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin">
        <ul className="space-y-1">
          {ROUTES.map((r) => {
            const Icon = r.icon;
            const badge = r.key === "alerts" && actNow > 0 ? actNow : 0;
            const link = (
              <NavLink
                to={r.path}
                className={({ isActive }) =>
                  cn(
                    "group relative flex h-10 items-center gap-3 rounded-control text-body font-medium transition-colors duration-200",
                    collapsed ? "justify-center px-0" : "px-3",
                    isActive ? "bg-brand-soft text-brand" : "text-muted hover:bg-surface-2 hover:text-fg",
                  )
                }
                aria-label={collapsed ? t(`nav.${r.key}`) : undefined}
              >
                {({ isActive }) => (
                  <>
                    {isActive && <span className="absolute -left-3 top-2 h-6 w-1 rounded-r-full bg-brand" aria-hidden />}
                    <Icon className="size-5 shrink-0" strokeWidth={isActive ? 2 : 1.75} aria-hidden />
                    {!collapsed && <span className="flex-1 truncate">{t(`nav.${r.key}`)}</span>}
                    {badge > 0 && (
                      <span
                        className={cn(
                          "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[0.6875rem] font-bold text-white tnum dark:text-[#1a0606]",
                          collapsed && "absolute right-1.5 top-1",
                        )}
                        aria-label={t("nav.actNow", { count: badge })}
                      >
                        {badge}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            );
            return (
              <li key={r.key}>
                {collapsed ? (
                  <Tooltip content={t(`nav.${r.key}`)} side="right">
                    {link}
                  </Tooltip>
                ) : (
                  link
                )}
              </li>
            );
          })}
        </ul>
      </nav>
      <div className={cn("border-t border-border p-3", collapsed && "flex flex-col items-center")}>
        {!collapsed && (
          <p className="mb-2 flex items-center gap-1.5 px-3 text-small text-muted">
            <Kbd>?</Kbd> {t("shell.shortcuts")}
          </p>
        )}
        <Tooltip content={collapsed ? t("nav.expand") : undefined} side="right">
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}
            aria-expanded={!collapsed}
            className={cn(
              "flex h-10 items-center gap-3 rounded-control text-body font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg",
              collapsed ? "w-10 justify-center" : "w-full px-3",
            )}
          >
            {collapsed ? <PanelLeftOpen className="size-5" strokeWidth={1.75} /> : <PanelLeftClose className="size-5" strokeWidth={1.75} />}
            {!collapsed && t("nav.collapse")}
          </button>
        </Tooltip>
      </div>
    </aside>
  );
}
