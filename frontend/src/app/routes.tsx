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

const page = (key: AppRoute["key"]) => lazy(() => import("@/pages/PlaceholderPage").then((m) => ({ default: () => <m.default pageKey={key} /> })));

/** Sidebar order follows DESIGN_SPEC §3. Pages are swapped in as each build step lands. */
export const ROUTES: AppRoute[] = [
  { path: "/today", key: "today", icon: CalendarClock, hotkey: "t", element: page("today") },
  { path: "/alerts", key: "alerts", icon: Bell, hotkey: "a", element: page("alerts") },
  { path: "/ask", key: "ask", icon: MessagesSquare, hotkey: "k", element: page("ask") },
  { path: "/rings", key: "rings", icon: Network, hotkey: "r", element: page("rings") },
  { path: "/rulebook", key: "rulebook", icon: ScrollText, hotkey: "b", element: page("rulebook") },
  { path: "/time-machine", key: "timeMachine", icon: History, hotkey: "m", element: page("timeMachine") },
];

export function routeFor(pathname: string): AppRoute | undefined {
  return ROUTES.find((r) => pathname === r.path || pathname.startsWith(`${r.path}/`));
}
