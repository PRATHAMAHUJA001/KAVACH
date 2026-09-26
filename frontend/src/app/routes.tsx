import { lazy } from "react";
import { Bell, CalendarClock, History, MessagesSquare, Network, ScrollText, type LucideIcon } from "lucide-react";

export interface AppRoute {
  path: string;
  key: "today" | "alerts" | "ask" | "rings" | "rulebook" | "timeMachine";
  icon: LucideIcon;
  /** Two-key shortcut after "g". */
  hotkey: string;
  element: React.LazyExoticComponent<React.ComponentType>;
}

/** Sidebar order follows DESIGN_SPEC §3. */
export const ROUTES: AppRoute[] = [
  { path: "/today", key: "today", icon: CalendarClock, hotkey: "t", element: lazy(() => import("@/pages/TodayPage")) },
  { path: "/alerts", key: "alerts", icon: Bell, hotkey: "a", element: lazy(() => import("@/pages/AlertsPage")) },
  { path: "/ask", key: "ask", icon: MessagesSquare, hotkey: "k", element: lazy(() => import("@/pages/AskPage")) },
  { path: "/rings", key: "rings", icon: Network, hotkey: "r", element: lazy(() => import("@/pages/RingsPage")) },
  { path: "/rulebook", key: "rulebook", icon: ScrollText, hotkey: "b", element: lazy(() => import("@/pages/RulebookPage")) },
  { path: "/time-machine", key: "timeMachine", icon: History, hotkey: "m", element: lazy(() => import("@/pages/TimeMachinePage")) },
];

export function routeFor(pathname: string): AppRoute | undefined {
  return ROUTES.find((r) => pathname === r.path || pathname.startsWith(`${r.path}/`));
}
